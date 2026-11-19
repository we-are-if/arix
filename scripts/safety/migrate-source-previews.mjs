import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { removeSourcePreviews } from "../../server/dailyPreviewRetention.js";

export function migrateSourcePreviews(path, apply = false) {
  const db = new DatabaseSync(path, { readOnly: !apply });
  try {
    const row = db.prepare("SELECT data,revision FROM app_state WHERE id=1").get();
    const before = JSON.parse(row.data), next = structuredClone(before);
    const removed = removeSourcePreviews(next);
    const comparable = structuredClone(before);
    removeSourcePreviews(comparable);
    assert.deepEqual(next, comparable);
    const fingerprint = createHash("sha256").update(JSON.stringify(comparable)).digest("hex");
    if (removed && apply) {
      // Only the synchronization revision changes; no invoice timestamps, statuses,
      // items, links, balances or business audit records are recalculated.
      next.snapshotRevision = (Number(before.snapshotRevision) || 1) + 1;
      db.exec("BEGIN IMMEDIATE");
      try {
        const result = db.prepare("UPDATE app_state SET data=?,revision=revision+1 WHERE id=1 AND revision=?").run(JSON.stringify(next), row.revision);
        assert.equal(Number(result.changes), 1, "Concurrent write: preview cleanup aborted");
        const saved = JSON.parse(db.prepare("SELECT data FROM app_state WHERE id=1").get().data);
        if (Object.hasOwn(before, "snapshotRevision")) saved.snapshotRevision = before.snapshotRevision;
        else delete saved.snapshotRevision;
        assert.deepEqual(saved, comparable, "A non-preview field changed: cleanup aborted");
        assert.equal(createHash("sha256").update(JSON.stringify(saved)).digest("hex"), fingerprint);
        db.exec("COMMIT");
      } catch (error) { db.exec("ROLLBACK"); throw error; }
    }
    return { removed, beforeBytes: Buffer.byteLength(row.data), afterBytes: Buffer.byteLength(JSON.stringify(next)), nonPreviewFingerprint: fingerprint, invariant: "all non-preview business fields identical", applied: apply && removed > 0 };
  } finally { db.close(); }
}

if (process.argv[1]?.endsWith("migrate-source-previews.mjs")) {
  console.log(JSON.stringify(migrateSourcePreviews(process.argv[2], process.argv.includes("--apply"))));
}
