import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

const [databasePath, importedDataPath, outputPath, openingSourceSha256 = "", octoberSourceSha256 = ""] = process.argv.slice(2);

if (!databasePath || !importedDataPath || !outputPath) {
  throw new Error("Usage: node build-daily-financial-cutover-payload.mjs <daily.sqlite> <importedData.ts> <payload.json> [opening-sha256] [october-sha256]");
}

const hashJson = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const readExport = (source, name) => {
  const match = source.match(new RegExp(`export const ${name} = (.*?) as const;`, "s"));
  if (!match) throw new Error(`${name} could not be read from importedData.ts.`);
  return JSON.parse(match[1]);
};
const assertAmountMap = (value, label) => {
  if (!value || Array.isArray(value) || typeof value !== "object") throw new Error(`${label} must be an object.`);
  for (const [name, amount] of Object.entries(value)) {
    if (!String(name).trim() || !Number.isFinite(Number(amount))) throw new Error(`${label} contains an invalid row.`);
  }
};
const pendingCustomerPayments = (entries) => {
  const totals = {};
  for (const entry of entries) {
    if (!String(entry?.date || "").startsWith("2026-10-") || entry?.kind !== "income" || entry?.invoiced === true) continue;
    const name = String(entry?.counterparty || "").trim();
    if (!name || name === "Qeyd edilməyib") continue;
    totals[name] = money((totals[name] || 0) + Math.abs(Number(entry?.amount) || 0));
  }
  return totals;
};

const source = await readFile(importedDataPath, "utf8");
const replacementCustomerDebts = readExport(source, "IMPORTED_CUSTOMER_DEBTS");
const replacementPastMonthUninvoiced = readExport(source, "IMPORTED_PAST_MONTH_UNINVOICED");
assertAmountMap(replacementCustomerDebts, "Replacement customer debts");
assertAmountMap(replacementPastMonthUninvoiced, "Replacement past-month balances");
if (Object.keys(replacementCustomerDebts).length === 0) throw new Error("Replacement customer debts are empty.");
if (Object.keys(replacementPastMonthUninvoiced).length !== 0) {
  throw new Error("Past-month balances must be empty because they are included in opening debts.");
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
const snapshot = state?.snapshot;
const entries = snapshot?.state?.entries;
const invoices = snapshot?.invoices;
const currentCustomerDebts = snapshot?.customerDebts;
const currentPastMonthUninvoiced = snapshot?.pastMonthUninvoiced;
if (!Array.isArray(entries) || !Array.isArray(invoices)) throw new Error("Daily snapshot is incomplete.");
assertAmountMap(currentCustomerDebts, "Current customer debts");
assertAmountMap(currentPastMonthUninvoiced, "Current past-month balances");
if (invoices.length !== 0) throw new Error("Invoices were created after the audit. Financial cutover was refused.");

const currentPending = pendingCustomerPayments(entries);
const payload = {
  version: 1,
  generatedAt: new Date().toISOString(),
  sources: {
    openingSha256: String(openingSourceSha256).toLowerCase(),
    octoberSha256: String(octoberSourceSha256).toLowerCase(),
  },
  expected: {
    databaseRevision: Number(row.revision),
    databaseUpdatedAt: row.updated_at,
    snapshotRevision: Number(state.snapshotRevision || 0),
    entriesCount: entries.length,
    entriesHash: hashJson(entries),
    invoicesCount: invoices.length,
    invoicesHash: hashJson(invoices),
    customerDebtsCount: Object.keys(currentCustomerDebts).length,
    customerDebtsHash: hashJson(currentCustomerDebts),
    pastMonthCount: Object.keys(currentPastMonthUninvoiced).length,
    pastMonthHash: hashJson(currentPastMonthUninvoiced),
    currentMonthPendingCount: Object.keys(currentPending).length,
    currentMonthPendingSum: money(Object.values(currentPending).reduce((sum, value) => sum + Number(value), 0)),
    currentMonthPendingHash: hashJson(currentPending),
  },
  replacement: {
    customerDebtsCount: Object.keys(replacementCustomerDebts).length,
    customerDebtsSum: money(Object.values(replacementCustomerDebts).reduce((sum, value) => sum + Number(value), 0)),
    customerDebtsHash: hashJson(replacementCustomerDebts),
    customerDebts: replacementCustomerDebts,
    pastMonthCount: 0,
    pastMonthHash: hashJson(replacementPastMonthUninvoiced),
    pastMonthUninvoiced: replacementPastMonthUninvoiced,
  },
};

await writeFile(outputPath, `${JSON.stringify(payload)}\n`, "utf8");
console.log(JSON.stringify({
  databaseRevision: row.revision,
  snapshotRevision: state.snapshotRevision,
  entries: entries.length,
  invoices: invoices.length,
  currentMonthPending: {
    count: payload.expected.currentMonthPendingCount,
    sum: payload.expected.currentMonthPendingSum,
  },
  replacementCustomerDebts: {
    count: payload.replacement.customerDebtsCount,
    sum: payload.replacement.customerDebtsSum,
  },
  removedPastMonthBalances: payload.expected.pastMonthCount,
  outputPath,
}, null, 2));
