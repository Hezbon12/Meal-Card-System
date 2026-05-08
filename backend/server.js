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
if (process.env.NODE_ENV === "production" && (!ALLOWED_ORIGIN || ALLOWED_ORIGIN === "*")) {
  console.error(
    "FATAL: ALLOWED_ORIGIN must be set to your exact domain in production (e.g. https://yourdomain.com). Wildcard '*' is not allowed.",
  );
  process.exit(1);
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
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

// Body parsing — limit payload size to prevent abuse
// Global limit is 50kb. The logo upload endpoint overrides this to 300kb.
app.use((req, res, next) => {
  const limit = req.path === "/api/templates/" + req.path.split("/")[3] + "/logo" ||
                req.path.endsWith("/logo") ? "300kb" : "50kb";
  express.json({ limit })(req, res, next);
});

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
// Use better-sqlite3 (synchronous) wrapped in a sqlite3-compatible shim
// so all existing db.run/db.get/db.all callback code works unchanged.
const BetterSqlite3 = require("better-sqlite3");
const _bsdb = new BetterSqlite3("./database.sqlite");
console.log("✅ Connected to SQLite: ./database.sqlite");

// Enable WAL mode and foreign keys synchronously
_bsdb.pragma("journal_mode = WAL");
_bsdb.pragma("foreign_keys = ON");

// Shim: expose db.run / db.get / db.all / db.serialize with the same
// callback signatures as the sqlite3 package.
const db = {
  serialize(fn) { fn(); },

  run(sql, params, callback) {
    if (typeof params === "function") { callback = params; params = []; }
    if (!Array.isArray(params)) params = params ? [params] : [];
    try {
      const stmt = _bsdb.prepare(sql);
      const info = stmt.run(...params);
      // Mimic sqlite3's `this` context inside the callback
      if (typeof callback === "function") {
        callback.call({ lastID: info.lastInsertRowid, changes: info.changes }, null);
      }
    } catch (err) {
      if (typeof callback === "function") callback(err);
      else if (!/duplicate column/i.test(err.message)) {
        // Silently swallow expected migration errors; log others
        console.error("db.run error:", err.message, "\nSQL:", sql);
      }
    }
  },

  get(sql, params, callback) {
    if (typeof params === "function") { callback = params; params = []; }
    if (!Array.isArray(params)) params = params ? [params] : [];
    try {
      const row = _bsdb.prepare(sql).get(...params);
      if (typeof callback === "function") callback(null, row);
    } catch (err) {
      if (typeof callback === "function") callback(err, null);
      else console.error("db.get error:", err.message, "\nSQL:", sql);
    }
  },

  all(sql, params, callback) {
    if (typeof params === "function") { callback = params; params = []; }
    if (!Array.isArray(params)) params = params ? [params] : [];
    try {
      const rows = _bsdb.prepare(sql).all(...params);
      if (typeof callback === "function") callback(null, rows);
    } catch (err) {
      if (typeof callback === "function") callback(err, []);
      else console.error("db.all error:", err.message, "\nSQL:", sql);
    }
  },
};

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
      grade TEXT,
      amount REAL NOT NULL,
      durationWeeks INTEGER,
      paidDate TEXT,
      dueDate TEXT NOT NULL,
      status TEXT DEFAULT 'Active',
      cardToken TEXT,
      cardType TEXT DEFAULT 'standard',
      pledgeAmount REAL,
      paymentMode TEXT DEFAULT 'Cash',
      mpesaRef TEXT,
      refundReason TEXT,
      FOREIGN KEY(school_id) REFERENCES schools(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS scans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      school_id INTEGER NOT NULL,
      adm TEXT,
      scanDate TEXT,
      mealDate TEXT,
      mealType TEXT DEFAULT 'lunch',
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
      `ALTER TABLE transactions ADD COLUMN grade TEXT`,
      `ALTER TABLE scans ADD COLUMN mealType TEXT DEFAULT 'lunch'`,
      `ALTER TABLE transactions ADD COLUMN cardType TEXT DEFAULT 'standard'`,
      `ALTER TABLE transactions ADD COLUMN pledgeAmount REAL`,
      `ALTER TABLE transactions ADD COLUMN paymentMode TEXT DEFAULT 'Cash'`,
      `ALTER TABLE transactions ADD COLUMN mpesaRef TEXT`,
      `ALTER TABLE transactions ADD COLUMN refundReason TEXT`,
      `ALTER TABLE schools ADD COLUMN accountantPasswordHash TEXT`,
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
  body("accountantPassword")
    .optional()
    .isLength({ min: 8 })
    .withMessage("Accountant password must be at least 8 characters")
    .matches(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/)
    .withMessage(
      "Accountant password must contain uppercase, number, and special character",
    ),
  validate,
  async (req, res) => {
    const { name, username, adminPassword, teacherPassword, accountantPassword } = req.body;
    const hashes = await Promise.all([
      bcrypt.hash(adminPassword, 12),
      bcrypt.hash(teacherPassword, 12),
      accountantPassword ? bcrypt.hash(accountantPassword, 12) : Promise.resolve(null),
    ]);
    const [adminPasswordHash, teacherPasswordHash, accountantPasswordHash] = hashes;
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
    db.run(
      `INSERT INTO schools (name, username, adminPasswordHash, teacherPasswordHash, accountantPasswordHash, plan, trialEndsAt) VALUES (?,?,?,?,?,?,?)`,
      [
        name.trim(),
        username.trim().toLowerCase(),
        adminPasswordHash,
        teacherPasswordHash,
        accountantPasswordHash,
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
  body("accountantPassword")
    .optional()
    .isLength({ min: 8 })
    .withMessage("Accountant password must be at least 8 characters")
    .matches(/^(?=.*[A-Z])(?=.*[0-9])(?=.*[^A-Za-z0-9]).{8,}$/)
    .withMessage(
      "Accountant password must contain uppercase, number, and special character",
    ),
  validate,
  async (req, res) => {
    const { name, adminPassword, teacherPassword, accountantPassword } = req.body;
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
    if (accountantPassword) {
      fields.push("accountantPasswordHash = ?");
      values.push(await bcrypt.hash(accountantPassword, 12));
    }
    // Stamp passwordChangedAt so existing tokens are invalidated
    if (adminPassword || teacherPassword || accountantPassword) {
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
  body("role").optional().isIn(["admin", "teacher", "accountant"]),
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
          const dummyHash =
            "$2a$12$invalidhashfortimingprotection000000000000000000000000";
          const isTeacher = role === "teacher";
          const isAccountant = role === "accountant";
          const hash = school
            ? isTeacher
              ? school.teacherPasswordHash
              : isAccountant
                ? (school.accountantPasswordHash || school.teacherPasswordHash)
                : school.adminPasswordHash
            : dummyHash;
          const valid = await bcrypt.compare(password, hash || dummyHash);

          if (!school || !valid) {
            recordLoginAttempt(username.toLowerCase(), ipAddress, false);
            logAudit("LOGIN_FAILED", username.toLowerCase(), "Invalid credentials", req);
            return res.status(401).json({ error: "Invalid username or password" });
          }

          if (!hash) {
            recordLoginAttempt(username.toLowerCase(), ipAddress, false);
            return res.status(401).json({ error: "Account not fully configured. Contact your administrator." });
          }

          recordLoginAttempt(username.toLowerCase(), ipAddress, true);
          const roleLabel = isTeacher ? "teacher" : isAccountant ? "accountant" : "admin";
          logAudit("LOGIN_SUCCESS", username.toLowerCase(), `Successful ${roleLabel} login`, req);

          const userRole = isTeacher ? "teacher" : isAccountant ? "accountant" : "admin";
          const token = jwt.sign(
            { schoolId: school.id, role: userRole },
            _JWT_SECRET,
            { expiresIn: "12h" },
          );

          generateRefreshToken(school.id, (refreshErr, refreshTokenData) => {
            const response = {
              token,
              schoolName: school.name,
              role: userRole,
              subscription: getSubscriptionState(school),
            };
            if (refreshTokenData) response.refreshToken = refreshTokenData.token;
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
      `SELECT id, studentName, adm, grade, amount, durationWeeks, paidDate, dueDate, status, cardToken, cardType, pledgeAmount, paymentMode, mpesaRef FROM transactions WHERE school_id=? AND status != 'Archived' ORDER BY id DESC`,
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
    const grade = req.body.grade ? stripHtml(String(req.body.grade)).trim().slice(0, 50) : null;
    const cardType = ["standard", "pledge", "special"].includes(req.body.cardType) ? req.body.cardType : "standard";
    const pledgeAmount = cardType === "pledge" && req.body.pledgeAmount ? parseFloat(req.body.pledgeAmount) : null;
    const paymentMode = ["Cash", "M-Pesa", "Bank Deposit", "Cheque"].includes(req.body.paymentMode) ? req.body.paymentMode : "Cash";
    const mpesaRef = req.body.mpesaRef ? stripHtml(String(req.body.mpesaRef)).trim().slice(0, 30) : null;
    const cardToken = generateToken();

    db.run(
      `INSERT INTO transactions (school_id,studentName,adm,grade,amount,durationWeeks,paidDate,dueDate,status,cardToken,cardType,pledgeAmount,paymentMode,mpesaRef) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        req.school.schoolId,
        studentName,
        adm,
        grade,
        amount,
        durationWeeks,
        paidDate,
        dueDate,
        status || "Active",
        cardToken,
        cardType,
        pledgeAmount,
        paymentMode,
        mpesaRef,
      ],
      function (err) {
        if (err)
          return res.status(500).json({ error: "Failed to save transaction" });
        logAudit(
          "TRANSACTION_CREATED",
          adm,
          `Created transaction for ${studentName} (${cardType})`,
          req,
        );
        res.status(201).json({
          id: this.lastID,
          studentName,
          adm,
          grade,
          amount,
          durationWeeks,
          paidDate,
          dueDate,
          status,
          cardToken,
          cardType,
          pledgeAmount,
          paymentMode,
          mpesaRef,
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
    // Soft-delete: archive the record instead of destroying it.
    // Data is preserved for financial records and scan history.
    db.run(
      `UPDATE transactions SET status='Archived' WHERE id=? AND school_id=?`,
      [req.params.id, req.school.schoolId],
      function (err) {
        if (err) return res.status(500).json({ error: "Archive failed" });
        if (this.changes === 0)
          return res.status(404).json({ error: "Not found" });
        logAudit("TRANSACTION_ARCHIVED", String(req.params.id), "Student record archived (soft delete)", req);
        res.json({ success: true });
      },
    );
  },
);

// ─── Get archived transactions ───────────────────────────────
app.get(
  "/api/transactions/archived",
  requireAuth,
  requireSubscription,
  noCache,
  (req, res) => {
    if (req.school.role !== "admin")
      return res.status(403).json({ error: "Forbidden" });
    db.all(
      `SELECT id, studentName, adm, grade, amount, paidDate, dueDate, cardType FROM transactions WHERE school_id=? AND status='Archived' ORDER BY id DESC`,
      [req.school.schoolId],
      (err, rows) => {
        if (err) return res.status(500).json({ error: "Failed to fetch archived records" });
        res.json(rows);
      },
    );
  },
);

// ─── Restore archived transaction ────────────────────────────
app.post(
  "/api/transactions/:id/restore",  requireAuth,
  requireSubscription,
  param("id").isInt().withMessage("Invalid ID"),
  validate,
  (req, res) => {
    if (req.school.role !== "admin")
      return res.status(403).json({ error: "Forbidden" });
    db.run(
      `UPDATE transactions SET status='Active' WHERE id=? AND school_id=? AND status='Archived'`,
      [req.params.id, req.school.schoolId],
      function (err) {
        if (err) return res.status(500).json({ error: "Restore failed" });
        if (this.changes === 0)
          return res.status(404).json({ error: "Not found or not archived" });
        logAudit("TRANSACTION_RESTORED", String(req.params.id), "Student record restored from archive", req);
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

// ─── Update card type (pledge / special / standard) ──────────
app.patch(
  "/api/transactions/:id/cardtype",
  requireAuth,
  requireSubscription,
  param("id").isInt().withMessage("Invalid ID"),
  body("cardType").isIn(["standard", "pledge", "special"]).withMessage("Invalid cardType"),
  body("pledgeAmount").optional({ nullable: true }).isFloat({ min: 0 }).withMessage("Invalid pledge amount"),
  body("dueDate").optional({ nullable: true }).isDate().withMessage("Invalid due date"),
  validate,
  (req, res) => {
    if (req.school.role !== "admin")
      return res.status(403).json({ error: "Forbidden" });
    const { cardType } = req.body;
    const pledgeAmount = cardType === "pledge" && req.body.pledgeAmount ? parseFloat(req.body.pledgeAmount) : null;
    const fields = ["cardType=?", "pledgeAmount=?"];
    const values = [cardType, pledgeAmount];
    if (req.body.dueDate) { fields.push("dueDate=?"); values.push(req.body.dueDate); }
    values.push(req.params.id, req.school.schoolId);
    db.run(
      `UPDATE transactions SET ${fields.join(", ")} WHERE id=? AND school_id=?`,
      values,
      function (err) {
        if (err) return res.status(500).json({ error: "Update failed" });
        if (this.changes === 0) return res.status(404).json({ error: "Not found" });
        db.get(`SELECT * FROM transactions WHERE id=?`, [req.params.id], (err, row) => res.json(row));
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
  body("mealType")
    .optional()
    .isIn(["tea", "lunch", "supper"])
    .withMessage("mealType must be tea, lunch, or supper"),
  validate,
  (req, res) => {
    const mealType = req.body.mealType || "lunch";
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
            `INSERT INTO scans (school_id, adm, scanDate, mealDate, mealType, status) VALUES (?,?,?,?,?,?)`,
            [req.school.schoolId, row.adm, now.toISOString(), today, mealType, "REJECTED"],
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

        // ── Double-dip check — already scanned for this meal today? ──
        db.get(
          `SELECT id FROM scans WHERE school_id=? AND adm=? AND mealDate=? AND mealType=? AND status='APPROVED'`,
          [req.school.schoolId, row.adm, today, mealType],
          (err2, existing) => {
            if (err2) return res.status(500).json({ error: "Scan failed" });

            const mealLabels = { tea: "Tea Break", lunch: "Lunch", supper: "Supper" };
            const mealLabel = mealLabels[mealType] || mealType;

            if (existing) {
              db.run(
                `INSERT INTO scans (school_id, adm, scanDate, mealDate, mealType, status) VALUES (?,?,?,?,?,?)`,
                [req.school.schoolId, row.adm, now.toISOString(), today, mealType, "DUPLICATE"],
              );
              const safeStudent = {
                studentName: row.studentName,
                adm: row.adm,
                dueDate: row.dueDate,
              };
              return res.json({
                valid: false,
                duplicate: true,
                mealType,
                message: `${row.studentName} already received ${mealLabel} today.`,
                student: safeStudent,
              });
            }

            // ── All clear — approve the meal ─────────────────────
            db.run(
              `INSERT INTO scans (school_id, adm, scanDate, mealDate, mealType, status) VALUES (?,?,?,?,?,?)`,
              [req.school.schoolId, row.adm, now.toISOString(), today, mealType, "APPROVED"],
            );
            const safeStudent = {
              studentName: row.studentName,
              adm: row.adm,
              dueDate: row.dueDate,
            };
            res.json({
              valid: true,
              mealType,
              message: `${mealLabel} approved. Valid until ${row.dueDate}`,
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
      SUM(CASE WHEN status='DUPLICATE' THEN 1 ELSE 0 END) as duplicates,
      SUM(CASE WHEN status='APPROVED' AND mealType='tea' THEN 1 ELSE 0 END) as tea,
      SUM(CASE WHEN status='APPROVED' AND mealType='lunch' THEN 1 ELSE 0 END) as lunch,
      SUM(CASE WHEN status='APPROVED' AND mealType='supper' THEN 1 ELSE 0 END) as supper
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
      `SELECT s.id, s.adm, s.scanDate, s.status, s.mealType, t.studentName, t.grade
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

// ─── Accountant API endpoints ────────────────────────────────

// Financial summary
app.get("/api/accountant/summary", requireAuth, requireSubscription, noCache, (req, res) => {
  if (!["admin", "accountant"].includes(req.school.role))
    return res.status(403).json({ error: "Forbidden" });
  const today = new Date().toISOString().split("T")[0];
  db.get(
    `SELECT
      SUM(CASE WHEN status != 'Archived' AND amount > 0 THEN amount ELSE 0 END) as totalRevenue,
      SUM(CASE WHEN paidDate = ? AND status != 'Archived' AND amount > 0 THEN amount ELSE 0 END) as todayRevenue,
      COUNT(CASE WHEN status = 'Active' AND dueDate >= ? THEN 1 END) as activeCards,
      COUNT(CASE WHEN status != 'Archived' AND dueDate < ? THEN 1 END) as expiredCards,
      COUNT(CASE WHEN status != 'Archived' AND amount < 0 THEN 1 END) as refunds,
      SUM(CASE WHEN status != 'Archived' AND amount < 0 THEN amount ELSE 0 END) as totalRefunds
    FROM transactions WHERE school_id=?`,
    [today, today, today, req.school.schoolId],
    (err, row) => {
      if (err) return res.status(500).json({ error: "Failed to fetch summary" });
      // Today's approved meal scans
      db.get(
        `SELECT COUNT(*) as todayMeals FROM scans WHERE school_id=? AND mealDate=? AND status='APPROVED'`,
        [req.school.schoolId, today],
        (err2, scans) => {
          res.json({ ...row, todayMeals: scans?.todayMeals || 0 });
        }
      );
    }
  );
});

// Payments with date range filter
app.get("/api/accountant/payments", requireAuth, requireSubscription, noCache, (req, res) => {
  if (!["admin", "accountant"].includes(req.school.role))
    return res.status(403).json({ error: "Forbidden" });
  const { from, to } = req.query;
  let sql = `SELECT id, studentName, adm, grade, amount, paidDate, dueDate, paymentMode, mpesaRef, cardType, status, refundReason
             FROM transactions WHERE school_id=? AND status != 'Archived'`;
  const params = [req.school.schoolId];
  if (from) { sql += ` AND paidDate >= ?`; params.push(from); }
  if (to)   { sql += ` AND paidDate <= ?`; params.push(to); }
  sql += ` ORDER BY paidDate DESC, id DESC`;
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: "Failed to fetch payments" });
    res.json(rows);
  });
});

// Defaulters (expired cards)
app.get("/api/accountant/defaulters", requireAuth, requireSubscription, noCache, (req, res) => {
  if (!["admin", "accountant"].includes(req.school.role))
    return res.status(403).json({ error: "Forbidden" });
  const today = new Date().toISOString().split("T")[0];
  db.all(
    `SELECT id, studentName, adm, grade, amount, dueDate, paymentMode, cardType
     FROM transactions WHERE school_id=? AND status='Active' AND dueDate < ?
     ORDER BY dueDate ASC`,
    [req.school.schoolId, today],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Failed to fetch defaulters" });
      res.json(rows);
    }
  );
});

// Top-up / extend card
app.post(
  "/api/accountant/topup",
  requireAuth,
  requireSubscription,
  body("adm").trim().notEmpty().withMessage("Admission number required"),
  body("amount").isFloat({ min: 1 }).withMessage("Amount must be positive"),
  body("dueDate").isDate().withMessage("Invalid due date"),
  body("paymentMode").isIn(["Cash", "M-Pesa", "Bank Deposit", "Cheque"]).withMessage("Invalid payment mode"),
  body("mpesaRef").optional({ checkFalsy: true }).isString().isLength({ max: 30 }),
  validate,
  (req, res) => {
    if (!["admin", "accountant"].includes(req.school.role))
      return res.status(403).json({ error: "Forbidden" });
    const { adm, amount, dueDate, paymentMode, mpesaRef } = req.body;
    const paidDate = new Date().toISOString().split("T")[0];
    db.get(
      `SELECT * FROM transactions WHERE adm=? AND school_id=? AND status != 'Archived' ORDER BY id DESC LIMIT 1`,
      [adm.trim(), req.school.schoolId],
      (err, tx) => {
        if (err || !tx) return res.status(404).json({ error: "Student not found" });
        db.run(
          `UPDATE transactions SET amount=amount+?, dueDate=?, status='Active', paymentMode=?, mpesaRef=?, paidDate=? WHERE id=? AND school_id=?`,
          [parseFloat(amount), dueDate, paymentMode, mpesaRef || null, paidDate, tx.id, req.school.schoolId],
          function(err2) {
            if (err2) return res.status(500).json({ error: "Top-up failed" });
            logAudit("TOPUP", adm, `Top-up KSh ${amount} via ${paymentMode}${mpesaRef ? " ref:" + mpesaRef : ""}`, req);
            db.get(`SELECT * FROM transactions WHERE id=?`, [tx.id], (e, row) => res.json(row));
          }
        );
      }
    );
  }
);

// Refund / negative transaction
app.post(
  "/api/accountant/refund",
  requireAuth,
  requireSubscription,
  body("adm").trim().notEmpty().withMessage("Admission number required"),
  body("amount").isFloat({ min: 1 }).withMessage("Refund amount must be positive"),
  body("reason").trim().notEmpty().isLength({ max: 200 }).withMessage("Reason is required"),
  validate,
  (req, res) => {
    if (!["admin", "accountant"].includes(req.school.role))
      return res.status(403).json({ error: "Forbidden" });
    const { adm, amount, reason } = req.body;
    const paidDate = new Date().toISOString().split("T")[0];
    const today = paidDate;
    db.get(
      `SELECT * FROM transactions WHERE adm=? AND school_id=? AND status != 'Archived' ORDER BY id DESC LIMIT 1`,
      [adm.trim(), req.school.schoolId],
      (err, tx) => {
        if (err || !tx) return res.status(404).json({ error: "Student not found" });
        const cardToken = generateToken();
        db.run(
          `INSERT INTO transactions (school_id,studentName,adm,grade,amount,paidDate,dueDate,status,cardToken,cardType,paymentMode,refundReason)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          [req.school.schoolId, tx.studentName, tx.adm, tx.grade, -Math.abs(parseFloat(amount)),
           paidDate, today, "Refund", cardToken, "standard", "Refund", stripHtml(reason)],
          function(err2) {
            if (err2) return res.status(500).json({ error: "Refund failed" });
            logAudit("REFUND", adm, `Refund KSh ${amount} — ${reason}`, req);
            res.json({ success: true, refundId: this.lastID });
          }
        );
      }
    );
  }
);

// Meal attendance — dates with student counts
app.get("/api/accountant/meal-attendance", requireAuth, requireSubscription, noCache, (req, res) => {
  if (!["admin", "accountant"].includes(req.school.role))
    return res.status(403).json({ error: "Forbidden" });
  const { date } = req.query;
  if (date) {
    // Return students for a specific date — use subquery to avoid duplicate rows from multiple transactions
    db.all(
      `SELECT
        t.studentName, t.adm, t.grade,
        MAX(CASE WHEN s.mealType='tea'    AND s.status='APPROVED' THEN 1 ELSE 0 END) as tea,
        MAX(CASE WHEN s.mealType='lunch'  AND s.status='APPROVED' THEN 1 ELSE 0 END) as lunch,
        MAX(CASE WHEN s.mealType='supper' AND s.status='APPROVED' THEN 1 ELSE 0 END) as supper,
        SUM(CASE WHEN s.status='APPROVED' THEN 1 ELSE 0 END) as totalMeals
       FROM scans s
       JOIN (
         SELECT adm, studentName, grade, school_id
         FROM transactions
         WHERE school_id=? AND status != 'Archived'
         GROUP BY adm
       ) t ON s.adm = t.adm AND s.school_id = t.school_id
       WHERE s.school_id=? AND s.mealDate=?
       GROUP BY s.adm
       ORDER BY t.studentName ASC`,
      [req.school.schoolId, req.school.schoolId, date],
      (err, rows) => {
        if (err) {
          console.error("meal-attendance date query error:", err.message);
          return res.status(500).json({ error: "Failed to fetch attendance" });
        }
        res.json(rows);
      }
    );
  } else {
    // Return summary per date — only dates that have scans
    db.all(
      `SELECT
        mealDate as date,
        COUNT(DISTINCT adm) as studentCount,
        SUM(CASE WHEN mealType='tea'    AND status='APPROVED' THEN 1 ELSE 0 END) as tea,
        SUM(CASE WHEN mealType='lunch'  AND status='APPROVED' THEN 1 ELSE 0 END) as lunch,
        SUM(CASE WHEN mealType='supper' AND status='APPROVED' THEN 1 ELSE 0 END) as supper,
        SUM(CASE WHEN status='APPROVED' THEN 1 ELSE 0 END) as totalMeals
       FROM scans
       WHERE school_id=? AND mealDate IS NOT NULL AND mealDate != ''
       GROUP BY mealDate
       ORDER BY mealDate DESC`,
      [req.school.schoolId],
      (err, rows) => {
        if (err) {
          console.error("meal-attendance summary query error:", err.message);
          return res.status(500).json({ error: "Failed to fetch attendance" });
        }
        res.json(rows);
      }
    );
  }
});

// Meal attendance CSV export for a specific date
app.get("/api/accountant/meal-attendance/export-csv", requireAuth, requireSubscription, (req, res) => {
  if (!["admin", "accountant"].includes(req.school.role))
    return res.status(403).json({ error: "Forbidden" });
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "Date required" });
  db.all(
    `SELECT
      t.studentName, t.adm, t.grade,
      MAX(CASE WHEN s.mealType='tea'    AND s.status='APPROVED' THEN 1 ELSE 0 END) as tea,
      MAX(CASE WHEN s.mealType='lunch'  AND s.status='APPROVED' THEN 1 ELSE 0 END) as lunch,
      MAX(CASE WHEN s.mealType='supper' AND s.status='APPROVED' THEN 1 ELSE 0 END) as supper,
      SUM(CASE WHEN s.status='APPROVED' THEN 1 ELSE 0 END) as totalMeals
     FROM scans s
     JOIN (
       SELECT adm, studentName, grade, school_id
       FROM transactions
       WHERE school_id=? AND status != 'Archived'
       GROUP BY adm
     ) t ON s.adm = t.adm AND s.school_id = t.school_id
     WHERE s.school_id=? AND s.mealDate=?
     GROUP BY s.adm
     ORDER BY t.studentName ASC`,
    [req.school.schoolId, req.school.schoolId, date],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Export failed" });
      const headers = ["Student Name", "Adm No.", "Grade/Stream", "Tea Break", "Lunch", "Supper", "Total Meals"];
      const csvRows = rows.map(r => [
        `"${r.studentName}"`, r.adm, `"${r.grade || ""}"`,
        r.tea ? "Yes" : "No", r.lunch ? "Yes" : "No", r.supper ? "Yes" : "No", r.totalMeals
      ].join(","));
      const csv = [headers.join(","), ...csvRows].join("\n");
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="attendance-${date}.csv"`);
      res.send(csv);
    }
  );
});

// CSV export
app.get("/api/accountant/export-csv", requireAuth, requireSubscription, (req, res) => {
  if (!["admin", "accountant"].includes(req.school.role))
    return res.status(403).json({ error: "Forbidden" });
  const { from, to } = req.query;
  let sql = `SELECT id, studentName, adm, grade, amount, paidDate, dueDate, paymentMode, mpesaRef, cardType, status, refundReason
             FROM transactions WHERE school_id=? AND status != 'Archived'`;
  const params = [req.school.schoolId];
  if (from) { sql += ` AND paidDate >= ?`; params.push(from); }
  if (to)   { sql += ` AND paidDate <= ?`; params.push(to); }
  sql += ` ORDER BY paidDate DESC, id DESC`;
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: "Export failed" });
    const headers = ["ID","Student Name","Adm No.","Grade","Amount (KSh)","Paid Date","Due Date","Payment Mode","M-Pesa Ref","Card Type","Status","Refund Reason"];
    const csvRows = rows.map(r => [
      r.id, `"${r.studentName}"`, r.adm, `"${r.grade||""}"`, r.amount,
      r.paidDate, r.dueDate, r.paymentMode||"Cash", r.mpesaRef||"",
      r.cardType||"standard", r.status, `"${r.refundReason||""}"`
    ].join(","));
    const csv = [headers.join(","), ...csvRows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="payments-export.csv"`);
    res.send(csv);
  });
});

// ─── Per-student meal breakdown ───────────────────────────────
app.get(
  "/api/scans/student-breakdown",
  requireAuth,
  requireSubscription,
  noCache,
  (req, res) => {
    db.all(
      `SELECT t.adm, t.studentName, t.grade,
        SUM(CASE WHEN s.status='APPROVED' AND s.mealType='tea'    THEN 1 ELSE 0 END) as tea,
        SUM(CASE WHEN s.status='APPROVED' AND s.mealType='lunch'  THEN 1 ELSE 0 END) as lunch,
        SUM(CASE WHEN s.status='APPROVED' AND s.mealType='supper' THEN 1 ELSE 0 END) as supper,
        SUM(CASE WHEN s.status='APPROVED' THEN 1 ELSE 0 END) as totalMeals
       FROM transactions t
       LEFT JOIN scans s ON s.adm=t.adm AND s.school_id=t.school_id
       WHERE t.school_id=?
       GROUP BY t.adm, t.studentName, t.grade
       ORDER BY t.studentName ASC`,
      [req.school.schoolId],
      (err, rows) => {
        if (err) return res.status(500).json({ error: "Failed to fetch breakdown" });
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
        if (!logoData || typeof logoData !== "string") {
          return res.status(400).json({ error: "Invalid logo data." });
        }

        // Validate MIME type — only allow common image formats
        const allowedTypes = ["data:image/png;", "data:image/jpeg;", "data:image/jpg;", "data:image/gif;", "data:image/webp;", "data:image/svg+xml;"];
        if (!allowedTypes.some(t => logoData.startsWith(t))) {
          return res.status(400).json({
            error: "Invalid image type. Allowed: PNG, JPEG, GIF, WebP, SVG.",
          });
        }

        // Enforce 200KB file size limit (base64 is ~33% larger than binary)
        const MAX_SIZE_BYTES = 200 * 1024; // 200KB
        const base64Data = logoData.split(",")[1] || logoData;
        const approxBytes = Math.ceil(base64Data.length * 0.75);
        if (approxBytes > MAX_SIZE_BYTES) {
          return res.status(413).json({
            error: `Logo too large (${Math.round(approxBytes / 1024)}KB). Maximum allowed size is 200KB.`,
          });
        }
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
