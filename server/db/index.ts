import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(__dirname, '../../bifrost.db');
export const db = new Database(dbPath);

// Enable WAL mode for high performance concurrent reads/writes
db.pragma('journal_mode = WAL');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
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
  `);
}
