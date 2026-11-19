import { createHash } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";

const [databasePath, payloadPath, backupPath] = process.argv.slice(2);

if (!databasePath || !payloadPath || !backupPath) {
  throw new Error("Usage: node apply-daily-sheet-sync.mjs <daily.sqlite> <payload.json> <backup.sqlite>");
}

const hashJson = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const payload = JSON.parse(await readFile(payloadPath, "utf8"));
if (payload?.version !== 1 || !Array.isArray(payload?.replacement?.entries)) {
  throw new Error("Unsupported or incomplete Daily Sheet sync payload.");
}

const replacementEntries = payload.replacement.entries;
if (replacementEntries.length !== payload.replacement.entriesCount) {
  throw new Error("Replacement entry count does not match the payload manifest.");
}
if (hashJson(replacementEntries) !== payload.replacement.entriesHash) {
  throw new Error("Replacement entry hash does not match the payload manifest.");
}
if (replacementEntries.some((entry) => !String(entry?.id || "").startsWith("sheet-"))) {
  throw new Error("Replacement payload contains a non-Sheet entry.");
}

const database = new DatabaseSync(databasePath);
try {
  const check = database.prepare("PRAGMA quick_check").get();
  if (check?.quick_check !== "ok") throw new Error(`SQLite quick_check failed: ${check?.quick_check || "unknown"}`);

  const row = database.prepare("SELECT data, revision FROM app_state WHERE id = 1").get();
  if (!row) throw new Error("Daily app_state row is missing.");

  const state = JSON.parse(row.data);
  const currentEntries = state?.snapshot?.state?.entries;
  if (!Array.isArray(currentEntries)) throw new Error("Daily snapshot entries are missing.");
  if (currentEntries.length !== payload.expected.entriesCount || hashJson(currentEntries) !== payload.expected.entriesHash) {
    throw new Error("Live Daily entries changed after the audit. Sheet sync was refused.");
  }
  if (currentEntries.some((entry) => !String(entry?.id || "").startsWith("sheet-"))) {
    throw new Error("Manual Daily entries exist. Sheet sync was refused.");
  }
  if ((state.entryChangeRequests || []).some((request) => request?.status === "pending")) {
    throw new Error("Pending entry change requests exist. Sheet sync was refused.");
  }

  await mkdir(dirname(backupPath), { recursive: true });
  await backup(database, backupPath);

  const at = new Date().toISOString();
  state.snapshot.state.entries = replacementEntries;
  state.snapshot.version = Math.max(2, Number(state.snapshot.version) || 1);
  state.snapshotRevision = Math.max(1, Number(state.snapshotRevision) || 1) + 1;
  state.updatedAt = at;
  state.updatedBy = "Google Sheet audit sync";
  state.audit = [
    ...(Array.isArray(state.audit) ? state.audit : []),
    {
      id: `daily-sheet-sync-${Date.now()}`,
      action: "google_sheet_sync",
      at,
      by: "AriX Daily migration",
      fromEntries: currentEntries.length,
      toEntries: replacementEntries.length,
      sourceSha256: payload.sourceSha256 || null,
    },
  ].slice(-500);

  database.exec("BEGIN IMMEDIATE");
  try {
    const result = database.prepare("UPDATE app_state SET data = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?")
      .run(JSON.stringify(state), at, row.revision);
    if (result.changes !== 1) throw new Error("Daily app_state changed during migration.");
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  const after = database.prepare("SELECT data, revision FROM app_state WHERE id = 1").get();
  const afterState = JSON.parse(after.data);
  const afterEntries = afterState.snapshot.state.entries;
  if (afterEntries.length !== replacementEntries.length || hashJson(afterEntries) !== payload.replacement.entriesHash) {
    throw new Error("Post-migration verification failed.");
  }
  const finalCheck = database.prepare("PRAGMA quick_check").get();
  if (finalCheck?.quick_check !== "ok") throw new Error(`Post-migration quick_check failed: ${finalCheck?.quick_check || "unknown"}`);

  console.log(JSON.stringify({
    ok: true,
    revision: after.revision,
    snapshotRevision: afterState.snapshotRevision,
    entries: afterEntries.length,
    entriesHash: hashJson(afterEntries),
    backupPath,
  }));
} finally {
  database.close();
}
