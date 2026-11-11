import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { hashIp } from '../utils/ip.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// DB_PATH lets tests run against an in-memory database (':memory:').
const dbPath = process.env.DB_PATH || path.resolve(__dirname, '../../bifrost.db');
export const db = new Database(dbPath);

// Enable WAL mode for high performance concurrent reads/writes
db.pragma('journal_mode = WAL');

// SQLite ignores FOREIGN KEY clauses unless this is switched on per connection.
// Without it, the ON DELETE CASCADE rules below never run and deleting a link
// leaves its clicks and abuse signals behind.
db.pragma('foreign_keys = ON');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT,
      google_id TEXT UNIQUE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      owner_id INTEGER REFERENCES users(id),
      destination_url TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('active', 'flagged', 'blocked')),
      abuse_score INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS clicks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
      ip_hash TEXT NOT NULL,
      country TEXT NOT NULL,
      device TEXT NOT NULL,
      referrer TEXT NOT NULL,
      clicked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS abuse_signals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id INTEGER REFERENCES links(id) ON DELETE CASCADE,
      signal_type TEXT NOT NULL,
      weight INTEGER NOT NULL,
      description TEXT NOT NULL,
      detected_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS hourly_buckets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      link_id INTEGER NOT NULL REFERENCES links(id) ON DELETE CASCADE,
      hour_timestamp TEXT NOT NULL,
      click_count INTEGER DEFAULT 0,
      geo_breakdown TEXT DEFAULT '{}',
      device_breakdown TEXT DEFAULT '{}',
      referrer_breakdown TEXT DEFAULT '{}',
      UNIQUE(link_id, hour_timestamp)
    );

    CREATE TABLE IF NOT EXISTS global_counter (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      last_val INTEGER NOT NULL DEFAULT 1000
    );

    INSERT OR IGNORE INTO global_counter (id, last_val) VALUES (1, 1000);

    -- Every redirect asks "how many clicks from this visitor on this link in the
    -- last 5 seconds?". Without an index that is a scan of the whole clicks
    -- table, so redirects got slower with every click ever recorded. It also
    -- serves the per-link lookups used by the dashboard.
    CREATE INDEX IF NOT EXISTS idx_clicks_link_ip_time ON clicks (link_id, ip_hash, clicked_at);
  `);

  migrateUsersTableForGoogleAuth();
  hashStoredRawIps();
}

/**
 * Earlier versions wrote the visitor's raw IP into clicks.ip_hash. Replace any
 * such value with its hash. Hashes are hex only, so a '.' or ':' identifies a
 * raw IPv4/IPv6 address; once converted, a row is never matched again.
 */
function hashStoredRawIps() {
  const rows = db.prepare(`
    SELECT DISTINCT ip_hash FROM clicks WHERE ip_hash LIKE '%.%' OR ip_hash LIKE '%:%'
  `).all() as Array<{ ip_hash: string }>;
  if (rows.length === 0) return;

  const update = db.prepare('UPDATE clicks SET ip_hash = ? WHERE ip_hash = ?');
  db.transaction(() => {
    for (const { ip_hash } of rows) update.run(hashIp(ip_hash), ip_hash);
  })();
}

/**
 * Older databases have `users.password_hash` as NOT NULL and no `google_id`
 * column, which predates Google sign-in support. SQLite can't relax a
 * NOT NULL constraint or add a UNIQUE column with ALTER TABLE directly, so
 * this rebuilds the table (rename -> recreate -> copy -> drop) exactly once,
 * detected via PRAGMA table_info. Safe to run on every startup.
 */
function migrateUsersTableForGoogleAuth() {
  const columns = db.prepare(`PRAGMA table_info(users)`).all() as Array<{ name: string; notnull: number }>;
  const hasGoogleId = columns.some((c) => c.name === 'google_id');
  const passwordHashCol = columns.find((c) => c.name === 'password_hash');
  const passwordHashIsNotNull = passwordHashCol?.notnull === 1;

  if (hasGoogleId && !passwordHashIsNotNull) {
    return; // already migrated
  }

  // Renaming/dropping a table that other tables hold a FOREIGN KEY
  // reference to (links.owner_id -> users.id) fails once SQLite's
  // foreign-key enforcement is on, because SQLite repoints the existing
  // FK at the renamed `users_old` table. Foreign-key enforcement can't be
  // toggled inside a transaction, so it's switched off around this one
  // migration and restored immediately after.
  const fkWasOn = (db.pragma('foreign_keys', { simple: true }) as number) === 1;
  if (fkWasOn) db.pragma('foreign_keys = OFF');

  try {
    const migrate = db.transaction(() => {
      db.exec(`ALTER TABLE users RENAME TO users_old;`);
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT,
          google_id TEXT UNIQUE,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
      `);
      db.exec(`
        INSERT INTO users (id, email, password_hash, created_at)
        SELECT id, email, password_hash, created_at FROM users_old;
      `);
      db.exec(`DROP TABLE users_old;`);
      // links.owner_id was repointed at users_old by the RENAME above;
      // rebuild it so it references the new users table instead.
      db.exec(`
        CREATE TABLE links_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          slug TEXT UNIQUE NOT NULL,
          owner_id INTEGER REFERENCES users(id),
          destination_url TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('active', 'flagged', 'blocked')),
          abuse_score INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          expires_at DATETIME
        );
      `);
      db.exec(`
        INSERT INTO links_new SELECT * FROM links;
      `);
      db.exec(`DROP TABLE links;`);
      db.exec(`ALTER TABLE links_new RENAME TO links;`);
    });

    migrate();
  } finally {
    if (fkWasOn) db.pragma('foreign_keys = ON');
  }
}
