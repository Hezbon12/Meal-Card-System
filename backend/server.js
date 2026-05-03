/**
 * ShuleMeal Cards — Backend Server
 * Production-hardened: rate limiting, helmet, input validation,
 * CORS locked to env, secrets from env, subscription enforcement.
 */

"use strict";

require("dotenv").config(); // load .env file if present

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { body, param, validationResult } = require("express-validator");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// ─── Kenyan phone number validation regex ──────
// Supports: +2547XX, +2541XX, 07XX, 01XX, 7XX, 1XX formats
const KENYAN_PHONE_REGEX = /^(?:\+254|254|0)?(?:7\d{2}|1\d{2})\d{6}$/;

function isValidKenyanPhone(phone) {
  if (typeof phone !== "string") return false;
  const cleaned = phone.replace(/[\s\-()]/g, "");
  return KENYAN_PHONE_REGEX.test(cleaned);
}

// ─── ADM number validation ──────
// School-specific format: letters, numbers, hyphens, underscores only
function isValidAdm(adm) {
  if (typeof adm !== "string" || adm.length === 0 || adm.length > 30)
    return false;
  return /^[a-zA-Z0-9\-_]+$/.test(adm);
}

// ─── HTML sanitizer (strips tags to prevent stored XSS) ──────
function stripHtml(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/<[^>]*>/g, "") // strip all HTML tags
    .replace(/javascript:/gi, "") // strip javascript: URIs
    .replace(/on\w+\s*=/gi, "") // strip event handlers (onclick=, onerror=, etc.)
    .trim();
}

// Custom validator: reject strings containing HTML tags or script patterns
const noHtml = (body) =>
  body.custom((val) => {
    if (/<[^>]+>|javascript:|on\w+\s*=/i.test(val))
      throw new Error("Invalid characters in input");
    return true;
  });

// ─── Environment / Config ─────────────────────────────────────
const PORT = process.env.PORT || 5000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*"; // set to your domain in prod
const DB_PATH = process.env.DB_PATH || "./database.sqlite";

const JWT_SECRET = process.env.JWT_SECRET;
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

if (
  !JWT_SECRET ||
  JWT_SECRET === "shulemeal-super-secret-change-in-production"
) {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "FATAL: JWT_SECRET environment variable must be set in production.",
    );
    process.exit(1);
  } else {
    console.warn(
      "WARNING: JWT_SECRET not set. Using insecure default — DO NOT use in production.",
    );
  }
}
if (!SUPER_ADMIN_PASSWORD || SUPER_ADMIN_PASSWORD === "superadmin2026") {
  if (process.env.NODE_ENV === "production") {
    console.error(
      "FATAL: SUPER_ADMIN_PASSWORD environment variable must be set in production.",
    );
    process.exit(1);
  } else {
    console.warn(
      "WARNING: SUPER_ADMIN_PASSWORD not set. Using insecure default.",
    );
  }
}

const _JWT_SECRET = JWT_SECRET || "shulemeal-super-secret-change-in-production";
const _SUPER_ADMIN_PASSWORD = SUPER_ADMIN_PASSWORD || "superadmin2026";

// Pre-hash super admin password at startup for constant-time comparison
let _SUPER_ADMIN_HASH = null;
bcrypt.hash(_SUPER_ADMIN_PASSWORD, 12).then((h) => {
  _SUPER_ADMIN_HASH = h;
});

// ─── App setup ────────────────────────────────────────────────
const app = express();

// Disable ETag header — prevents cache-based information leakage
app.set("etag", false);

// Security headers
app.use(
  helmet({
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  }),
);

// CORS — locked to ALLOWED_ORIGIN in production
app.use(
  cors({
    origin:
      ALLOWED_ORIGIN === "*"
        ? "*"
        : ALLOWED_ORIGIN.split(",").map((s) => s.trim()),
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Body parsing — limit payload size to prevent abuse
app.use(express.json({ limit: "50kb" }));

// Middleware to verify request signature for sensitive operations
function verifyRequestSignature(req, res, next) {
  const signature = req.headers["x-request-signature"];
  const timestamp = req.headers["x-request-timestamp"];

  if (!signature || !timestamp) {
    // Signature is optional for non-sensitive operations
    return next();
  }

  try {
    const now = Date.now();
    const ts = parseInt(timestamp, 10);
    // Reject timestamps older than 5 minutes to prevent replay attacks
    if (Math.abs(now - ts) > 5 * 60 * 1000) {
      return res.status(401).json({ error: "Request timestamp expired" });
    }

    const expectedSignature = crypto
      .createHmac("sha256", _JWT_SECRET)
      .update(JSON.stringify(req.body) + timestamp)
      .digest("hex");

    if (signature !== expectedSignature) {
      return res.status(401).json({ error: "Invalid request signature" });
    }

    req.signatureVerified = true;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Signature verification failed" });
  }
}

// Apply signature verification to sensitive endpoints
app.post("/api/transactions", verifyRequestSignature);
app.delete("/api/transactions/:id", verifyRequestSignature);
app.put("/api/transactions/:id", verifyRequestSignature);

// ─── Rate Limiters ────────────────────────────────────────────
// Strict limit on auth endpoints — 10 attempts per 15 min per IP
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many login attempts. Please try again in 15 minutes.",
  },
});

// General API limit — 200 requests per minute per IP
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});

// Signup form — max 5 per hour per IP (prevents email spam)
const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many signup requests. Please try again later." },
});

app.use("/api/", apiLimiter);
app.use("/api/auth/login", authLimiter);
app.use("/api/superadmin/login", authLimiter);
app.use("/api/signup", signupLimiter);

// Prevent caching of all API responses (student data must never be cached)
app.use("/api/", (req, res, next) => {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  next();
});

// ─── Database ─────────────────────────────────────────────────
const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("./database.sqlite", (err) => {
  if (err) console.error("❌ SQLite connection failed:", err.message);
  else console.log("✅ Connected to SQLite: ./database.sqlite");
});

// Enable WAL mode for better concurrent read performance
db.run("PRAGMA journal_mode=WAL;", (err) => {
  if (err) console.error("Failed to set WAL mode:", err);
});

db.run("PRAGMA foreign_keys=ON;", (err) => {
  if (err) console.error("Failed to enable foreign keys:", err);
});

const generateToken = () => crypto.randomBytes(16).toString("hex");

// Initialize database schema
const initSchema = () => {
  // Use db.serialize to ensure tables are created safely in order
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS schools (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      username TEXT UNIQUE NOT NULL,
      adminPasswordHash TEXT NOT NULL,
      teacherPasswordHash TEXT NOT NULL,
      plan TEXT DEFAULT 'trial',
      subscriptionExpiry TEXT DEFAULT NULL,
      gracePeriodDays INTEGER DEFAULT 7,
      trialEndsAt TEXT DEFAULT NULL,
      createdAt TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id INTEGER NOT NULL,
      studentName TEXT NOT NULL,
      adm TEXT NOT NULL,
      amount REAL NOT NULL,
      durationWeeks INTEGER,
      paidDate TEXT,
      dueDate TEXT NOT NULL,
      status TEXT DEFAULT 'Active',
      cardToken TEXT,
      FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id INTEGER NOT NULL,
      adm TEXT,
      scanDate TEXT,
      mealDate TEXT,
      status TEXT,
      FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      target TEXT,
      detail TEXT,
      ipAddress TEXT,
      userAgent TEXT,
      userId TEXT,
      performedAt TEXT DEFAULT (datetime('now'))
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      ipAddress TEXT,
      attemptedAt TEXT DEFAULT (datetime('now')),
      success INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS refresh_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expiresAt TEXT NOT NULL,
      used INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS card_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      primaryColor TEXT DEFAULT '#4f46e5',
      secondaryColor TEXT DEFAULT '#818cf8',
      backgroundColor TEXT DEFAULT '#ffffff',
      textColor TEXT DEFAULT '#1f2937',
      logoPath TEXT,
      logoData BLOB,
      showSchoolName INTEGER DEFAULT 1,
      showStudentPhoto INTEGER DEFAULT 0,
      qrPosition TEXT DEFAULT 'right',
      borderRadius INTEGER DEFAULT 12,
      fontSize INTEGER DEFAULT 14,
      isDefault INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE
    )`);

    // Create indexes
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_transactions_school ON transactions(school_id)`,
    );
    db.run(`CREATE INDEX IF NOT EXISTS idx_scans_school ON scans(school_id)`);
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_transactions_token ON transactions(cardToken)`,
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_scans_meal_date ON scans(school_id, adm, mealDate)`,
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_audit_log_performed_at ON audit_log(performedAt)`,
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts(username)`,
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ipAddress)`,
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token)`,
    );
    db.run(
      `CREATE INDEX IF NOT EXISTS idx_card_templates_school ON card_templates(school_id)`,
    );

    // Schema migrations — Use callbacks to safely catch and ignore "duplicate column" errors
    const migrations = [
      `ALTER TABLE schools ADD COLUMN passwordChangedAt TEXT DEFAULT NULL`,
      `ALTER TABLE transactions ADD COLUMN school_id INTEGER DEFAULT 1`,
      `ALTER TABLE scans ADD COLUMN school_id INTEGER DEFAULT 1`,
      `ALTER TABLE scans ADD COLUMN mealDate TEXT`,
      `ALTER TABLE transactions ADD COLUMN cardToken TEXT`,
      `ALTER TABLE audit_log ADD COLUMN ipAddress TEXT`,
      `ALTER TABLE audit_log ADD COLUMN userAgent TEXT`,
      `ALTER TABLE audit_log ADD COLUMN userId TEXT`,
    ];

    migrations.forEach((sql) => {
      db.run(sql, (err) => {
        /* Silently ignore duplicate column errors */
      });
    });

    // Data backfills
    db.run(
      `UPDATE schools SET adminPasswordHash = passwordHash WHERE adminPasswordHash IS NULL`,
      (err) => {},
    );
    db.run(
      `UPDATE schools SET teacherPasswordHash = passwordHash WHERE teacherPasswordHash IS NULL`,
      (err) => {},
    );
    db.run(
      `UPDATE schools SET trialEndsAt = date(createdAt, '+30 days') WHERE trialEndsAt IS NULL`,
      (err) => {},
    );

    // Backfill cardToken for existing transactions using correct sqlite3 syntax
    db.all(
      `SELECT id FROM transactions WHERE cardToken IS NULL`,
      [],
      (err, rows) => {
        if (rows && rows.length > 0) {
          rows.forEach((row) => {
            db.run(`UPDATE transactions SET cardToken = ? WHERE id = ?`, [
              generateToken(),
              row.id,
            ]);
          });
          console.log(
            `✅ Backfilled cardToken for ${rows.length} old records.`,
          );
        }
      },
    );
  });
};

initSchema();

// ─── Validation helper ────────────────────────────────────────
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty())
    return res.status(400).json({ error: errors.array()[0].msg });
  next();
}

// ─── No-cache middleware for authenticated routes ─────────────
function noCache(req, res, next) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  next();
}

// ─── Auth Middleware ──────────────────────────────────────────
function requireAuth(req, res, next) {
  // Prevent caching of authenticated responses
  res.setHeader(
    "Cache-Control",
    "no-store, no-cache, must-revalidate, private",
  );
  res.setHeader("Pragma", "no-cache");
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(header.slice(7), _JWT_SECRET);
    // Check if password was changed after this token was issued
    db.get(
      `SELECT passwordChangedAt FROM schools WHERE id = ?`,
      [payload.schoolId],
      (err, school) => {
        if (err || !school)
          return res.status(401).json({ error: "Unauthorized" });
        if (
          school.passwordChangedAt &&
          payload.iat < new Date(school.passwordChangedAt).getTime() / 1000
        ) {
          return res
            .status(401)
            .json({ error: "Session expired. Please log in again." });
        }
        req.school = payload;
        next();
      },
    );
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ─── Audit Logging Helper ─────────────────────────────────────
function logAudit(action, target, detail, req) {
  const ipAddress = req?.ip || req?.connection?.remoteAddress || "unknown";
  const userAgent = req?.headers?.["user-agent"] || "unknown";
  const userId = req?.school?.schoolId || req?.superAdmin?.id || "unknown";

  db.run(
    `INSERT INTO audit_log (action, target, detail, ipAddress, userAgent, userId) VALUES (?,?,?,?,?,?)`,
    [action, target, detail, ipAddress, userAgent, userId],
  );
}

// ─── Login Attempt Tracking & Account Lockout ─────────────────
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes

function checkAccountLockout(username, callback) {
  const lockoutThreshold = new Date(
    Date.now() - LOCKOUT_DURATION_MS,
  ).toISOString();

  db.get(
    `SELECT COUNT(*) as failedCount FROM login_attempts 
     WHERE username = ? AND success = 0 AND attemptedAt > ?`,
    [username, lockoutThreshold],
    (err, row) => {
      if (err) return callback(err, false);
      const isLockedOut = row.failedCount >= MAX_FAILED_ATTEMPTS;
      callback(null, isLockedOut);
    },
  );
}

function recordLoginAttempt(username, ipAddress, success) {
  db.run(
    `INSERT INTO login_attempts (username, ipAddress, success) VALUES (?,?,?)`,
    [username, ipAddress, success ? 1 : 0],
  );
}

// ─── Refresh Token Rotation ───────────────────────────────────
function generateRefreshToken(schoolId, callback) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(
    Date.now() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString(); // 7 days

  db.run(
    `INSERT INTO refresh_tokens (school_id, token, expiresAt) VALUES (?,?,?)`,
    [schoolId, token, expiresAt],
    function (err) {
      if (err) return callback(err, null);
      callback(null, { token, expiresAt });
    },
  );
}

function validateRefreshToken(token, callback) {
  const now = new Date().toISOString();

  db.get(
    `SELECT rt.*, s.username FROM refresh_tokens rt 
     JOIN schools s ON rt.school_id = s.id 
     WHERE rt.token = ? AND rt.used = 0 AND rt.expiresAt > ?`,
    [token, now],
    (err, row) => {
      if (err || !row) return callback(err, null);
      callback(null, row);
    },
  );
}

function rotateRefreshToken(oldToken, schoolId, callback) {
  // Mark old token as used
  db.run(`UPDATE refresh_tokens SET used = 1 WHERE token = ?`, [oldToken]);
  // Generate new token
  generateRefreshToken(schoolId, callback);
}

function requireSuperAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer "))
    return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(header.slice(7), _JWT_SECRET);
    if (payload.role !== "superadmin")
      return res.status(403).json({ error: "Forbidden" });
    req.superAdmin = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

// ─── Subscription ─────────────────────────────────────────────
function getSubscriptionState(school) {
  const today = new Date().toISOString().split("T")[0];

  if (school.plan === "trial") {
    const trialEnd = school.trialEndsAt || today;
    if (today <= trialEnd)
      return {
        active: true,
        state: "trial",
        expiry: trialEnd,
        daysLeft: Math.ceil((new Date(trialEnd) - new Date(today)) / 86400000),
      };
    return {
      active: false,
      state: "trial_expired",
      expiry: trialEnd,
      daysLeft: 0,
    };
  }

  if (!school.subscriptionExpiry)
    return {
      active: false,
      state: "no_subscription",
      expiry: null,
      daysLeft: 0,
    };

  const expiry = school.subscriptionExpiry;
  const grace = school.gracePeriodDays || 7;
  const graceEnd = new Date(expiry);
  graceEnd.setDate(graceEnd.getDate() + grace);
  const graceEndStr = graceEnd.toISOString().split("T")[0];

  if (today <= expiry) {
    const daysLeft = Math.ceil((new Date(expiry) - new Date(today)) / 86400000);
    return {
      active: true,
      state: daysLeft <= 7 ? "expiring_soon" : "active",
      expiry,
      daysLeft,
    };
  }
  if (today <= graceEndStr) {
    const graceDaysLeft = Math.ceil((graceEnd - new Date(today)) / 86400000);
    return {
      active: true,
      state: "grace_period",
      expiry,
      graceEnd: graceEndStr,
      daysLeft: graceDaysLeft,
    };
  }
  return { active: false, state: "expired", expiry, daysLeft: 0 };
}

function requireSubscription(req, res, next) {
  db.get(
    `SELECT * FROM schools WHERE id = ?`,
    [req.school.schoolId],
    (err, school) => {
      if (err || !school)
        return res.status(500).json({ error: "School not found" });
      const sub = getSubscriptionState(school);
      if (!sub.active)
        return res.status(402).json({
          error: "subscription_required",
          state: sub.state,
          expiry: sub.expiry,
        });
      req.subscription = sub;
      next();
    },
  );
}

// ─── Email (SendGrid) ─────────────────────────────────────────
const sgMail = require("@sendgrid/mail");
const QRCode = require("qrcode");
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL; // your email — receives signup notifications
const FROM_EMAIL = process.env.FROM_EMAIL; // verified sender in SendGrid

if (SENDGRID_API_KEY) sgMail.setApiKey(SENDGRID_API_KEY);

// ─── Health ───────────────────────────────────────────────────
app.get("/api/health", (req, res) => res.json({ ok: true }));

// ─── QR Code generation (server-side — no student data sent to third parties) ─
app.get(
  "/api/transactions/:id/qr",
  requireAuth,
  requireSubscription,
  param("id").isInt().withMessage("Invalid ID"),
  validate,
  (req, res) => {
    db.get(
      `SELECT cardToken, adm, dueDate FROM transactions WHERE id=? AND school_id=?`,
      [req.params.id, req.school.schoolId],
      (err, row) => {
        if (err || !row) return res.status(404).json({ error: "Not found" });
        const data = JSON.stringify({
          token: row.cardToken,
          adm: row.adm,
          due: row.dueDate,
        });
        QRCode.toDataURL(data, { width: 200, margin: 1 }, (err, url) => {
          if (err)
            return res.status(500).json({ error: "QR generation failed" });
          res.json({ qr: url });
        });
      },
    );
  },
);

// ─── Public: School signup enquiry ───────────────────────────
app.post(
  "/api/signup",
  body("schoolName")
    .trim()
    .notEmpty()
    .withMessage("School name is required")
    .isLength({ max: 100 })
    .custom((val) => {
      if (/<[^>]+>|javascript:/i.test(val))
        throw new Error("Invalid characters");
      return true;
    }),
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Contact name is required")
    .isLength({ max: 100 })
    .custom((val) => {
      if (/<[^>]+>|javascript:/i.test(val))
        throw new Error("Invalid characters");
      return true;
    }),
  body("phone")
    .trim()
    .notEmpty()
    .withMessage("Phone number is required")
    .isLength({ max: 20 }),
  body("email")
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage("Invalid email address")
    .normalizeEmail(),
  body("plan")
    .isIn(["basic", "standard", "premium"])
    .withMessage("Invalid plan"),
  body("message").optional().trim().isLength({ max: 1000 }),
  validate,
  async (req, res) => {
    const { schoolName, name, phone, email, plan, message } = req.body;

    if (!SENDGRID_API_KEY || !NOTIFY_EMAIL || !FROM_EMAIL) {
      console.error(
        "SendGrid not configured — SENDGRID_API_KEY, NOTIFY_EMAIL, FROM_EMAIL must be set.",
      );
      return res.status(500).json({
        error: "Email service not configured. Please contact us directly.",
      });
    }

    const planLabels = {
      basic: "Basic (KSh 5,000/term)",
      standard: "Standard (KSh 7,500/term)",
      premium: "Premium (KSh 10,000/term)",
    };

    try {
      // 1. Notify you of the new signup
      await sgMail.send({
        to: NOTIFY_EMAIL,
        from: FROM_EMAIL,
        subject: `🏫 New ShuleMeal Signup: ${schoolName}`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
            <div style="background:#4f46e5;padding:24px;border-radius:12px 12px 0 0">
              <h1 style="color:#fff;margin:0;font-size:20px">New School Signup Request</h1>
            </div>
            <div style="background:#f9fafb;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb">
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px 0;color:#6b7280;font-size:14px;width:140px">School Name</td><td style="padding:8px 0;font-weight:700;font-size:14px">${schoolName}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Contact Person</td><td style="padding:8px 0;font-weight:700;font-size:14px">${name}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Phone</td><td style="padding:8px 0;font-weight:700;font-size:14px">${phone}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Email</td><td style="padding:8px 0;font-weight:700;font-size:14px">${email || "—"}</td></tr>
                <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Plan</td><td style="padding:8px 0;font-weight:700;font-size:14px;color:#4f46e5">${planLabels[plan]}</td></tr>
                ${message ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px;vertical-align:top">Message</td><td style="padding:8px 0;font-size:14px">${message}</td></tr>` : ""}
              </table>
              <div style="margin-top:20px;padding:16px;background:#ede9fe;border-radius:8px">
                <p style="margin:0;font-size:13px;color:#4f46e5;font-weight:600">Action required: Create their school account in the super admin panel, then reply to confirm.</p>
              </div>
            </div>
          </div>
        `,
      });

      // 2. Send confirmation to the school (only if they provided an email)
      if (email) {
        await sgMail.send({
          to: email,
          from: FROM_EMAIL,
          subject: `We received your ShuleMeal Cards request — ${schoolName}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
              <div style="background:#4f46e5;padding:24px;border-radius:12px 12px 0 0">
                <h1 style="color:#fff;margin:0;font-size:20px">Thanks for signing up, ${name}!</h1>
              </div>
              <div style="background:#f9fafb;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb">
                <p style="color:#374151;font-size:15px">We've received your request for <strong>${schoolName}</strong> on the <strong>${planLabels[plan]}</strong> plan.</p>
                <p style="color:#374151;font-size:15px">We'll set up your account and send you login credentials within <strong>1 hour</strong> during business hours (Mon–Fri, 8am–6pm).</p>
                <div style="margin:24px 0;padding:16px;background:#ede9fe;border-radius:8px">
                  <p style="margin:0;font-size:14px;color:#4f46e5">Your 30-day free trial starts the moment your account is activated — no payment needed upfront.</p>
                </div>
                <p style="color:#6b7280;font-size:13px">Questions? Reply to this email or call/WhatsApp us directly.</p>
                <p style="color:#374151;font-size:14px;margin-top:24px">— The ShuleMeal Cards Team</p>
              </div>
            </div>
          `,
        });
      }

      // Log the signup to the database for your records
      db.run(
        `CREATE TABLE IF NOT EXISTS signups (id INTEGER PRIMARY KEY AUTOINCREMENT, schoolName TEXT, name TEXT, phone TEXT, email TEXT, plan TEXT, message TEXT, createdAt TEXT DEFAULT (datetime('now')))`,
        () => {
          db.run(
            `INSERT INTO signups (schoolName, name, phone, email, plan, message) VALUES (?,?,?,?,?,?)`,
            [schoolName, name, phone, email || null, plan, message || null],
          );
        },
      );

      res.json({ success: true });
    } catch (err) {
      console.error("SendGrid error:", err.response?.body || err.message);
      res.status(500).json({
        error: "Failed to send email. Please try again or contact us directly.",
      });
    }
  },
);
// ─── Super Admin: view signups ────────────────────────────────
app.get("/api/superadmin/signups", requireSuperAdmin, (req, res) => {
  db.all(`SELECT * FROM signups ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows || []);
  });
});

app.delete(
  "/api/superadmin/signups/:id",
  requireSuperAdmin,
  param("id").isInt().withMessage("Invalid ID"),
  validate,
  (req, res) => {
    db.run(`DELETE FROM signups WHERE id=?`, [req.params.id], function (err) {
      if (err) return res.status(500).json({ error: "Delete failed" });
      if (this.changes === 0)
        return res.status(404).json({ error: "Not found" });
      res.json({ success: true });
    });
  },
);

// ─── Super Admin: audit log ───────────────────────────────────
app.get("/api/superadmin/audit", requireSuperAdmin, (req, res) => {
  db.all(
    `SELECT * FROM audit_log ORDER BY id DESC LIMIT 500`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows || []);
    },
  );
});

// ─── Super Admin Login ────────────────────────────────────────
app.post(
  "/api/superadmin/login",
  body("password").notEmpty().withMessage("Password is required"),
  validate,
  (req, res) => {
    const dummyHash =
      "$2a$12$invalidhashfortimingprotection000000000000000000000000";
    bcrypt
      .compare(req.body.password, _SUPER_ADMIN_HASH || dummyHash)
      .then((valid) => {
        if (!valid) return res.status(401).json({ error: "Invalid password" });
        const token = jwt.sign({ role: "superadmin" }, _JWT_SECRET, {
          expiresIn: "8h",
        });
        res.json({ token });
      })
      .catch((err) => {
        console.error("SA login error:", err.message, err.stack);
        res.status(500).json({ error: "Internal server error" });
      });
  },
);

// ─── Super Admin: Schools ─────────────────────────────────────
app.get("/api/superadmin/schools", requireSuperAdmin, noCache, (req, res) => {
  db.all(
    `SELECT id, name, username, plan, subscriptionExpiry, gracePeriodDays, trialEndsAt, createdAt FROM schools ORDER BY id DESC`,
    [],
    (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(
        rows.map((s) => ({ ...s, subscription: getSubscriptionState(s) })),
      );
    },
  );
});

app.post(
  "/api/superadmin/schools",
  requireSuperAdmin,
  body("name")
    .trim()
    .notEmpty()
    .withMessage("School name is required")
    .isLength({ max: 100 })
    .custom((val) => {
      if (/<[^>]+>|javascript:/i.test(val))
        throw new Error("Invalid characters in school name");
      return true;
    }),
  body("username")
    .trim()
    .notEmpty()
    .isLength({ min: 3, max: 30 })
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage("Username must be 3–30 alphanumeric characters"),
  body("adminPassword")
    .isLength({ min: 8 })
    .withMessage("Admin password must be at least 8 characters")
    .matches(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/)
    .withMessage(
      "Admin password must contain uppercase, number, and special character",
    ),
  body("teacherPassword")
    .isLength({ min: 8 })
    .withMessage("Teacher password must be at least 8 characters")
    .matches(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/)
    .withMessage(
      "Teacher password must contain uppercase, number, and special character",
    ),
  validate,
  async (req, res) => {
    const { name, username, adminPassword, teacherPassword } = req.body;
    const [adminPasswordHash, teacherPasswordHash] = await Promise.all([
      bcrypt.hash(adminPassword, 12),
      bcrypt.hash(teacherPassword, 12),
    ]);
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    db.run(
      `INSERT INTO schools (name, username, adminPasswordHash, teacherPasswordHash, plan, trialEndsAt) VALUES (?,?,?,?,?,?)`,
      [
        name.trim(),
        username.trim().toLowerCase(),
        adminPasswordHash,
        teacherPasswordHash,
        "trial",
        trialEndsAt,
      ],
      function (err) {
        if (err) {
          console.error("Create school DB error:", err.message);
          return res.status(400).json({
            error: err.message.includes("UNIQUE")
              ? "Username already taken"
              : err.message,
          });
        }
        res.status(201).json({ id: this.lastID, name, username });
      },
    );
  },
);

app.put(
  "/api/superadmin/schools/:id",
  requireSuperAdmin,
  param("id").isInt().withMessage("Invalid school ID"),
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Name is required")
    .isLength({ max: 100 }),
  body("adminPassword")
    .optional()
    .isLength({ min: 8 })
    .withMessage("Admin password must be at least 8 characters")
    .matches(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/)
    .withMessage(
      "Admin password must contain uppercase, number, and special character",
    ),
  body("teacherPassword")
    .optional()
    .isLength({ min: 8 })
    .withMessage("Teacher password must be at least 8 characters")
    .matches(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/)
    .withMessage(
      "Teacher password must contain uppercase, number, and special character",
    ),
  validate,
  async (req, res) => {
    const { name, adminPassword, teacherPassword } = req.body;
    const fields = ["name = ?"];
    const values = [name.trim()];
    if (adminPassword) {
      fields.push("adminPasswordHash = ?");
      values.push(await bcrypt.hash(adminPassword, 12));
    }
    if (teacherPassword) {
      fields.push("teacherPasswordHash = ?");
      values.push(await bcrypt.hash(teacherPassword, 12));
    }
    // Stamp passwordChangedAt so existing tokens are invalidated
    if (adminPassword || teacherPassword) {
      fields.push("passwordChangedAt = ?");
      values.push(new Date().toISOString());
    }
    values.push(req.params.id);
    db.run(
      `UPDATE schools SET ${fields.join(", ")} WHERE id = ?`,
      values,
      (err) => {
        if (err) return res.status(500).json({ error: "Update failed" });
        res.json({ success: true });
      },
    );
  },
);

app.delete(
  "/api/superadmin/schools/:id",
  requireSuperAdmin,
  param("id").isInt().withMessage("Invalid school ID"),
  validate,
  (req, res) => {
    // Read school name before deleting for the audit log
    db.get(
      `SELECT id, name, username FROM schools WHERE id=?`,
      [req.params.id],
      (err, school) => {
        if (err || !school)
          return res.status(404).json({ error: "School not found" });
        db.run(`DELETE FROM schools WHERE id=?`, [req.params.id], (err) => {
          if (err) return res.status(500).json({ error: "Delete failed" });
          // Write audit log entry
          db.run(
            `INSERT INTO audit_log (action, target, detail) VALUES (?,?,?)`,
            [
              "DELETE_SCHOOL",
              school.username,
              `Deleted school "${school.name}" (id=${school.id})`,
            ],
          );
          res.json({ success: true });
        });
      },
    );
  },
);

// ─── Super Admin: Subscription management ────────────────────
app.put(
  "/api/superadmin/schools/:id/subscription",
  requireSuperAdmin,
  param("id").isInt().withMessage("Invalid school ID"),
  body("plan")
    .optional()
    .isIn(["trial", "basic", "standard", "premium"])
    .withMessage("Invalid plan"),
  body("months")
    .optional()
    .isInt({ min: 1, max: 24 })
    .withMessage("Months must be 1–24"),
  body("gracePeriodDays")
    .optional()
    .isInt({ min: 0, max: 30 })
    .withMessage("Grace period must be 0–30 days"),
  validate,
  (req, res) => {
    const { plan, months, gracePeriodDays } = req.body;
    db.get(
      `SELECT * FROM schools WHERE id = ?`,
      [req.params.id],
      (err, school) => {
        if (err || !school)
          return res.status(404).json({ error: "School not found" });
        let newExpiry = school.subscriptionExpiry;
        if (months) {
          const base = new Date(
            Math.max(
              new Date(),
              school.subscriptionExpiry
                ? new Date(school.subscriptionExpiry)
                : new Date(),
            ),
          );
          base.setMonth(base.getMonth() + parseInt(months));
          newExpiry = base.toISOString().split("T")[0];
        }
        const fields = [],
          values = [];
        if (plan) {
          fields.push("plan = ?");
          values.push(plan);
        }
        if (newExpiry) {
          fields.push("subscriptionExpiry = ?");
          values.push(newExpiry);
        }
        if (gracePeriodDays !== undefined) {
          fields.push("gracePeriodDays = ?");
          values.push(gracePeriodDays);
        }
        if (!fields.length)
          return res.status(400).json({ error: "Nothing to update" });
        values.push(req.params.id);
        db.run(
          `UPDATE schools SET ${fields.join(", ")} WHERE id = ?`,
          values,
          (err) => {
            if (err) return res.status(500).json({ error: "Update failed" });
            db.get(
              `SELECT * FROM schools WHERE id = ?`,
              [req.params.id],
              (err, updated) => {
                db.run(
                  `INSERT INTO audit_log (action, target, detail) VALUES (?,?,?)`,
                  [
                    "UPDATE_SUBSCRIPTION",
                    updated?.username || req.params.id,
                    `Plan: ${plan || "unchanged"}, Expiry: ${newExpiry || "unchanged"}`,
                  ],
                );
                res.json({
                  success: true,
                  subscription: getSubscriptionState(updated),
                });
              },
            );
          },
        );
      },
    );
  },
);

// ─── School Login ─────────────────────────────────────────────
app.post(
  "/api/auth/login",
  body("username").trim().notEmpty().withMessage("Username is required"),
  body("password").notEmpty().withMessage("Password is required"),
  body("role").optional().isIn(["admin", "teacher"]),
  validate,
  (req, res) => {
    const { username, password, role } = req.body;
    const ipAddress = req.ip || req.connection?.remoteAddress || "unknown";

    // Check if account is locked out due to too many failed attempts
    checkAccountLockout(username.toLowerCase(), (err, isLockedOut) => {
      if (err) return res.status(500).json({ error: "Server error" });
      if (isLockedOut) {
        logAudit(
          "LOGIN_ATTEMPT",
          username.toLowerCase(),
          "Account locked due to too many failed attempts",
          req,
        );
        return res.status(423).json({
          error: "Account temporarily locked. Please try again in 15 minutes.",
        });
      }

      db.get(
        `SELECT * FROM schools WHERE username = ?`,
        [username.toLowerCase()],
        async (err, school) => {
          if (err) return res.status(500).json({ error: "Server error" });
          // Always hash-compare even on miss to prevent timing attacks
          const dummyHash =
            "$2a$12$invalidhashfortimingprotection000000000000000000000000";
          const isTeacher = role === "teacher";
          const hash = school
            ? isTeacher
              ? school.teacherPasswordHash
              : school.adminPasswordHash
            : dummyHash;
          const valid = await bcrypt.compare(password, hash || dummyHash);

          if (!school || !valid) {
            // Record failed login attempt
            recordLoginAttempt(username.toLowerCase(), ipAddress, false);
            logAudit(
              "LOGIN_FAILED",
              username.toLowerCase(),
              "Invalid credentials",
              req,
            );
            return res
              .status(401)
              .json({ error: "Invalid username or password" });
          }

          if (!hash) {
            recordLoginAttempt(username.toLowerCase(), ipAddress, false);
            return res.status(401).json({
              error:
                "Account not fully configured. Contact your administrator.",
            });
          }

          // Record successful login
          recordLoginAttempt(username.toLowerCase(), ipAddress, true);
          logAudit(
            "LOGIN_SUCCESS",
            username.toLowerCase(),
            `Successful ${isTeacher ? "teacher" : "admin"} login`,
            req,
          );

          const userRole = isTeacher ? "teacher" : "admin";
          const token = jwt.sign(
            { schoolId: school.id, role: userRole },
            _JWT_SECRET,
            { expiresIn: "12h" },
          );

          // Generate refresh token for token rotation
          generateRefreshToken(school.id, (refreshErr, refreshTokenData) => {
            const response = {
              token,
              schoolName: school.name,
              role: userRole,
              subscription: getSubscriptionState(school),
            };
            if (refreshTokenData) {
              response.refreshToken = refreshTokenData.token;
            }
            res.json(response);
          });
        },
      );
    });
  },
);

// ─── Refresh Token Endpoint ───────────────────────────────────
app.post(
  "/api/auth/refresh",
  body("refreshToken").notEmpty().withMessage("Refresh token is required"),
  validate,
  (req, res) => {
    const { refreshToken } = req.body;

    validateRefreshToken(refreshToken, (err, tokenData) => {
      if (err || !tokenData) {
        return res
          .status(401)
          .json({ error: "Invalid or expired refresh token" });
      }

      // Rotate the refresh token
      rotateRefreshToken(
        refreshToken,
        tokenData.school_id,
        (rotateErr, newTokenData) => {
          if (rotateErr) {
            return res.status(500).json({ error: "Token rotation failed" });
          }

          // Generate new access token
          const newAccessToken = jwt.sign(
            { schoolId: tokenData.school_id, role: "admin" },
            _JWT_SECRET,
            { expiresIn: "12h" },
          );

          logAudit(
            "TOKEN_REFRESH",
            tokenData.username,
            "Access token refreshed with new refresh token",
            req,
          );

          res.json({
            token: newAccessToken,
            refreshToken: newTokenData.token,
          });
        },
      );
    });
  },
);

// ─── Subscription status ──────────────────────────────────────
app.get("/api/subscription/status", requireAuth, noCache, (req, res) => {
  db.get(
    `SELECT * FROM schools WHERE id = ?`,
    [req.school.schoolId],
    (err, school) => {
      if (err || !school) return res.status(404).json({ error: "Not found" });
      res.json(getSubscriptionState(school));
    },
  );
});

// ─── Transactions ─────────────────────────────────────────────
app.get(
  "/api/transactions",
  requireAuth,
  requireSubscription,
  noCache,
  (req, res) => {
    db.all(
      `SELECT id, studentName, adm, amount, durationWeeks, paidDate, dueDate, status, cardToken FROM transactions WHERE school_id=? ORDER BY id DESC`,
      [req.school.schoolId],
      (err, rows) => {
        if (err)
          return res
            .status(500)
            .json({ error: "Failed to fetch transactions" });
        res.json(rows);
      },
    );
  },
);

app.post(
  "/api/transactions",
  requireAuth,
  requireSubscription,
  body("studentName")
    .trim()
    .notEmpty()
    .withMessage("Student name is required")
    .isLength({ max: 100 })
    .custom((val) => {
      if (/<[^>]+>|javascript:|on\w+\s*=|\{\{.*\}\}/i.test(val))
        throw new Error("Invalid characters in student name");
      return true;
    }),
  body("adm")
    .trim()
    .notEmpty()
    .withMessage("Admission number is required")
    .isLength({ max: 30 })
    .matches(/^[a-zA-Z0-9\-_]+$/)
    .withMessage(
      "Admission number may only contain letters, numbers, hyphens and underscores",
    )
    .custom((val) => {
      if (/<[^>]+>|javascript:|\{\{.*\}\}/i.test(val))
        throw new Error("Invalid characters in admission number");
      return true;
    }),
  body("amount")
    .isFloat({ min: 0 })
    .withMessage("Amount must be a positive number"),
  body("paidDate").isDate().withMessage("Invalid paid date"),
  body("dueDate").isDate().withMessage("Invalid due date"),
  validate,
  (req, res) => {
    if (req.school.role !== "admin")
      return res.status(403).json({ error: "Forbidden" });
    const { amount, durationWeeks, paidDate, dueDate, status } = req.body;

    // Validate ADM number format with Kenyan school standards
    const rawAdm = stripHtml(req.body.adm);
    if (!isValidAdm(rawAdm)) {
      return res.status(400).json({
        error:
          "Invalid ADM number format. Use only letters, numbers, hyphens, and underscores.",
      });
    }

    // Sanitize text fields before storing
    const studentName = stripHtml(req.body.studentName);
    const adm = rawAdm.trim();
    const cardToken = generateToken();

    db.run(
      `INSERT INTO transactions (school_id,studentName,adm,amount,durationWeeks,paidDate,dueDate,status,cardToken) VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        req.school.schoolId,
        studentName,
        adm,
        amount,
        durationWeeks,
        paidDate,
        dueDate,
        status || "Active",
        cardToken,
      ],
      function (err) {
        if (err)
          return res.status(500).json({ error: "Failed to save transaction" });
        logAudit(
          "TRANSACTION_CREATED",
          adm,
          `Created transaction for ${studentName}`,
          req,
        );
        res.status(201).json({
          id: this.lastID,
          studentName,
          adm,
          amount,
          durationWeeks,
          paidDate,
          dueDate,
          status,
          cardToken,
        });
      },
    );
  },
);

app.put(
  "/api/transactions/:id",
  requireAuth,
  requireSubscription,
  param("id").isInt().withMessage("Invalid ID"),
  body("dueDate").isDate().withMessage("Invalid due date"),
  body("amount").isFloat({ min: 0 }).withMessage("Amount must be positive"),
  validate,
  (req, res) => {
    if (req.school.role !== "admin")
      return res.status(403).json({ error: "Forbidden" });
    const { dueDate, amount } = req.body;
    db.run(
      `UPDATE transactions SET dueDate=?, amount=amount+?, status='Active' WHERE id=? AND school_id=?`,
      [dueDate, amount, req.params.id, req.school.schoolId],
      function (err) {
        if (err) return res.status(500).json({ error: "Update failed" });
        if (this.changes === 0)
          return res.status(404).json({ error: "Not found" });
        db.get(
          `SELECT * FROM transactions WHERE id=?`,
          [req.params.id],
          (err, row) => res.json(row),
        );
      },
    );
  },
);

app.delete(
  "/api/transactions/:id",
  requireAuth,
  requireSubscription,
  param("id").isInt().withMessage("Invalid ID"),
  validate,
  (req, res) => {
    if (req.school.role !== "admin")
      return res.status(403).json({ error: "Forbidden" });
    db.run(
      `DELETE FROM transactions WHERE id=? AND school_id=?`,
      [req.params.id, req.school.schoolId],
      function (err) {
        if (err) return res.status(500).json({ error: "Delete failed" });
        if (this.changes === 0)
          return res.status(404).json({ error: "Not found" });
        res.json({ success: true });
      },
    );
  },
);

app.post(
  "/api/transactions/:id/replace",
  requireAuth,
  requireSubscription,
  param("id").isInt().withMessage("Invalid ID"),
  validate,
  (req, res) => {
    if (req.school.role !== "admin")
      return res.status(403).json({ error: "Forbidden" });
    const newToken = generateToken();
    db.run(
      `UPDATE transactions SET cardToken=? WHERE id=? AND school_id=?`,
      [newToken, req.params.id, req.school.schoolId],
      function (err) {
        if (err) return res.status(500).json({ error: "Replace failed" });
        if (this.changes === 0)
          return res.status(404).json({ error: "Not found" });
        db.get(
          `SELECT * FROM transactions WHERE id=?`,
          [req.params.id],
          (err, row) => res.json(row),
        );
      },
    );
  },
);

// ─── Scan ─────────────────────────────────────────────────────
app.post(
  "/api/scan",
  requireAuth,
  requireSubscription,
  body("token")
    .notEmpty()
    .withMessage("Token is required")
    .isString()
    .withMessage("Token must be a string")
    .matches(/^[a-f0-9]{32}$/)
    .withMessage("Invalid token format"),
  validate,
  (req, res) => {
    db.get(
      `SELECT * FROM transactions WHERE cardToken=? AND school_id=?`,
      [req.body.token, req.school.schoolId],
      (err, row) => {
        if (err) return res.status(500).json({ error: "Scan failed" });
        if (!row)
          return res.json({
            valid: false,
            message: "Card not recognised. It may have been deactivated.",
          });

        const now = new Date();
        const today = now.toISOString().split("T")[0]; // YYYY-MM-DD

        // ── Subscription / expiry check ──────────────────────────
        if (row.dueDate < today) {
          db.run(
            `INSERT INTO scans (school_id, adm, scanDate, mealDate, status) VALUES (?,?,?,?,?)`,
            [
              req.school.schoolId,
              row.adm,
              now.toISOString(),
              today,
              "REJECTED",
            ],
          );
          const safeStudent = {
            studentName: row.studentName,
            adm: row.adm,
            dueDate: row.dueDate,
          };
          return res.json({
            valid: false,
            message: `Meal plan expired on ${row.dueDate}`,
            student: safeStudent,
          });
        }

        // ── Double-dip check — already scanned today? ────────────
        db.get(
          `SELECT id FROM scans WHERE school_id=? AND adm=? AND mealDate=? AND status='APPROVED'`,
          [req.school.schoolId, row.adm, today],
          (err2, existing) => {
            if (err2) return res.status(500).json({ error: "Scan failed" });

            if (existing) {
              // Already ate today — log the attempt and reject
              db.run(
                `INSERT INTO scans (school_id, adm, scanDate, mealDate, status) VALUES (?,?,?,?,?)`,
                [
                  req.school.schoolId,
                  row.adm,
                  now.toISOString(),
                  today,
                  "DUPLICATE",
                ],
              );
              const safeStudent = {
                studentName: row.studentName,
                adm: row.adm,
                dueDate: row.dueDate,
              };
              return res.json({
                valid: false,
                duplicate: true,
                message: `${row.studentName} already received a meal today.`,
                student: safeStudent,
              });
            }

            // ── All clear — approve the meal ─────────────────────
            db.run(
              `INSERT INTO scans (school_id, adm, scanDate, mealDate, status) VALUES (?,?,?,?,?)`,
              [
                req.school.schoolId,
                row.adm,
                now.toISOString(),
                today,
                "APPROVED",
              ],
            );
            const safeStudent = {
              studentName: row.studentName,
              adm: row.adm,
              dueDate: row.dueDate,
            };
            res.json({
              valid: true,
              message: `Meal approved. Valid until ${row.dueDate}`,
              student: safeStudent,
            });
          },
        );
      },
    );
  },
);

// ─── Scans reporting ──────────────────────────────────────────
app.get(
  "/api/scans/summary",
  requireAuth,
  requireSubscription,
  noCache,
  (req, res) => {
    db.all(
      `SELECT DATE(scanDate) as date, COUNT(*) as total,
      SUM(CASE WHEN status='APPROVED' THEN 1 ELSE 0 END) as approved,
      SUM(CASE WHEN status='REJECTED' THEN 1 ELSE 0 END) as rejected,
      SUM(CASE WHEN status='DUPLICATE' THEN 1 ELSE 0 END) as duplicates
     FROM scans WHERE school_id=? GROUP BY DATE(scanDate) ORDER BY date DESC`,
      [req.school.schoolId],
      (err, rows) => {
        if (err)
          return res.status(500).json({ error: "Failed to fetch summary" });
        res.json(rows);
      },
    );
  },
);

app.get(
  "/api/scans/detailed",
  requireAuth,
  requireSubscription,
  noCache,
  (req, res) => {
    db.all(
      `SELECT s.id, s.adm, s.scanDate, s.status, t.studentName
     FROM scans s LEFT JOIN transactions t ON s.adm=t.adm AND t.school_id=s.school_id
     WHERE s.school_id=? ORDER BY s.id DESC LIMIT 200`,
      [req.school.schoolId],
      (err, rows) => {
        if (err)
          return res.status(500).json({ error: "Failed to fetch scans" });
        res.json(rows);
      },
    );
  },
);

// ─── Card Templates API ───────────────────────────────────────
// Get all templates for current school
app.get("/api/templates", requireAuth, noCache, (req, res) => {
  db.all(
    `SELECT id, name, primaryColor, secondaryColor, backgroundColor, textColor, 
            logoPath, showSchoolName, showStudentPhoto, qrPosition, borderRadius, fontSize, isDefault, createdAt
     FROM card_templates WHERE school_id=? ORDER BY isDefault DESC, createdAt DESC`,
    [req.school.schoolId],
    (err, rows) => {
      if (err)
        return res.status(500).json({ error: "Failed to fetch templates" });
      res.json(rows);
    },
  );
});

// Get default template for current school
app.get("/api/templates/default", requireAuth, noCache, (req, res) => {
  db.get(
    `SELECT id, name, primaryColor, secondaryColor, backgroundColor, textColor, 
            logoPath, showSchoolName, showStudentPhoto, qrPosition, borderRadius, fontSize, isDefault, createdAt
     FROM card_templates WHERE school_id=? AND isDefault=1`,
    [req.school.schoolId],
    (err, row) => {
      if (err)
        return res
          .status(500)
          .json({ error: "Failed to fetch default template" });
      if (!row) {
        // Return default template if none set
        return res.json({
          id: null,
          name: "Default",
          primaryColor: "#4f46e5",
          secondaryColor: "#818cf8",
          backgroundColor: "#ffffff",
          textColor: "#1f2937",
          logoPath: null,
          showSchoolName: 1,
          showStudentPhoto: 0,
          qrPosition: "right",
          borderRadius: 12,
          fontSize: 14,
          isDefault: 0,
        });
      }
      res.json(row);
    },
  );
});

// Create new template
app.post(
  "/api/templates",
  requireAuth,
  body("name")
    .notEmpty()
    .withMessage("Template name is required")
    .isString()
    .trim(),
  body("primaryColor")
    .optional()
    .isHexColor()
    .withMessage("Invalid primary color"),
  body("secondaryColor")
    .optional()
    .isHexColor()
    .withMessage("Invalid secondary color"),
  body("backgroundColor")
    .optional()
    .isHexColor()
    .withMessage("Invalid background color"),
  body("textColor").optional().isHexColor().withMessage("Invalid text color"),
  body("showSchoolName").optional().isBoolean(),
  body("showStudentPhoto").optional().isBoolean(),
  body("qrPosition")
    .optional()
    .isIn(["left", "right", "center"])
    .withMessage("QR position must be left, right, or center"),
  body("borderRadius")
    .optional()
    .isInt({ min: 0, max: 50 })
    .withMessage("Border radius must be 0-50"),
  body("fontSize")
    .optional()
    .isInt({ min: 8, max: 32 })
    .withMessage("Font size must be 8-32"),
  validate,
  (req, res) => {
    const {
      name,
      primaryColor,
      secondaryColor,
      backgroundColor,
      textColor,
      logoPath,
      showSchoolName,
      showStudentPhoto,
      qrPosition,
      borderRadius,
      fontSize,
    } = req.body;

    db.run(
      `INSERT INTO card_templates (school_id, name, primaryColor, secondaryColor, backgroundColor, textColor, logoPath, showSchoolName, showStudentPhoto, qrPosition, borderRadius, fontSize)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.school.schoolId,
        stripHtml(name),
        primaryColor || "#4f46e5",
        secondaryColor || "#818cf8",
        backgroundColor || "#ffffff",
        textColor || "#1f2937",
        logoPath || null,
        showSchoolName !== false ? 1 : 0,
        showStudentPhoto ? 1 : 0,
        qrPosition || "right",
        borderRadius || 12,
        fontSize || 14,
      ],
      function (err) {
        if (err)
          return res.status(500).json({ error: "Failed to create template" });
        logAudit("TEMPLATE_CREATED", `template:${this.lastID}`, name, req);
        res
          .status(201)
          .json({ id: this.lastID, message: "Template created successfully" });
      },
    );
  },
);

// Update template
app.put(
  "/api/templates/:id",
  requireAuth,
  param("id").isInt().withMessage("Invalid template ID"),
  body("name").optional().isString().trim(),
  body("primaryColor")
    .optional()
    .isHexColor()
    .withMessage("Invalid primary color"),
  body("secondaryColor")
    .optional()
    .isHexColor()
    .withMessage("Invalid secondary color"),
  body("backgroundColor")
    .optional()
    .isHexColor()
    .withMessage("Invalid background color"),
  body("textColor").optional().isHexColor().withMessage("Invalid text color"),
  body("showSchoolName").optional().isBoolean(),
  body("showStudentPhoto").optional().isBoolean(),
  body("qrPosition")
    .optional()
    .isIn(["left", "right", "center"])
    .withMessage("QR position must be left, right, or center"),
  body("borderRadius")
    .optional()
    .isInt({ min: 0, max: 50 })
    .withMessage("Border radius must be 0-50"),
  body("fontSize")
    .optional()
    .isInt({ min: 8, max: 32 })
    .withMessage("Font size must be 8-32"),
  validate,
  (req, res) => {
    const templateId = parseInt(req.params.id, 10);
    const updates = [];
    const values = [];

    const allowedFields = [
      "name",
      "primaryColor",
      "secondaryColor",
      "backgroundColor",
      "textColor",
      "logoPath",
      "showSchoolName",
      "showStudentPhoto",
      "qrPosition",
      "borderRadius",
      "fontSize",
    ];

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        let value = req.body[field];
        if (field === "name") value = stripHtml(value);
        if (field === "showSchoolName" || field === "showStudentPhoto")
          value = value ? 1 : 0;
        updates.push(`${field} = ?`);
        values.push(value);
      }
    });

    if (updates.length === 0)
      return res.status(400).json({ error: "No fields to update" });

    values.push(templateId, req.school.schoolId);

    db.run(
      `UPDATE card_templates SET ${updates.join(", ")} WHERE id = ? AND school_id = ?`,
      values,
      function (err) {
        if (err)
          return res.status(500).json({ error: "Failed to update template" });
        if (this.changes === 0)
          return res.status(404).json({ error: "Template not found" });
        logAudit(
          "TEMPLATE_UPDATED",
          `template:${templateId}`,
          JSON.stringify(req.body),
          req,
        );
        res.json({ message: "Template updated successfully" });
      },
    );
  },
);

// Set template as default
app.post(
  "/api/templates/:id/set-default",
  requireAuth,
  param("id").isInt().withMessage("Invalid template ID"),
  validate,
  (req, res) => {
    const templateId = parseInt(req.params.id, 10);

    db.run(
      `UPDATE card_templates SET isDefault = 0 WHERE school_id = ?`,
      [req.school.schoolId],
      (err) => {
        if (err)
          return res
            .status(500)
            .json({ error: "Failed to set default template" });

        db.run(
          `UPDATE card_templates SET isDefault = 1 WHERE id = ? AND school_id = ?`,
          [templateId, req.school.schoolId],
          function (err) {
            if (err)
              return res
                .status(500)
                .json({ error: "Failed to set default template" });
            if (this.changes === 0)
              return res.status(404).json({ error: "Template not found" });
            logAudit(
              "TEMPLATE_DEFAULT_SET",
              `template:${templateId}`,
              null,
              req,
            );
            res.json({ message: "Default template updated successfully" });
          },
        );
      },
    );
  },
);

// Delete template
app.delete(
  "/api/templates/:id",
  requireAuth,
  param("id").isInt().withMessage("Invalid template ID"),
  validate,
  (req, res) => {
    const templateId = parseInt(req.params.id, 10);

    db.run(
      `DELETE FROM card_templates WHERE id = ? AND school_id = ?`,
      [templateId, req.school.schoolId],
      function (err) {
        if (err)
          return res.status(500).json({ error: "Failed to delete template" });
        if (this.changes === 0)
          return res.status(404).json({ error: "Template not found" });
        logAudit("TEMPLATE_DELETED", `template:${templateId}`, null, req);
        res.json({ message: "Template deleted successfully" });
      },
    );
  },
);

// Upload logo for template
app.post(
  "/api/templates/:id/logo",
  requireAuth,
  param("id").isInt().withMessage("Invalid template ID"),
  validate,
  (req, res) => {
    const templateId = parseInt(req.params.id, 10);

    // Check if template exists and belongs to school
    db.get(
      `SELECT id FROM card_templates WHERE id = ? AND school_id = ?`,
      [templateId, req.school.schoolId],
      (err, template) => {
        if (err)
          return res.status(500).json({ error: "Failed to verify template" });
        if (!template)
          return res.status(404).json({ error: "Template not found" });

        // Logo should be sent as base64 in request body
        const { logoData } = req.body;
        if (!logoData || !logoData.startsWith("data:image/")) {
          return res.status(400).json({
            error: "Invalid logo data. Please provide base64 encoded image.",
          });
        }

        // Extract the base64 part and store it
        const base64Data = logoData.split(",")[1] || logoData;
        const logoPath = `/uploads/logos/school_${req.school.schoolId}_template_${templateId}_${Date.now()}.png`;

        db.run(
          `UPDATE card_templates SET logoPath = ?, logoData = ? WHERE id = ?`,
          [logoPath, base64Data, templateId],
          function (err) {
            if (err)
              return res.status(500).json({ error: "Failed to save logo" });
            logAudit(
              "TEMPLATE_LOGO_UPLOADED",
              `template:${templateId}`,
              logoPath,
              req,
            );
            res.json({ message: "Logo uploaded successfully", logoPath });
          },
        );
      },
    );
  },
);

// ─── 404 catch-all ────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// ─── Alert helper ─────────────────────────────────────────────
// Sends an email alert to NOTIFY_EMAIL when something goes wrong.
// Silently swallows its own errors so it never causes a second crash.
async function sendAlert(subject, body) {
  if (!SENDGRID_API_KEY || !NOTIFY_EMAIL || !FROM_EMAIL) return;
  try {
    await sgMail.send({
      to: NOTIFY_EMAIL,
      from: FROM_EMAIL,
      subject: `🚨 ShuleMeal Alert: ${subject}`,
      text: body,
      html: `<pre style="font-family:monospace;font-size:13px">${body.replace(/</g, '&lt;')}</pre>`,
    });
  } catch (e) {
    console.error('Alert email failed:', e.message);
  }
}

// ─── Global error handler ─────────────────────────────────────
// Handles: oversized payloads (413), malformed JSON (400), and all other errors
app.use(async (err, req, res, next) => {
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large. Maximum request size is 50kb.' });
  }
  if (err.type === 'entity.parse.failed' || err.status === 400) {
    return res.status(400).json({ error: 'Invalid JSON in request body.' });
  }

  // Log to console
  console.error(`[${new Date().toISOString()}] Unhandled error on ${req.method} ${req.path}`);
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);

  // Email alert
  const alertBody = [
    `Time:    ${new Date().toISOString()}`,
    `Route:   ${req.method} ${req.path}`,
    `Error:   ${err.message}`,
    ``,
    `Stack:`,
    err.stack || '(no stack)',
  ].join('\n');
  await sendAlert(`500 on ${req.method} ${req.path}`, alertBody);

  res.status(500).json({ error: 'Internal server error' });
});

// ─── Unhandled promise rejections ─────────────────────────────
// Catches async errors that escape all try/catch blocks
process.on('unhandledRejection', async (reason, promise) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : '';
  console.error(`[${new Date().toISOString()}] Unhandled Promise Rejection:`, msg);
  await sendAlert(
    'Unhandled Promise Rejection',
    `Time:  ${new Date().toISOString()}\nReason: ${msg}\n\nStack:\n${stack}`
  );
});

// ─── Uncaught exceptions ──────────────────────────────────────
// Last-resort catch for synchronous crashes — alerts then exits cleanly
process.on('uncaughtException', async (err) => {
  console.error(`[${new Date().toISOString()}] Uncaught Exception:`, err.message);
  console.error(err.stack);
  await sendAlert(
    'CRITICAL: Server Crash',
    `Time:  ${new Date().toISOString()}\nError: ${err.message}\n\nStack:\n${err.stack}\n\nThe server process is exiting. Restart it immediately.`
  );
  process.exit(1);
});

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] Backend running on http://localhost:${PORT}`);
  // Startup notification (only in production so you don't get spammed in dev)
  if (process.env.NODE_ENV === 'production') {
    sendAlert(
      'Server Started',
      `Time: ${new Date().toISOString()}\nPort: ${PORT}\nThe ShuleMeal backend has started successfully.`
    );
  }
});
