const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./database.sqlite');
db.serialize(() => {
  db.run('ALTER TABLE audit_log ADD COLUMN ipAddress TEXT', err => {
    if (err && !err.message.includes('duplicate')) console.log('ipAddress:', err.message);
    else console.log('ipAddress column ready');
  });
  db.run('ALTER TABLE audit_log ADD COLUMN userAgent TEXT', err => {
    if (err && !err.message.includes('duplicate')) console.log('userAgent:', err.message);
    else console.log('userAgent column ready');
  });
  db.run('ALTER TABLE audit_log ADD COLUMN userId TEXT', err => {
    if (err && !err.message.includes('duplicate')) console.log('userId:', err.message);
    else console.log('userId column ready');
    db.close(() => console.log('Done.'));
  });
});
