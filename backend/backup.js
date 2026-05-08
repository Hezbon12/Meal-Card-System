'use strict';
const fs = require('fs');
const path = require('path');

// Create a backups folder if it doesn't exist
const backupDir = path.join(process.cwd(), 'backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const dbFile = path.join(process.cwd(), 'database.sqlite');
if (!fs.existsSync(dbFile)) {
  console.error('❌ Backup failed: database.sqlite not found at', dbFile);
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFile = path.join(backupDir, `backup-${timestamp}.sqlite`);

try {
  fs.copyFileSync(dbFile, backupFile);
  console.log(`✅ Backup created: ${backupFile}`);

  // Delete backups older than 7 days
  const files = fs.readdirSync(backupDir);
  const now = Date.now();
  files.forEach(file => {
    const filePath = path.join(backupDir, file);
    const stats = fs.statSync(filePath);
    const daysOld = (now - stats.mtimeMs) / (1000 * 60 * 60 * 24);
    if (daysOld > 7) {
      fs.unlinkSync(filePath);
      console.log(`🗑  Deleted old backup: ${file}`);
    }
  });
} catch (err) {
  console.error('❌ Backup failed:', err.message);
  process.exit(1);
}
