import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { removeSourcePreviews } from "./dailyPreviewRetention.js";
import { createSQLiteStateStore } from "./database.js";
import { createDailyImages } from "./dailyImages.js";
import { migrateSourcePreviews } from "../scripts/safety/migrate-source-previews.mjs";

const preview = "data:image/png;base64,aGVsbG8=";
const fixture = () => ({ snapshotRevision: 12, updatedAt: "original", snapshot: {
  state: { entries: [{ id: "e", amount: -26.77, date: "2026-10-23", invoiced: true, invoiceNo: "1" }], accounts: [{ opening: 1000 }], closes: [{ income: 100, expense: 26.77 }] },
  customerDebts: { Customer: 1073.23 }, pastMonthUninvoiced: { Customer: 22.5 },
  invoices: [{ id: "i", invoiceNo: "1", status: "active", salesAmount: 100, paymentDeducted: 26.77, finalDebt: 1073.23, linkedEntryIds: ["e"], items: [{ quantity: 10, price: 10 }], screenshotDataUrl: preview, returnScreenshotDataUrl: preview }],
}, audit: [{ action: "approved", documentSnapshot: { id: "i", finalDebt: 1073.23, returnScreenshotDataUrl: preview } }] });

test("preview cleanup preserves every other field, verifies persistence and is idempotent", async () => {
  const dir = await mkdtemp(join(tmpdir(), "preview-retention-"));
  try {
    const file = join(dir, "test.sqlite"), db = new DatabaseSync(file);
    db.exec("CREATE TABLE app_state(id INTEGER PRIMARY KEY,data TEXT,revision INTEGER)");
    const original = fixture(); db.prepare("INSERT INTO app_state VALUES(1,?,7)").run(JSON.stringify(original)); db.close();
    const dry = migrateSourcePreviews(file); assert.equal(dry.removed, 3); assert.equal(dry.applied, false);
    const report = migrateSourcePreviews(file, true); assert.equal(report.nonPreviewFingerprint, dry.nonPreviewFingerprint);
    const read = new DatabaseSync(file), row = read.prepare("SELECT * FROM app_state").get(); read.close();
    const expected = fixture(); removeSourcePreviews(expected); expected.snapshotRevision++;
    assert.deepEqual(JSON.parse(row.data), expected); assert.equal(row.revision, 8);
    assert.equal(migrateSourcePreviews(file, true).removed, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("old clients cannot restore previews and financial values remain unchanged", async () => {
  const dir = await mkdtemp(join(tmpdir(), "preview-write-"));
  const store = createSQLiteStateStore({ dataDir: dir, jsonPath: join(dir, "none"), prepareWrite: removeSourcePreviews });
  const images = createDailyImages(dir);
  try {
    await store.initialize({ snapshot: {} }, (v) => v);
    const oldClient = fixture(); await store.write(oldClient);
    const expected = fixture(); removeSourcePreviews(expected);
    assert.deepEqual(await store.read(), expected);
    assert.equal(oldClient.snapshot.invoices[0].screenshotDataUrl, preview);
    assert.deepEqual(images.project(fixture(), "azartmembran"), expected);
    const urlClient = fixture(); urlClient.snapshot.invoices[0].screenshotDataUrl = "/api/daily/image/azartmembran/" + "0".repeat(64);
    assert.deepEqual(images.hydrate(urlClient, "azartmembran"), expected);
    assert.equal(images.get("azartmembran", "0".repeat(64)), null);
  } finally { store.close(); images.close(); await rm(dir, { recursive: true, force: true }); }
});
