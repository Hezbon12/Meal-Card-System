/**
 * backup.js — SQLite backup script
 * Run manually or via cron: 0 2 * * * node /path/to/backend/backup.js
 *
 * Creates a timestamped copy of the database in ./backups/
 * Keep the last 30 days of backups automatically.
 */

'use strict';

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || './database.sqlite';
const BACKUP_DIR = process.env.BACKUP_DIR || './backups';
const KEEP_DAYS = parseInt(process.env.BACKUP_KEEP_DAYS || '30');

if (!fs.existsSync(DB_PATH)) {
  console.error(`Database not found at ${DB_PATH}`);
  process.exit(1);
}

// Create backup directory if it doesn't exist
if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

// Create timestamped backup
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupFile = path.join(BACKUP_DIR, `database-${timestamp}.sqlite`);
fs.copyFileSync(DB_PATH, backupFile);
console.log(`Backup created: ${backupFile}`);

// Remove backups older than KEEP_DAYS
const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
const files = fs.readdirSync(BACKUP_DIR).filter(f => f.startsWith('database-') && f.endsWith('.sqlite'));
let removed = 0;
files.forEach(f => {
  const filePath = path.join(BACKUP_DIR, f);
  if (fs.statSync(filePath).mtimeMs < cutoff) {
    fs.unlinkSync(filePath);
    removed++;
  }
});

console.log(`Kept ${files.length - removed} backups, removed ${removed} old backups.`);
