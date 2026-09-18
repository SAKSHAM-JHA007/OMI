import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'omi.db');

const globalForDb = global as unknown as { omiDb?: DatabaseSync };

let isInitialized = false;

export function getDb(): DatabaseSync {
  if (!globalForDb.omiDb) {
    const dbDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const instance = new DatabaseSync(DB_PATH);
    // WAL mode + busy timeout prevents concurrency lock during Next.js build/workers
    try {
      instance.exec('PRAGMA journal_mode = WAL;');
      instance.exec('PRAGMA busy_timeout = 5000;');
    } catch {
      // ignore pragma if already set
    }

    if (!isInitialized) {
      instance.exec(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          deleted_at TEXT
        );

        CREATE TABLE IF NOT EXISTS conversations (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          title TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          archived_at TEXT
        );

        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS runs (
          id TEXT PRIMARY KEY,
          conversation_id TEXT NOT NULL,
          status TEXT NOT NULL,
          model TEXT NOT NULL,
          tainted INTEGER DEFAULT 0,
          iterations INTEGER DEFAULT 0,
          tokens_in INTEGER DEFAULT 0,
          tokens_out INTEGER DEFAULT 0,
          cost_cents INTEGER DEFAULT 0,
          started_at TEXT DEFAULT CURRENT_TIMESTAMP,
          ended_at TEXT,
          error_code TEXT
        );

        CREATE TABLE IF NOT EXISTS tool_calls (
          id TEXT PRIMARY KEY,
          run_id TEXT NOT NULL,
          seq INTEGER NOT NULL,
          tool_name TEXT NOT NULL,
          args_json TEXT NOT NULL,
          result_json TEXT NOT NULL,
          trust TEXT NOT NULL,
          ok INTEGER NOT NULL,
          error_code TEXT,
          duration_ms INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS memory_facts (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          text TEXT NOT NULL,
          source_message_id TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          action TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          run_id TEXT,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
      `);
      isInitialized = true;
    }

    globalForDb.omiDb = instance;
  }

  return globalForDb.omiDb;
}

// Convenient proxy maintaining db.prepare() and db.exec()
export const db = {
  prepare(sql: string) {
    return getDb().prepare(sql);
  },
  exec(sql: string) {
    return getDb().exec(sql);
  },
};

export const DEFAULT_USER_ID = 'local-dev-user';
