import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const [databasePath, importedDataPath, outputPath, sourceSha256 = ""] = process.argv.slice(2);

if (!databasePath || !importedDataPath || !outputPath) {
  throw new Error("Usage: node build-daily-sheet-sync-payload.mjs <daily.sqlite> <importedData.ts> <payload.json> [source-sha256]");
}

const hashJson = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const source = await readFile(importedDataPath, "utf8");
const match = source.match(/export const IMPORTED_ENTRIES = (.*?) as const;/s);
if (!match) throw new Error("IMPORTED_ENTRIES could not be read from importedData.ts.");

const replacementEntries = JSON.parse(match[1]);
const replacementIds = replacementEntries.map((entry) => String(entry?.id || ""));
if (replacementEntries.length === 0 || replacementIds.some((id) => !id.startsWith("sheet-"))) {
  throw new Error("Replacement entries must contain only imported Sheet records.");
}
if (new Set(replacementIds).size !== replacementIds.length) {
  throw new Error("Replacement entries contain duplicate IDs.");
}

const database = new DatabaseSync(databasePath, { readOnly: true });
let row;
try {
  row = database.prepare("SELECT data, revision, updated_at FROM app_state WHERE id = 1").get();
} finally {
  database.close();
}
if (!row) throw new Error("Daily app_state row is missing.");

const state = JSON.parse(row.data);
const currentEntries = state?.snapshot?.state?.entries;
if (!Array.isArray(currentEntries)) throw new Error("Daily snapshot entries are missing.");
if (currentEntries.some((entry) => !String(entry?.id || "").startsWith("sheet-"))) {
  throw new Error("Manual Daily entries exist. Automatic Sheet replacement was refused.");
}
if ((state.entryChangeRequests || []).some((request) => request?.status === "pending")) {
  throw new Error("Pending entry change requests exist. Automatic Sheet replacement was refused.");
}

const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  sourceSha256: String(sourceSha256).toLowerCase(),
  expected: {
    entriesCount: currentEntries.length,
    entriesHash: hashJson(currentEntries),
  },
  replacement: {
    entriesCount: replacementEntries.length,
    entriesHash: hashJson(replacementEntries),
    entries: replacementEntries,
  },
};

await writeFile(outputPath, `${JSON.stringify(payload)}\n`, "utf8");
console.log(JSON.stringify({
  databaseRevision: row.revision,
  databaseUpdatedAt: row.updated_at,
  expectedEntries: payload.expected.entriesCount,
  replacementEntries: payload.replacement.entriesCount,
  expectedHash: payload.expected.entriesHash,
  replacementHash: payload.replacement.entriesHash,
  outputPath,
}, null, 2));
