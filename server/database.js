import { DatabaseSync } from "node:sqlite";
import { copyFile, mkdir, readFile, readdir, unlink } from "node:fs/promises";
import { basename, join } from "node:path";

const STATE_ID = 1;
const BACKUP_RETENTION = 14;

const fileStamp = (date = new Date()) => date.toISOString().replace(/[:.]/g, "-");
const dayStamp = (date = new Date()) => date.toISOString().slice(0, 10);
const sqlString = (value) => `'${String(value).replaceAll("'", "''")}'`;

export function createSQLiteStateStore({ dataDir, jsonPath, sqlitePath = join(dataDir, "arix.sqlite") }) {
  const backupDir = join(dataDir, "backups");
  let database = null;
  let normalize = (value) => value;
  let cachedState = null;
  let writeQueue = Promise.resolve();

  const cloneState = (value) => structuredClone(value);

  const open = () => {
    if (database) return database;
    database = new DatabaseSync(sqlitePath);
    database.exec("PRAGMA journal_mode = WAL");
    database.exec("PRAGMA synchronous = FULL");
    database.exec("PRAGMA foreign_keys = ON");
    database.exec("PRAGMA busy_timeout = 5000");
    database.exec(`
      CREATE TABLE IF NOT EXISTS app_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        data TEXT NOT NULL,
        revision INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS persistence_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
    return database;
  };

  const setMeta = (key, value) => open().prepare(`
    INSERT INTO persistence_meta (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));

  const getMeta = (key) => open().prepare("SELECT value FROM persistence_meta WHERE key = ?").get(key)?.value ?? null;

  const pruneBackups = async () => {
    const files = (await readdir(backupDir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.startsWith("arix-") && entry.name.endsWith(".sqlite"))
      .map((entry) => entry.name)
      .sort()
      .reverse();
    await Promise.all(files.slice(BACKUP_RETENTION).map((name) => unlink(join(backupDir, name))));
  };

  const createDailyBackup = async (force = false) => {
    const today = dayStamp();
    if (!force && getMeta("last_backup_day") === today) return null;
    await mkdir(backupDir, { recursive: true });
    const backupPath = join(backupDir, `arix-${today}-${fileStamp().slice(11)}.sqlite`);
    open().exec(`VACUUM INTO ${sqlString(backupPath)}`);
    setMeta("last_backup_day", today);
    await pruneBackups();
    return backupPath;
  };

  const initialize = async (seed, normalizeValue) => {
    normalize = normalizeValue;
    await mkdir(dataDir, { recursive: true });
    await mkdir(backupDir, { recursive: true });
    const db = open();
    const integrity = db.prepare("PRAGMA quick_check").get();
    if (integrity?.quick_check !== "ok") throw new Error(`SQLite integrity check failed: ${integrity?.quick_check ?? "unknown"}`);

    const existing = db.prepare("SELECT data FROM app_state WHERE id = ?").get(STATE_ID);
    if (existing) {
      await createDailyBackup();
      cachedState = normalize(JSON.parse(existing.data));
      return cloneState(cachedState);
    }

    let initialValue;
    let source = "seed";
    try {
      const raw = await readFile(jsonPath, "utf8");
      initialValue = JSON.parse(raw);
      source = "json";
      const archivePath = join(backupDir, `db-pre-sqlite-${fileStamp()}.json`);
      await copyFile(jsonPath, archivePath);
      setMeta("json_import_backup", basename(archivePath));
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw new Error(`Legacy JSON database could not be imported; original file was left untouched. ${error.message}`);
      }
      initialValue = structuredClone(seed);
    }

    const value = normalize(initialValue);
    const now = new Date().toISOString();
    db.prepare("INSERT INTO app_state (id, data, revision, created_at, updated_at) VALUES (?, ?, 1, ?, ?)")
      .run(STATE_ID, JSON.stringify(value), now, now);
    setMeta("storage", "sqlite");
    setMeta("migration_source", source);
    setMeta("migrated_at", now);
    await createDailyBackup(true);
    cachedState = value;
    return cloneState(cachedState);
  };

  const read = async ({ clone = true } = {}) => {
    if (cachedState) return clone ? cloneState(cachedState) : cachedState;
    const row = open().prepare("SELECT data FROM app_state WHERE id = ?").get(STATE_ID);
    if (!row) throw new Error("SQLite application state is missing.");
    cachedState = normalize(JSON.parse(row.data));
    return clone ? cloneState(cachedState) : cachedState;
  };

  const write = async (value) => {
    const snapshot = cloneState(value);
    const pendingWrite = writeQueue.then(async () => {
      await createDailyBackup();
      const db = open();
      const now = new Date().toISOString();
      db.exec("BEGIN IMMEDIATE");
      try {
        db.prepare("UPDATE app_state SET data = ?, revision = revision + 1, updated_at = ? WHERE id = ?")
          .run(JSON.stringify(snapshot), now, STATE_ID);
        db.exec("COMMIT");
        cachedState = snapshot;
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    });
    writeQueue = pendingWrite.catch(() => undefined);
    return pendingWrite;
  };

  const status = () => {
    const row = open().prepare("SELECT revision, updated_at FROM app_state WHERE id = ?").get(STATE_ID);
    return { engine: "sqlite", path: basename(sqlitePath), revision: row?.revision ?? 0, updatedAt: row?.updated_at ?? null, journalMode: "wal" };
  };

  const close = () => {
    if (!database) return;
    database.close();
    database = null;
    cachedState = null;
  };

  return { initialize, read, write, createDailyBackup, status, close };
}
