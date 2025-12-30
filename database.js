
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const db = new sqlite3.Database(path.join(__dirname, 'null-core.db'));

function initDB() {
  db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS guild_settings (
      guild_id TEXT PRIMARY KEY,
      skipAdmins INTEGER DEFAULT 1,
      skipBots INTEGER DEFAULT 1
    )`);
    db.run(`CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT,
      action TEXT,
      target_id TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  });
}

function getGuildSettings(guildId) {
  return new Promise(resolve => {
    db.get(`SELECT * FROM guild_settings WHERE guild_id=?`, [guildId], (e, r) => {
      if (!r) {
        db.run(`INSERT INTO guild_settings (guild_id) VALUES (?)`, [guildId]);
        return resolve({ skipAdmins: true, skipBots: true });
      }
      resolve({ skipAdmins: !!r.skipAdmins, skipBots: !!r.skipBots });
    });
  });
}

function setGuildSetting(guildId, key, value) {
  db.run(`UPDATE guild_settings SET ${key}=? WHERE guild_id=?`, [value ? 1 : 0, guildId]);
}

function logAudit(guildId, action, targetId) {
  db.run(`INSERT INTO audit_logs (guild_id, action, target_id) VALUES (?,?,?)`,
    [guildId, action, targetId]);
}

module.exports = { initDB, getGuildSettings, setGuildSetting, logAudit };
