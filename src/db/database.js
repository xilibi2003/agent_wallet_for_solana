import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { nowIso, utcDateKey } from '../lib/time.js';

const DEFAULT_POLICY = {
  dailyLimitLamports: 0n,
  whitelistPrograms: [],
  spentTodayLamports: 0n,
  spentDate: utcDateKey(),
  panicMode: false,
  requireSimulation: true,
};

function toPolicyRow(row) {
  return {
    dailyLimitLamports: BigInt(row.daily_limit_lamports),
    whitelistPrograms: JSON.parse(row.whitelist_programs),
    spentTodayLamports: BigInt(row.spent_today_lamports),
    spentDate: row.spent_date,
    panicMode: Boolean(row.panic_mode),
    requireSimulation: Boolean(row.require_simulation),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toPasskeyRow(row) {
  return {
    credentialID: row.credential_id,
    credentialPublicKey: row.public_key,
    counter: row.counter,
    transports: row.transports ? JSON.parse(row.transports) : [],
    deviceType: row.device_type,
    backedUp: Boolean(row.backed_up),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function stringifyDetails(value) {
  return JSON.stringify(value, (_key, item) =>
    typeof item === 'bigint' ? item.toString() : item,
  );
}

function initializeSchema(db) {
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS secrets (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      encrypted_key BLOB NOT NULL,
      iv BLOB NOT NULL,
      auth_tag BLOB NOT NULL,
      encryption_salt BLOB NOT NULL,
      password_salt BLOB NOT NULL,
      password_hash BLOB NOT NULL,
      public_key TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS passkeys (
      credential_id TEXT PRIMARY KEY,
      public_key BLOB NOT NULL,
      counter INTEGER NOT NULL,
      transports TEXT,
      device_type TEXT,
      backed_up INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS policies (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      daily_limit_lamports TEXT NOT NULL,
      whitelist_programs TEXT NOT NULL,
      spent_today_lamports TEXT NOT NULL,
      spent_date TEXT NOT NULL,
      panic_mode INTEGER NOT NULL DEFAULT 0,
      require_simulation INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      intent TEXT,
      tx_signature TEXT,
      status TEXT NOT NULL,
      program_ids TEXT NOT NULL,
      amount_lamports TEXT,
      details TEXT NOT NULL
    );
  `);
}

export function createDatabase(databasePath) {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  initializeSchema(db);

  const statements = {
    getSecret: db.prepare('SELECT * FROM secrets WHERE id = 1'),
    upsertSecret: db.prepare(`
      INSERT INTO secrets (
        id, encrypted_key, iv, auth_tag, encryption_salt, password_salt, password_hash, public_key, created_at, updated_at
      ) VALUES (
        1, @encrypted_key, @iv, @auth_tag, @encryption_salt, @password_salt, @password_hash, @public_key, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        encrypted_key = excluded.encrypted_key,
        iv = excluded.iv,
        auth_tag = excluded.auth_tag,
        encryption_salt = excluded.encryption_salt,
        password_salt = excluded.password_salt,
        password_hash = excluded.password_hash,
        public_key = excluded.public_key,
        updated_at = excluded.updated_at
    `),
    getPolicy: db.prepare('SELECT * FROM policies WHERE id = 1'),
    upsertPolicy: db.prepare(`
      INSERT INTO policies (
        id, daily_limit_lamports, whitelist_programs, spent_today_lamports, spent_date, panic_mode, require_simulation, created_at, updated_at
      ) VALUES (
        1, @daily_limit_lamports, @whitelist_programs, @spent_today_lamports, @spent_date, @panic_mode, @require_simulation, @created_at, @updated_at
      )
      ON CONFLICT(id) DO UPDATE SET
        daily_limit_lamports = excluded.daily_limit_lamports,
        whitelist_programs = excluded.whitelist_programs,
        spent_today_lamports = excluded.spent_today_lamports,
        spent_date = excluded.spent_date,
        panic_mode = excluded.panic_mode,
        require_simulation = excluded.require_simulation,
        updated_at = excluded.updated_at
    `),
    listPasskeys: db.prepare('SELECT * FROM passkeys ORDER BY created_at ASC'),
    getPasskey: db.prepare('SELECT * FROM passkeys WHERE credential_id = ?'),
    upsertPasskey: db.prepare(`
      INSERT INTO passkeys (
        credential_id, public_key, counter, transports, device_type, backed_up, created_at, updated_at
      ) VALUES (
        @credential_id, @public_key, @counter, @transports, @device_type, @backed_up, @created_at, @updated_at
      )
      ON CONFLICT(credential_id) DO UPDATE SET
        public_key = excluded.public_key,
        counter = excluded.counter,
        transports = excluded.transports,
        device_type = excluded.device_type,
        backed_up = excluded.backed_up,
        updated_at = excluded.updated_at
    `),
    insertAudit: db.prepare(`
      INSERT INTO audit_logs (
        timestamp, intent, tx_signature, status, program_ids, amount_lamports, details
      ) VALUES (
        @timestamp, @intent, @tx_signature, @status, @program_ids, @amount_lamports, @details
      )
    `),
    listAuditLogs: db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?'),
  };

  function ensureDefaultPolicy() {
    const existing = statements.getPolicy.get();
    if (existing) return toPolicyRow(existing);
    const timestamp = nowIso();
    statements.upsertPolicy.run({
      daily_limit_lamports: DEFAULT_POLICY.dailyLimitLamports.toString(),
      whitelist_programs: JSON.stringify(DEFAULT_POLICY.whitelistPrograms),
      spent_today_lamports: DEFAULT_POLICY.spentTodayLamports.toString(),
      spent_date: DEFAULT_POLICY.spentDate,
      panic_mode: Number(DEFAULT_POLICY.panicMode),
      require_simulation: Number(DEFAULT_POLICY.requireSimulation),
      created_at: timestamp,
      updated_at: timestamp,
    });
    return { ...DEFAULT_POLICY, createdAt: timestamp, updatedAt: timestamp };
  }

  ensureDefaultPolicy();

  return {
    close() {
      db.close();
    },

    getSecret() {
      return statements.getSecret.get();
    },

    saveSecret(secretRecord) {
      const timestamp = nowIso();
      statements.upsertSecret.run({
        ...secretRecord,
        created_at: timestamp,
        updated_at: timestamp,
      });
    },

    getPolicy() {
      return toPolicyRow(statements.getPolicy.get());
    },

    savePolicy(policy) {
      const existing = statements.getPolicy.get();
      const timestamp = nowIso();
      statements.upsertPolicy.run({
        daily_limit_lamports: policy.dailyLimitLamports.toString(),
        whitelist_programs: JSON.stringify(policy.whitelistPrograms),
        spent_today_lamports: policy.spentTodayLamports.toString(),
        spent_date: policy.spentDate,
        panic_mode: Number(policy.panicMode),
        require_simulation: Number(policy.requireSimulation),
        created_at: existing?.created_at ?? timestamp,
        updated_at: timestamp,
      });
      return toPolicyRow(statements.getPolicy.get());
    },

    listPasskeys() {
      return statements.listPasskeys.all().map(toPasskeyRow);
    },

    getPasskey(credentialID) {
      const row = statements.getPasskey.get(credentialID);
      return row ? toPasskeyRow(row) : null;
    },

    savePasskey(passkey) {
      const existing = statements.getPasskey.get(passkey.credentialID);
      const timestamp = nowIso();
      statements.upsertPasskey.run({
        credential_id: passkey.credentialID,
        public_key: Buffer.from(passkey.credentialPublicKey),
        counter: passkey.counter,
        transports: JSON.stringify(passkey.transports ?? []),
        device_type: passkey.deviceType ?? 'singleDevice',
        backed_up: Number(passkey.backedUp ?? false),
        created_at: existing?.created_at ?? timestamp,
        updated_at: timestamp,
      });
      const row = statements.getPasskey.get(passkey.credentialID);
      return row ? toPasskeyRow(row) : null;
    },

    addAuditLog(log) {
      statements.insertAudit.run({
        timestamp: log.timestamp ?? nowIso(),
        intent: log.intent ?? '',
        tx_signature: log.txSignature ?? null,
        status: log.status,
        program_ids: JSON.stringify(log.programIds ?? []),
        amount_lamports:
          log.amountLamports === null || log.amountLamports === undefined
            ? null
            : log.amountLamports.toString(),
        details: stringifyDetails(log.details ?? {}),
      });
    },

    listAuditLogs(limit = 20) {
      return statements.listAuditLogs.all(limit).map((row) => ({
        id: row.id,
        timestamp: row.timestamp,
        intent: row.intent,
        txSignature: row.tx_signature,
        status: row.status,
        programIds: JSON.parse(row.program_ids),
        amountLamports: row.amount_lamports ? BigInt(row.amount_lamports) : null,
        details: JSON.parse(row.details),
      }));
    },
  };
}
