/**
 * ShuleMeal Cards — Backend Server (PostgreSQL Version)
 * Production-hardened: rate limiting, helmet, input validation,
 * CORS locked to env, secrets from env, subscription enforcement.
 */

"use strict";

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { body, param, validationResult } = require("express-validator");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

// ─── Encryption utilities for sensitive data at rest ──────
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString("hex");
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

// AES-256 needs exactly 32 bytes. ENCRYPTION_KEY is a 64-char hex string = 32 bytes.
function _keyBuf() {
  const hex = ENCRYPTION_KEY.length >= 64 ? ENCRYPTION_KEY.slice(0, 64) : ENCRYPTION_KEY.padEnd(64, "0");
  return Buffer.from(hex, "hex");
}

function encrypt(text) {
  if (!text) return text;
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, _keyBuf(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return iv.toString("hex") + ":" + authTag + ":" + encrypted;
}

function decrypt(encryptedText) {
  if (!encryptedText || !encryptedText.includes(":")) return encryptedText;
  try {
    const parts = encryptedText.split(":");
    if (parts.length !== 3) return encryptedText;
    const iv = Buffer.from(parts[0], "hex");
    const authTag = Buffer.from(parts[1], "hex");
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, _keyBuf(), iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (e) {
    return encryptedText;
  }
}

// ─── Validation helpers ──────
const KENYAN_PHONE_REGEX = /^(?:\+254|254|0)?(?:7\d{2}|1\d{2})\d{6}$/;
function isValidKenyanPhone(phone) {
  if (typeof phone !== "string") return false;
  return KENYAN_PHONE_REGEX.test(phone.replace(/[\s\-()]/g, ""));
}

function isValidAdm(adm) {
  if (typeof adm !== "string" || adm.length === 0 || adm.length > 30) return false;
  return /^[a-zA-Z0-9\-_]+$/.test(adm);
}

function stripHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/<[^>]*>/g, "").replace(/javascript:/gi, "").replace(/on\w+\s*=/gi, "").trim();
}

// ─── Environment / Config ─────────────────────────────────────
const PORT = process.env.PORT || 5000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const DATABASE_URL = process.env.DATABASE_URL;

const JWT_SECRET = process.env.JWT_SECRET;
const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD;

if (!DATABASE_URL) {
  console.error("FATAL: DATABASE_URL environment variable is missing.");
  process.exit(1);
}

const _JWT_SECRET = JWT_SECRET || "shulemeal-super-secret-change-in-production";
const _SUPER_ADMIN_PASSWORD = SUPER_ADMIN_PASSWORD || "superadmin2026";

let _SUPER_ADMIN_HASH = null;
bcrypt.hash(_SUPER_ADMIN_PASSWORD, 12).then((h) => { _SUPER_ADMIN_HASH = h; });

// ─── App setup ────────────────────────────────────────────────
const app = express();
app.set("etag", false);
app.use(helmet({ hsts: { maxAge: 31536000, includeSubDomains: true, preload: true } }));
app.use(cors({
  origin: ALLOWED_ORIGIN === "*" ? "*" : ALLOWED_ORIGIN.split(",").map((s) => s.trim()),
  methods:["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use((req, res, next) => {
  const limit = req.path === "/api/templates/" + req.path.split("/")[3] + "/logo" || req.path.endsWith("/logo") ? "300kb" : "50kb";
  express.json({ limit })(req, res, next);
});

// ─── PostgreSQL Database Setup ─────────────────────────────────
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Required for Neon/Supabase
});

console.log("Connecting to PostgreSQL...");
pool.on('error', (err) => console.error("❌ PostgreSQL pool error:", err.message));

// Retry connection on startup — useful when DB is waking up (e.g. Supabase free tier)
async function connectWithRetry(retries = 5, delayMs = 3000) {
  for (let i = 1; i <= retries; i++) {
    try {
      const client = await pool.connect();
      client.release();
      console.log("✅ Connected to PostgreSQL");
      return true;
    } catch (err) {
      console.error(`❌ DB connection attempt ${i}/${retries} failed: ${err.message}`);
      if (i < retries) {
        console.log(`   Retrying in ${delayMs / 1000}s...`);
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  console.error("❌ Could not connect to PostgreSQL after all retries.");
  console.error("   If using Supabase free tier, unpause your project at supabase.com/dashboard");
  return false;
}

connectWithRetry().then(ok => { if (ok) initSchema(); });

// ─── Magical SQLite-to-Postgres Wrapper ───
const db = {
  serialize(fn) { fn(); },
  _convert(sql) {
    let i = 1;
    return sql.replace(/\?/g, () => `$${i++}`);
  },
  run(sql, params, callback) {
    if (typeof params === "function") { callback = params; params =[]; }
    let pgSql = this._convert(sql);
    
    // Auto-append RETURNING id for inserts so this.lastID works
    if (pgSql.trim().toUpperCase().startsWith("INSERT") && !pgSql.toUpperCase().includes("RETURNING")) {
      pgSql += " RETURNING id";
    }

    pool.query(pgSql, params ||[], (err, res) => {
      if (typeof callback === "function") {
        const lastID = (res && res.rows && res.rows.length > 0) ? res.rows[0].id : null;
        const changes = res ? res.rowCount : 0;
        callback.call({ lastID, changes }, err);
      } else if (err && !err.message.includes("already exists")) {
        console.error("DB Run Error:", err.message);
      }
    });
  },
  get(sql, params, callback) {
    if (typeof params === "function") { callback = params; params =[]; }
    pool.query(this._convert(sql), params ||[], (err, res) => {
      if (typeof callback === "function") callback(err, res ? res.rows[0] : null);
    });
  },
  all(sql, params, callback) {
    if (typeof params === "function") { callback = params; params =[]; }
    pool.query(this._convert(sql), params ||[], (err, res) => {
      if (typeof callback === "function") callback(err, res ? res.rows :[]);
    });
  }
};

const generateToken = () => crypto.randomBytes(16).toString("hex");

// ─── Normalize PostgreSQL lowercase columns to camelCase ──────
// PostgreSQL lowercases all unquoted identifiers. This maps them back
// to the camelCase keys the frontend expects.
function normalizeTx(row) {
  if (!row) return row;
  return {
    id: row.id,
    school_id: row.school_id,
    studentName: decrypt(row.studentname || row.studentName || ""),
    adm: decrypt(row.adm || ""),
    grade: row.grade,
    amount: row.amount,
    durationWeeks: row.durationweeks ?? row.durationWeeks,
    paidDate: row.paiddate || row.paidDate,
    dueDate: row.duedate || row.dueDate,
    status: row.status,
    cardToken: row.cardtoken || row.cardToken,
    cardType: row.cardtype || row.cardType,
    pledgeAmount: row.pledgeamount ?? row.pledgeAmount,
    paymentMode: row.paymentmode || row.paymentMode,
    mpesaRef: row.mpesaref || row.mpesaRef,
    refundReason: row.refundreason || row.refundReason,
  };
}

// ─── Initialize PostgreSQL Schema (Forced Sequential Order) ───
const initSchema = async () => {
  try {
    const tables =[
      `CREATE TABLE IF NOT EXISTS schools (id SERIAL PRIMARY KEY, name TEXT NOT NULL, username TEXT UNIQUE NOT NULL, adminPasswordHash TEXT NOT NULL, teacherPasswordHash TEXT NOT NULL, accountantPasswordHash TEXT, plan TEXT DEFAULT 'trial', subscriptionExpiry TEXT DEFAULT NULL, gracePeriodDays INTEGER DEFAULT 7, trialEndsAt TEXT DEFAULT NULL, createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, passwordChangedAt TIMESTAMP DEFAULT NULL)`,
      `CREATE TABLE IF NOT EXISTS transactions (id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE, studentName TEXT NOT NULL, adm TEXT NOT NULL, grade TEXT, amount REAL NOT NULL, durationWeeks INTEGER, paidDate TEXT, dueDate TEXT NOT NULL, status TEXT DEFAULT 'Active', cardToken TEXT, cardType TEXT DEFAULT 'standard', pledgeAmount REAL, paymentMode TEXT DEFAULT 'Cash', mpesaRef TEXT, refundReason TEXT)`,
      `CREATE TABLE IF NOT EXISTS scans (id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE, adm TEXT, scanDate TEXT, mealDate TEXT, mealType TEXT DEFAULT 'lunch', status TEXT)`,
      `CREATE TABLE IF NOT EXISTS audit_log (id SERIAL PRIMARY KEY, action TEXT NOT NULL, target TEXT, detail TEXT, ipAddress TEXT, userAgent TEXT, userId TEXT, performedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS login_attempts (id SERIAL PRIMARY KEY, username TEXT NOT NULL, ipAddress TEXT, attemptedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP, success INTEGER DEFAULT 0)`,
      `CREATE TABLE IF NOT EXISTS refresh_tokens (id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE, token TEXT UNIQUE NOT NULL, expiresAt TEXT NOT NULL, used INTEGER DEFAULT 0, createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS card_templates (id SERIAL PRIMARY KEY, school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE, name TEXT NOT NULL, primaryColor TEXT DEFAULT '#4f46e5', secondaryColor TEXT DEFAULT '#818cf8', backgroundColor TEXT DEFAULT '#ffffff', textColor TEXT DEFAULT '#1f2937', logoPath TEXT, logoData BYTEA, showSchoolName INTEGER DEFAULT 1, showStudentPhoto INTEGER DEFAULT 0, qrPosition TEXT DEFAULT 'right', borderRadius INTEGER DEFAULT 12, fontSize INTEGER DEFAULT 14, isDefault INTEGER DEFAULT 0, createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`,
      `CREATE TABLE IF NOT EXISTS signups (id SERIAL PRIMARY KEY, "schoolName" TEXT, name TEXT, phone TEXT, email TEXT, plan TEXT, message TEXT, "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`
    ];

    // Build tables one by one so they don't trip over each other
    for (const sql of tables) {
      await pool.query(sql);
    }

    const indexes =[
      `CREATE INDEX IF NOT EXISTS idx_transactions_school ON transactions(school_id)`,
      `CREATE INDEX IF NOT EXISTS idx_scans_school ON scans(school_id)`,
      `CREATE INDEX IF NOT EXISTS idx_transactions_token ON transactions(cardToken)`,
      `CREATE INDEX IF NOT EXISTS idx_scans_meal_date ON scans(school_id, adm, mealDate)`,
      `CREATE INDEX IF NOT EXISTS idx_audit_log_performed_at ON audit_log(performedAt)`,
      `CREATE INDEX IF NOT EXISTS idx_login_attempts_username ON login_attempts(username)`,
      `CREATE INDEX IF NOT EXISTS idx_login_attempts_ip ON login_attempts(ipAddress)`,
      `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token ON refresh_tokens(token)`,
      `CREATE INDEX IF NOT EXISTS idx_card_templates_school ON card_templates(school_id)`
    ];
    
    // Build indexes one by one
    for (const sql of indexes) {
      await pool.query(sql);
    }

    // Backfill existing tokens safely
    const { rows } = await pool.query(`SELECT id FROM transactions WHERE cardToken IS NULL`);
    if (rows && rows.length > 0) {
      for (const row of rows) {
        await pool.query(`UPDATE transactions SET cardToken = $1 WHERE id = $2`, [generateToken(), row.id]);
      }
    }
    console.log("✅ Database schema initialized successfully!");
  } catch (err) {
    console.error("❌ Schema Init Error:", err.message);
  }
};

// initSchema is called by connectWithRetry() above after successful connection

// ─── Middleware ───────────────────────────────────────────────
function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
  next();
}

function noCache(req, res, next) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  res.set("Pragma", "no-cache");
  next();
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(header.slice(7), _JWT_SECRET);
    db.get(`SELECT passwordChangedAt FROM schools WHERE id = ?`,[payload.schoolId], (err, school) => {
      if (err || !school) return res.status(401).json({ error: "Unauthorized" });
      if (school.passwordchangedat && payload.iat < new Date(school.passwordchangedat).getTime() / 1000) {
        return res.status(401).json({ error: "Session expired. Please log in again." });
      }
      req.school = payload;
      next();
    });
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireSuperAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(header.slice(7), _JWT_SECRET);
    if (payload.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
    req.superAdmin = payload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function logAudit(action, target, detail, req) {
  const ip = req?.ip || "unknown";
  const agent = req?.headers?.["user-agent"] || "unknown";
  const uid = req?.school?.schoolId || req?.superAdmin?.id || "unknown";
  db.run(`INSERT INTO audit_log (action, target, detail, ipAddress, userAgent, userId) VALUES (?,?,?,?,?,?)`,[action, target, detail, ip, agent, uid]);
}

// ─── Subscription Logic ───────────────────────────────────────
function getSubscriptionState(school) {
  const today = new Date().toISOString().split("T")[0];
  if (school.plan === "trial") {
    const trialEnd = school.trialendsat || today;
    if (today <= trialEnd) return { active: true, state: "trial", expiry: trialEnd, daysLeft: Math.ceil((new Date(trialEnd) - new Date(today)) / 86400000) };
    return { active: false, state: "trial_expired", expiry: trialEnd, daysLeft: 0 };
  }
  if (!school.subscriptionexpiry) return { active: false, state: "no_subscription", expiry: null, daysLeft: 0 };
  const expiry = school.subscriptionexpiry;
  const graceEnd = new Date(expiry);
  graceEnd.setDate(graceEnd.getDate() + (school.graceperioddays || 7));
  const graceEndStr = graceEnd.toISOString().split("T")[0];
  if (today <= expiry) return { active: true, state: Math.ceil((new Date(expiry) - new Date(today)) / 86400000) <= 7 ? "expiring_soon" : "active", expiry, daysLeft: Math.ceil((new Date(expiry) - new Date(today)) / 86400000) };
  if (today <= graceEndStr) return { active: true, state: "grace_period", expiry, graceEnd: graceEndStr, daysLeft: Math.ceil((graceEnd - new Date(today)) / 86400000) };
  return { active: false, state: "expired", expiry, daysLeft: 0 };
}

function requireSubscription(req, res, next) {
  db.get(`SELECT * FROM schools WHERE id = ?`, [req.school.schoolId], (err, school) => {
    if (err || !school) return res.status(500).json({ error: "School not found" });
    const sub = getSubscriptionState(school);
    if (!sub.active) return res.status(402).json({ error: "subscription_required", state: sub.state, expiry: sub.expiry });
    req.subscription = sub;
    next();
  });
}

// ─── General Endpoints ────────────────────────────────────────
app.get("/api/health", (req, res) => res.json({ ok: true }));

app.post("/api/auth/login", body("username").trim().notEmpty(), body("password").notEmpty(), validate, (req, res) => {
  const { username, password, role } = req.body;
  db.get(`SELECT * FROM schools WHERE username = ?`,[username.toLowerCase()], async (err, school) => {
    if (err) return res.status(500).json({ error: "Server error" });
    const isTeacher = role === "teacher";
    const isAccountant = role === "accountant";
    const hash = school ? (isTeacher ? school.teacherpasswordhash : isAccountant ? (school.accountantpasswordhash || school.teacherpasswordhash) : school.adminpasswordhash) : "$2a$12$invalidhashfortimingprotection000000000000000000000000";
    const valid = await bcrypt.compare(password, hash);
    if (!school || !valid) return res.status(401).json({ error: "Invalid username or password" });
    const userRole = isTeacher ? "teacher" : isAccountant ? "accountant" : "admin";
    const token = jwt.sign({ schoolId: school.id, role: userRole }, _JWT_SECRET, { expiresIn: "12h" });
    res.json({ token, schoolName: school.name, role: userRole, subscription: getSubscriptionState(school) });
  });
});

app.get("/api/subscription/status", requireAuth, noCache, (req, res) => {
  db.get(`SELECT * FROM schools WHERE id = ?`,[req.school.schoolId], (err, school) => {
    res.json(getSubscriptionState(school));
  });
});

// ─── ADMIN: Transactions ──────────────────────────────────────
app.get("/api/transactions", requireAuth, requireSubscription, noCache, (req, res) => {
  db.all(`SELECT * FROM transactions WHERE school_id=? AND status != 'Archived' ORDER BY id DESC`, [req.school.schoolId], (err, rows) => {
    if (err) return res.status(500).json({ error: "Failed" });
    res.json((rows || []).map(normalizeTx));
  });
});

app.post("/api/transactions", requireAuth, requireSubscription, body("studentName").notEmpty(), body("adm").notEmpty(), body("amount").isFloat(), validate, (req, res) => {
  if (req.school.role !== "admin") return res.status(403).json({ error: "Forbidden" });
  const { amount, durationWeeks, paidDate, dueDate, status, grade, cardType, pledgeAmount, paymentMode, mpesaRef } = req.body;
  const studentName = stripHtml(req.body.studentName);
  const adm = stripHtml(req.body.adm).trim();
  const cardToken = generateToken();
  db.run(
    `INSERT INTO transactions (school_id,studentName,adm,grade,amount,durationWeeks,paidDate,dueDate,status,cardToken,cardType,pledgeAmount,paymentMode,mpesaRef) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,[req.school.schoolId, encrypt(studentName), encrypt(adm), grade, amount, durationWeeks, paidDate, dueDate, status || "Active", cardToken, cardType || "standard", pledgeAmount, paymentMode || "Cash", mpesaRef],
    function (err) {
      if (err) return res.status(500).json({ error: "Failed to save" });
      res.status(201).json({ id: this.lastID, studentName, adm, grade, amount, durationWeeks, paidDate, dueDate, status, cardToken, cardType, pledgeAmount, paymentMode, mpesaRef });
    }
  );
});

app.put("/api/transactions/:id", requireAuth, requireSubscription, (req, res) => {
  const { dueDate, amount } = req.body;
  db.run(`UPDATE transactions SET dueDate=?, amount=amount+?, status='Active' WHERE id=? AND school_id=?`, [dueDate, amount, req.params.id, req.school.schoolId], function (err) {
    db.get(`SELECT * FROM transactions WHERE id=?`, [req.params.id], (e, row) => res.json(normalizeTx(row)));
  });
});

app.delete("/api/transactions/:id", requireAuth, requireSubscription, (req, res) => {
  db.run(`UPDATE transactions SET status='Archived' WHERE id=? AND school_id=?`, [req.params.id, req.school.schoolId], () => res.json({ success: true }));
});

app.get("/api/transactions/archived", requireAuth, requireSubscription, (req, res) => {
  db.all(`SELECT * FROM transactions WHERE school_id=? AND status='Archived' ORDER BY id DESC`, [req.school.schoolId], (err, rows) => {
    res.json((rows || []).map(normalizeTx));
  });
});

app.post("/api/transactions/:id/restore", requireAuth, requireSubscription, (req, res) => {
  db.run(`UPDATE transactions SET status='Active' WHERE id=? AND school_id=? AND status='Archived'`, [req.params.id, req.school.schoolId], () => res.json({ success: true }));
});

app.post("/api/transactions/:id/replace", requireAuth, requireSubscription, (req, res) => {
  const newToken = generateToken();
  db.run(`UPDATE transactions SET cardToken=? WHERE id=? AND school_id=?`, [newToken, req.params.id, req.school.schoolId], () => {
    db.get(`SELECT * FROM transactions WHERE id=?`, [req.params.id], (e, row) => res.json(normalizeTx(row)));
  });
});

app.patch("/api/transactions/:id/cardtype", requireAuth, requireSubscription, (req, res) => {
  const { cardType, pledgeAmount, dueDate } = req.body;
  db.run(`UPDATE transactions SET cardType=?, pledgeAmount=?, dueDate=? WHERE id=? AND school_id=?`, [cardType, pledgeAmount, dueDate || null, req.params.id, req.school.schoolId], () => {
    db.get(`SELECT * FROM transactions WHERE id=?`, [req.params.id], (e, row) => res.json(normalizeTx(row)));
  });
});

app.get("/api/transactions/:id/qr", requireAuth, requireSubscription, (req, res) => {
  db.get(`SELECT cardToken, adm, dueDate FROM transactions WHERE id=? AND school_id=?`, [req.params.id, req.school.schoolId], (err, row) => {
    if (err || !row) return res.status(404).json({ error: "Not found" });
    const token = row.cardtoken || row.cardToken;
    const duedate = row.duedate || row.dueDate;
    const data = JSON.stringify({ token, adm: decrypt(row.adm), due: duedate });
    require("qrcode").toDataURL(data, { width: 200, margin: 1 }, (err, url) => res.json({ qr: url }));
  });
});

// ─── TEACHER: QR Scan ─────────────────────────────────────────
app.post("/api/scan", requireAuth, requireSubscription, (req, res) => {
  const mealType = req.body.mealType || "lunch";
  db.get(`SELECT * FROM transactions WHERE cardToken=? AND school_id=?`, [req.body.token, req.school.schoolId], (err, row) => {
    if (err || !row) return res.json({ valid: false, message: "Card not recognised." });
    const decryptedName = decrypt(row.studentname || row.studentName || "");
    const decryptedAdm = decrypt(row.adm || "");
    const dueDate = row.duedate || row.dueDate;
    const safeStudent = { studentName: decryptedName, adm: decryptedAdm, dueDate };
    const today = new Date().toISOString().split("T")[0];
    const mealLabels = { tea: "Tea Break", lunch: "Lunch", supper: "Supper" };
    if (dueDate < today) {
      db.run(`INSERT INTO scans (school_id, adm, scanDate, mealDate, mealType, status) VALUES (?,?,?,?,?,?)`, [req.school.schoolId, row.adm, new Date().toISOString(), today, mealType, "REJECTED"]);
      return res.json({ valid: false, message: `Meal plan expired on ${dueDate}`, student: safeStudent });
    }
    db.get(`SELECT id FROM scans WHERE school_id=? AND adm=? AND mealDate=? AND mealType=? AND status='APPROVED'`, [req.school.schoolId, row.adm, today, mealType], (err2, existing) => {
      if (existing) {
        db.run(`INSERT INTO scans (school_id, adm, scanDate, mealDate, mealType, status) VALUES (?,?,?,?,?,?)`, [req.school.schoolId, row.adm, new Date().toISOString(), today, mealType, "DUPLICATE"]);
        return res.json({ valid: false, duplicate: true, mealType, message: `${decryptedName} already received ${mealLabels[mealType] || mealType} today.`, student: safeStudent });
      }
      db.run(`INSERT INTO scans (school_id, adm, scanDate, mealDate, mealType, status) VALUES (?,?,?,?,?,?)`, [req.school.schoolId, row.adm, new Date().toISOString(), today, mealType, "APPROVED"]);
      res.json({ valid: true, mealType, message: `${mealLabels[mealType] || mealType} approved. Valid until ${dueDate}`, student: safeStudent });
    });
  });
});

// ─── ACCOUNTANT: Portals & Exports ────────────────────────────
app.get("/api/accountant/summary", requireAuth, requireSubscription, (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  db.get(`SELECT SUM(CASE WHEN status != 'Archived' AND amount > 0 THEN amount ELSE 0 END) as totalRevenue, SUM(CASE WHEN paidDate = ? AND status != 'Archived' AND amount > 0 THEN amount ELSE 0 END) as todayRevenue, COUNT(CASE WHEN status = 'Active' AND dueDate >= ? THEN 1 END) as activeCards, COUNT(CASE WHEN status != 'Archived' AND dueDate < ? THEN 1 END) as expiredCards FROM transactions WHERE school_id=?`, [today, today, today, req.school.schoolId], (err, row) => {
    db.get(`SELECT COUNT(*) as todayMeals FROM scans WHERE school_id=? AND mealDate=? AND status='APPROVED'`, [req.school.schoolId, today], (err2, scans) => {
      res.json({
        totalRevenue: Number(row?.totalrevenue || 0),
        todayRevenue: Number(row?.todayrevenue || 0),
        activeCards: Number(row?.activecards || 0),
        expiredCards: Number(row?.expiredcards || 0),
        todayMeals: Number(scans?.todaymeals || 0),
      });
    });
  });
});

app.get("/api/accountant/payments", requireAuth, requireSubscription, (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT * FROM transactions WHERE school_id=? AND status != 'Archived'`;
  const params = [req.school.schoolId];
  if (from) { sql += ` AND paidDate >= ?`; params.push(from); }
  if (to)   { sql += ` AND paidDate <= ?`; params.push(to); }
  sql += ` ORDER BY paidDate DESC, id DESC`;
  db.all(sql, params, (err, rows) => res.json((rows || []).map(normalizeTx)));
});

app.get("/api/accountant/defaulters", requireAuth, requireSubscription, (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  db.all(`SELECT * FROM transactions WHERE school_id=? AND status='Active' AND dueDate < ? ORDER BY dueDate ASC`, [req.school.schoolId, today], (err, rows) => {
    res.json((rows || []).map(normalizeTx));
  });
});

app.post("/api/accountant/topup", requireAuth, requireSubscription, (req, res) => {
  const { adm, amount, dueDate, paymentMode, mpesaRef } = req.body;
  const paidDate = new Date().toISOString().split("T")[0];
  db.get(`SELECT * FROM transactions WHERE adm=? AND school_id=? AND status != 'Archived' ORDER BY id DESC LIMIT 1`, [encrypt(adm.trim()), req.school.schoolId], (err, tx) => {
    if (err || !tx) return res.status(404).json({ error: "Student not found" });
    db.run(`UPDATE transactions SET amount=amount+?, dueDate=?, status='Active', paymentMode=?, mpesaRef=?, paidDate=? WHERE id=? AND school_id=?`, [parseFloat(amount), dueDate, paymentMode, mpesaRef || null, paidDate, tx.id, req.school.schoolId], () => {
      db.get(`SELECT * FROM transactions WHERE id=?`, [tx.id], (e, row) => res.json(normalizeTx(row)));
    });
  });
});

app.post("/api/accountant/refund", requireAuth, requireSubscription, (req, res) => {
  const { adm, amount, reason } = req.body;
  const today = new Date().toISOString().split("T")[0];
  db.get(`SELECT * FROM transactions WHERE adm=? AND school_id=? AND status != 'Archived' ORDER BY id DESC LIMIT 1`, [encrypt(adm.trim()), req.school.schoolId], (err, tx) => {
    if (err || !tx) return res.status(404).json({ error: "Student not found" });
    db.run(`INSERT INTO transactions (school_id,studentName,adm,grade,amount,paidDate,dueDate,status,cardToken,cardType,paymentMode,refundReason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      [req.school.schoolId, tx.studentname || tx.studentName, tx.adm, tx.grade, -Math.abs(parseFloat(amount)), today, today, "Refund", generateToken(), "standard", "Refund", stripHtml(reason)],
      function(err2) { res.json({ success: true, refundId: this.lastID }); }
    );
  });
});

app.get("/api/accountant/meal-attendance", requireAuth, requireSubscription, (req, res) => {
  const { date } = req.query;
  if (date) {
    db.all(
      `SELECT s.adm, t.studentname, t.grade,
        MAX(CASE WHEN s.mealtype='tea'    AND s.status='APPROVED' THEN 1 ELSE 0 END) as tea,
        MAX(CASE WHEN s.mealtype='lunch'  AND s.status='APPROVED' THEN 1 ELSE 0 END) as lunch,
        MAX(CASE WHEN s.mealtype='supper' AND s.status='APPROVED' THEN 1 ELSE 0 END) as supper,
        SUM(CASE WHEN s.status='APPROVED' THEN 1 ELSE 0 END) as totalmeal
       FROM scans s
       JOIN (
         SELECT adm, studentname, grade, school_id
         FROM transactions
         WHERE school_id=? AND status != 'Archived'
         GROUP BY adm, studentname, grade, school_id
       ) t ON s.adm=t.adm AND s.school_id=t.school_id
       WHERE s.school_id=? AND s.mealdate=?
       GROUP BY s.adm, t.studentname, t.grade
       ORDER BY t.studentname ASC`,
      [req.school.schoolId, req.school.schoolId, date],
      (err, rows) => {
        if (err) { console.error("meal-attendance date error:", err.message); return res.status(500).json({ error: "Failed" }); }
        res.json((rows || []).map(r => ({
          studentName: decrypt(r.studentname || ""),
          adm: decrypt(r.adm || ""),
          grade: r.grade,
          tea: Number(r.tea || 0),
          lunch: Number(r.lunch || 0),
          supper: Number(r.supper || 0),
          totalMeals: Number(r.totalmeal || 0),
        })));
      }
    );
  } else {
    db.all(
      `SELECT mealdate as date,
        COUNT(DISTINCT adm) as studentcount,
        SUM(CASE WHEN mealtype='tea'    AND status='APPROVED' THEN 1 ELSE 0 END) as tea,
        SUM(CASE WHEN mealtype='lunch'  AND status='APPROVED' THEN 1 ELSE 0 END) as lunch,
        SUM(CASE WHEN mealtype='supper' AND status='APPROVED' THEN 1 ELSE 0 END) as supper,
        SUM(CASE WHEN status='APPROVED' THEN 1 ELSE 0 END) as totalmeal
       FROM scans
       WHERE school_id=? AND mealdate IS NOT NULL AND mealdate != ''
       GROUP BY mealdate
       ORDER BY mealdate DESC`,
      [req.school.schoolId],
      (err, rows) => {
        if (err) { console.error("meal-attendance summary error:", err.message); return res.status(500).json({ error: "Failed" }); }
        res.json((rows || []).map(r => ({
          date: r.date,
          studentCount: Number(r.studentcount || 0),
          tea: Number(r.tea || 0),
          lunch: Number(r.lunch || 0),
          supper: Number(r.supper || 0),
          totalMeals: Number(r.totalmeal || 0),
        })));
      }
    );
  }
});

app.get("/api/accountant/meal-attendance/export-csv", requireAuth, requireSubscription, (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: "Date required" });
  db.all(
    `SELECT s.adm, t.studentname, t.grade,
      MAX(CASE WHEN s.mealtype='tea'    AND s.status='APPROVED' THEN 1 ELSE 0 END) as tea,
      MAX(CASE WHEN s.mealtype='lunch'  AND s.status='APPROVED' THEN 1 ELSE 0 END) as lunch,
      MAX(CASE WHEN s.mealtype='supper' AND s.status='APPROVED' THEN 1 ELSE 0 END) as supper,
      SUM(CASE WHEN s.status='APPROVED' THEN 1 ELSE 0 END) as totalmeal
     FROM scans s
     JOIN (
       SELECT adm, studentname, grade, school_id
       FROM transactions
       WHERE school_id=? AND status != 'Archived'
       GROUP BY adm, studentname, grade, school_id
     ) t ON s.adm=t.adm AND s.school_id=t.school_id
     WHERE s.school_id=? AND s.mealdate=?
     GROUP BY s.adm, t.studentname, t.grade
     ORDER BY t.studentname ASC`,
    [req.school.schoolId, req.school.schoolId, date],
    (err, rows) => {
      if (err) return res.status(500).json({ error: "Export failed" });
      const csvRows = (rows || []).map(r => [
        `"${decrypt(r.studentname || "")}"`,
        decrypt(r.adm || ""),
        `"${r.grade || ""}"`,
        r.tea ? "Yes" : "No",
        r.lunch ? "Yes" : "No",
        r.supper ? "Yes" : "No",
        r.totalmeal || 0,
      ].join(","));
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename="attendance-${date}.csv"`);
      res.send(["Student Name,Adm No.,Grade/Stream,Tea Break,Lunch,Supper,Total Meals", ...csvRows].join("\n"));
    }
  );
});

app.get("/api/accountant/export-csv", requireAuth, requireSubscription, (req, res) => {
  const { from, to } = req.query;
  let sql = `SELECT * FROM transactions WHERE school_id=? AND status != 'Archived'`;
  const params = [req.school.schoolId];
  if (from) { sql += ` AND paidDate >= ?`; params.push(from); }
  if (to)   { sql += ` AND paidDate <= ?`; params.push(to); }
  sql += ` ORDER BY paidDate DESC, id DESC`;
  db.all(sql, params, (err, rows) => {
    const csvRows = (rows || []).map(r => {
      const n = normalizeTx(r);
      return [n.id, `"${n.studentName}"`, n.adm, `"${n.grade || ""}"`, n.amount, n.paidDate, n.dueDate, n.paymentMode || "Cash", n.mpesaRef || "", n.cardType || "standard", n.status, `"${n.refundReason || ""}"`].join(",");
    });
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="payments-export.csv"`);
    res.send(["ID,Student Name,Adm No.,Grade,Amount (KSh),Paid Date,Due Date,Payment Mode,M-Pesa Ref,Card Type,Status,Refund Reason", ...csvRows].join("\n"));
  });
});

// ─── Scans reporting ──────────────────────────────────────────
app.get("/api/scans/summary", requireAuth, requireSubscription, (req, res) => {
  db.all(`SELECT SUBSTRING(scanDate, 1, 10) as date, COUNT(*) as total, SUM(CASE WHEN status='APPROVED' THEN 1 ELSE 0 END) as approved, SUM(CASE WHEN status='REJECTED' THEN 1 ELSE 0 END) as rejected, SUM(CASE WHEN status='DUPLICATE' THEN 1 ELSE 0 END) as duplicates, SUM(CASE WHEN status='APPROVED' AND mealType='tea' THEN 1 ELSE 0 END) as tea, SUM(CASE WHEN status='APPROVED' AND mealType='lunch' THEN 1 ELSE 0 END) as lunch, SUM(CASE WHEN status='APPROVED' AND mealType='supper' THEN 1 ELSE 0 END) as supper FROM scans WHERE school_id=? GROUP BY SUBSTRING(scanDate, 1, 10) ORDER BY date DESC`, [req.school.schoolId], (err, rows) => {
    res.json((rows || []).map(r => ({ date: r.date, total: Number(r.total || 0), approved: Number(r.approved || 0), rejected: Number(r.rejected || 0), duplicates: Number(r.duplicates || 0), tea: Number(r.tea || 0), lunch: Number(r.lunch || 0), supper: Number(r.supper || 0) })));
  });
});

app.get("/api/scans/detailed", requireAuth, requireSubscription, (req, res) => {
  db.all(`SELECT s.id, s.adm, s.scanDate, s.status, s.mealType, t.studentName, t.grade FROM scans s LEFT JOIN transactions t ON s.adm=t.adm AND t.school_id=s.school_id WHERE s.school_id=? ORDER BY s.id DESC LIMIT 200`, [req.school.schoolId], (err, rows) => {
    res.json((rows || []).map(r => ({ id: r.id, adm: decrypt(r.adm || ""), scanDate: r.scandate || r.scanDate, status: r.status, mealType: r.mealtype || r.mealType, studentName: decrypt(r.studentname || r.studentName || ""), grade: r.grade })));
  });
});

app.get("/api/scans/student-breakdown", requireAuth, requireSubscription, (req, res) => {
  db.all(`SELECT t.adm, t.studentName, t.grade, SUM(CASE WHEN s.status='APPROVED' AND s.mealType='tea' THEN 1 ELSE 0 END) as tea, SUM(CASE WHEN s.status='APPROVED' AND s.mealType='lunch' THEN 1 ELSE 0 END) as lunch, SUM(CASE WHEN s.status='APPROVED' AND s.mealType='supper' THEN 1 ELSE 0 END) as supper, SUM(CASE WHEN s.status='APPROVED' THEN 1 ELSE 0 END) as totalMeals FROM transactions t LEFT JOIN scans s ON s.adm=t.adm AND s.school_id=t.school_id WHERE t.school_id=? GROUP BY t.adm, t.studentName, t.grade ORDER BY t.studentName ASC`, [req.school.schoolId], (err, rows) => {
    res.json((rows || []).map(r => ({ adm: decrypt(r.adm || ""), studentName: decrypt(r.studentname || r.studentName || ""), grade: r.grade, tea: Number(r.tea || 0), lunch: Number(r.lunch || 0), supper: Number(r.supper || 0), totalMeals: Number(r.totalmeals || 0) })));
  });
});

// ─── Templates API ──────────────────────────────────────────
app.get("/api/templates/default", requireAuth, (req, res) => {
  db.get(`SELECT * FROM card_templates WHERE school_id=? AND isDefault=1`, [req.school.schoolId], (err, row) => {
    if (!row) return res.json({ id: null, name: "Default", primaryColor: "#4f46e5", secondaryColor: "#818cf8", backgroundColor: "#ffffff", textColor: "#1f2937", logoPath: null, showSchoolName: 1, showStudentPhoto: 0, qrPosition: "right", borderRadius: 12, fontSize: 14, isDefault: 0 });
    res.json(row);
  });
});

app.get("/api/templates", requireAuth, (req, res) => {
  db.all(`SELECT * FROM card_templates WHERE school_id=? ORDER BY isDefault DESC, createdAt DESC`, [req.school.schoolId], (err, rows) => {
    res.json(rows || []);
  });
});

app.post("/api/templates/:id/logo", requireAuth, (req, res) => {
  const templateId = parseInt(req.params.id, 10);
  db.get(`SELECT id FROM card_templates WHERE id=? AND school_id=?`, [templateId, req.school.schoolId], (err, template) => {
    if (!template) return res.status(404).json({ error: "Template not found" });
    const { logoData } = req.body;
    if (!logoData || typeof logoData !== "string") return res.status(400).json({ error: "Invalid logo data." });
    const allowedTypes = ["data:image/png;", "data:image/jpeg;", "data:image/jpg;", "data:image/gif;", "data:image/webp;", "data:image/svg+xml;"];
    if (!allowedTypes.some(t => logoData.startsWith(t))) return res.status(400).json({ error: "Invalid image type. Allowed: PNG, JPEG, GIF, WebP, SVG." });
    const base64Data = logoData.split(",")[1] || logoData;
    if (Math.ceil(base64Data.length * 0.75) > 200 * 1024) return res.status(413).json({ error: "Logo too large. Maximum 200KB." });
    const logoPath = `/uploads/logos/school_${req.school.schoolId}_${templateId}_${Date.now()}.png`;
    db.run(`UPDATE card_templates SET logoPath=?, logoData=? WHERE id=?`, [logoPath, base64Data, templateId], () => {
      res.json({ message: "Logo uploaded successfully", logoPath });
    });
  });
});

// ─── Super Admin ──────────────────────────────────────────────
function requireSuperAdmin(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = jwt.verify(header.slice(7), _JWT_SECRET);
    if (payload.role !== "superadmin") return res.status(403).json({ error: "Forbidden" });
    req.superAdmin = payload;
    next();
  } catch { res.status(401).json({ error: "Invalid token" }); }
}

app.post("/api/superadmin/login", body("password").notEmpty(), validate, (req, res) => {
  const dummyHash = "$2a$12$invalidhashfortimingprotection000000000000000000000000";
  bcrypt.compare(req.body.password, _SUPER_ADMIN_HASH || dummyHash).then(valid => {
    if (!valid) return res.status(401).json({ error: "Invalid password" });
    const token = jwt.sign({ role: "superadmin" }, _JWT_SECRET, { expiresIn: "8h" });
    res.json({ token });
  });
});

app.get("/api/superadmin/schools", requireSuperAdmin, noCache, (req, res) => {
  db.all(`SELECT id, name, username, plan, subscriptionExpiry, gracePeriodDays, trialEndsAt, createdAt FROM schools ORDER BY id DESC`, [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json((rows || []).map(s => ({ ...s, subscription: getSubscriptionState(s) })));
  });
});

app.post("/api/superadmin/schools", requireSuperAdmin, body("name").trim().notEmpty(), body("username").trim().notEmpty(), body("adminPassword").isLength({ min: 8 }), body("teacherPassword").isLength({ min: 8 }), validate, async (req, res) => {
  try {
    const { name, username, adminPassword, teacherPassword, accountantPassword } = req.body;
    const [adminHash, teacherHash, accountantHash] = await Promise.all([
      bcrypt.hash(adminPassword, 12),
      bcrypt.hash(teacherPassword, 12),
      accountantPassword ? bcrypt.hash(accountantPassword, 12) : Promise.resolve(null),
    ]);
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    db.run(`INSERT INTO schools (name, username, adminPasswordHash, teacherPasswordHash, accountantPasswordHash, plan, trialEndsAt) VALUES (?,?,?,?,?,?,?)`,
      [name.trim(), username.trim().toLowerCase(), adminHash, teacherHash, accountantHash, "trial", trialEndsAt],
      function(err) {
        if (err) return res.status(400).json({ error: err.message?.includes("unique") || err.message?.includes("UNIQUE") ? "Username already taken" : err.message });
        res.status(201).json({ id: this.lastID, name, username });
      }
    );
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put("/api/superadmin/schools/:id", requireSuperAdmin, async (req, res) => {
  try {
    const { name, adminPassword, teacherPassword, accountantPassword } = req.body;
    let sql = `UPDATE schools SET name=?`;
    const vals = [name];
    if (adminPassword) { sql += `, adminPasswordHash=?`; vals.push(await bcrypt.hash(adminPassword, 12)); }
    if (teacherPassword) { sql += `, teacherPasswordHash=?`; vals.push(await bcrypt.hash(teacherPassword, 12)); }
    if (accountantPassword) { sql += `, accountantPasswordHash=?`; vals.push(await bcrypt.hash(accountantPassword, 12)); }
    if (adminPassword || teacherPassword || accountantPassword) { sql += `, passwordChangedAt=?`; vals.push(new Date().toISOString()); }
    sql += ` WHERE id=?`; vals.push(req.params.id);
    db.run(sql, vals, (err) => {
      if (err) return res.status(500).json({ error: "Update failed" });
      res.json({ success: true });
    });
    if (req.body.plan || req.body.months) {
      db.get(`SELECT * FROM schools WHERE id=?`, [req.params.id], (err, school) => {
        if (!school) return;
        let newExpiry = school.subscriptionExpiry;
        if (req.body.months) {
          const base = new Date(Math.max(new Date(), school.subscriptionExpiry ? new Date(school.subscriptionExpiry) : new Date()));
          base.setMonth(base.getMonth() + parseInt(req.body.months));
          newExpiry = base.toISOString().split("T")[0];
        }
        const f = [], v = [];
        if (req.body.plan) { f.push("plan=?"); v.push(req.body.plan); }
        if (newExpiry) { f.push("subscriptionExpiry=?"); v.push(newExpiry); }
        if (f.length) { v.push(req.params.id); db.run(`UPDATE schools SET ${f.join(",")} WHERE id=?`, v, () => {}); }
      });
    }
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete("/api/superadmin/schools/:id", requireSuperAdmin, (req, res) => {
  db.run(`DELETE FROM schools WHERE id=?`, [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: "Delete failed" });
    res.json({ success: true });
  });
});

app.put("/api/superadmin/schools/:id/subscription", requireSuperAdmin, (req, res) => {
  const { plan, months, gracePeriodDays } = req.body;
  db.get(`SELECT * FROM schools WHERE id=?`, [req.params.id], (err, school) => {
    if (!school) return res.status(404).json({ error: "Not found" });
    let newExpiry = school.subscriptionExpiry;
    if (months) {
      const base = new Date(Math.max(new Date(), school.subscriptionExpiry ? new Date(school.subscriptionExpiry) : new Date()));
      base.setMonth(base.getMonth() + parseInt(months));
      newExpiry = base.toISOString().split("T")[0];
    }
    const f = [], v = [];
    if (plan) { f.push("plan=?"); v.push(plan); }
    if (newExpiry) { f.push("subscriptionExpiry=?"); v.push(newExpiry); }
    if (gracePeriodDays !== undefined) { f.push("gracePeriodDays=?"); v.push(gracePeriodDays); }
    if (!f.length) return res.status(400).json({ error: "Nothing to update" });
    v.push(req.params.id);
    db.run(`UPDATE schools SET ${f.join(",")} WHERE id=?`, v, (err2) => {
      if (err2) return res.status(500).json({ error: "Update failed" });
      db.get(`SELECT * FROM schools WHERE id=?`, [req.params.id], (e, updated) => {
        res.json({ success: true, subscription: getSubscriptionState(updated) });
      });
    });
  });
});

app.get("/api/superadmin/audit", requireSuperAdmin, (req, res) => {
  db.all(`SELECT * FROM audit_log ORDER BY id DESC LIMIT 500`, [], (err, rows) => res.json(rows || []));
});

app.get("/api/superadmin/signups", requireSuperAdmin, (req, res) => {
  db.all(`SELECT id, schoolname AS "schoolName", name, phone, email, plan, message, createdat AS "createdAt" FROM signups ORDER BY id DESC`, [], (err, rows) => res.json(rows || []));
});

app.delete("/api/superadmin/signups/:id", requireSuperAdmin, (req, res) => {
  db.run(`DELETE FROM signups WHERE id=?`, [req.params.id], () => res.json({ success: true }));
});

// ─── Public signup ────────────────────────────────────────────
app.post("/api/signup", body("schoolName").trim().notEmpty(), body("name").trim().notEmpty(), body("phone").trim().notEmpty(), body("plan").isIn(["basic", "standard", "premium"]), validate, async (req, res) => {
  const { schoolName, name, phone, email, plan, message } = req.body;
  db.run(`INSERT INTO signups ("schoolName", name, phone, email, plan, message) VALUES (?,?,?,?,?,?)`,
    [schoolName, name, phone, email || null, plan, message || null], () => {});
  res.json({ success: true });
});

// ─── Auth refresh ─────────────────────────────────────────────
app.post("/api/auth/refresh", (req, res) => {
  res.status(501).json({ error: "Token refresh not implemented" });
});

// ─── 404 catch-all ────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ error: "Not found" }));

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`[${new Date().toISOString()}] Backend running on http://localhost:${PORT}`);
});