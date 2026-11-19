import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";

const [databasePath, payloadPath, backupPath] = process.argv.slice(2);
if (!databasePath || !payloadPath || !backupPath) {
  throw new Error("Usage: node apply-daily-financial-cutover.mjs <daily.sqlite> <payload.json> <backup.sqlite>");
}

const hashJson = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const money = (value) => Math.round((Number(value) || 0) * 100) / 100;
const amountMap = (value) => value && !Array.isArray(value) && typeof value === "object" ? value : {};
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
const auditBalanceChanges = (before, after, action, field, at) => {
  const rows = [];
  const names = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const name of names) {
    const previous = money(before[name]);
    const next = money(after[name]);
    if (previous === next) continue;
    rows.push({
      id: randomUUID(),
      action,
      at,
      by: "AriX Daily financial cutover",
      target: name,
      entityType: "customer",
      entityId: name,
      changes: [{ field, before: previous, after: next }],
    });
  }
  return rows;
};

const payload = JSON.parse(await readFile(payloadPath, "utf8"));
if (payload?.version !== 1 || !payload?.expected || !payload?.replacement) throw new Error("Unsupported financial cutover payload.");
const replacementDebts = amountMap(payload.replacement.customerDebts);
const replacementPast = amountMap(payload.replacement.pastMonthUninvoiced);
if (Object.keys(replacementDebts).length !== payload.replacement.customerDebtsCount || hashJson(replacementDebts) !== payload.replacement.customerDebtsHash) {
  throw new Error("Replacement customer debt manifest does not match its data.");
}
if (Object.keys(replacementPast).length !== 0 || payload.replacement.pastMonthCount !== 0 || hashJson(replacementPast) !== payload.replacement.pastMonthHash) {
  throw new Error("Replacement past-month balances must be empty.");
}

const database = new DatabaseSync(databasePath);
try {
  const check = database.prepare("PRAGMA quick_check").get();
  if (check?.quick_check !== "ok") throw new Error(`SQLite quick_check failed: ${check?.quick_check || "unknown"}`);

  const row = database.prepare("SELECT data, revision, updated_at FROM app_state WHERE id = 1").get();
  if (!row) throw new Error("Daily app_state row is missing.");
  const state = JSON.parse(row.data);
  const snapshot = state?.snapshot;
  const entries = snapshot?.state?.entries;
  const invoices = snapshot?.invoices;
  const currentDebts = amountMap(snapshot?.customerDebts);
  const currentPast = amountMap(snapshot?.pastMonthUninvoiced);
  if (!Array.isArray(entries) || !Array.isArray(invoices)) throw new Error("Daily snapshot is incomplete.");

  const expected = payload.expected;
  if (Number(row.revision) !== expected.databaseRevision || Number(state.snapshotRevision || 0) !== expected.snapshotRevision) {
    throw new Error("Live Daily revision changed after the audit. Financial cutover was refused.");
  }
  if (entries.length !== expected.entriesCount || hashJson(entries) !== expected.entriesHash) {
    throw new Error("Live Daily entries changed after the audit. Financial cutover was refused.");
  }
  if (invoices.length !== expected.invoicesCount || hashJson(invoices) !== expected.invoicesHash || invoices.length !== 0) {
    throw new Error("Live Daily invoices changed after the audit. Financial cutover was refused.");
  }
  if (Object.keys(currentDebts).length !== expected.customerDebtsCount || hashJson(currentDebts) !== expected.customerDebtsHash) {
    throw new Error("Live customer debts changed after the audit. Financial cutover was refused.");
  }
  if (Object.keys(currentPast).length !== expected.pastMonthCount || hashJson(currentPast) !== expected.pastMonthHash) {
    throw new Error("Live past-month balances changed after the audit. Financial cutover was refused.");
  }
  const currentPending = pendingCustomerPayments(entries);
  const pendingSum = money(Object.values(currentPending).reduce((sum, value) => sum + Number(value), 0));
  if (Object.keys(currentPending).length !== expected.currentMonthPendingCount || pendingSum !== expected.currentMonthPendingSum || hashJson(currentPending) !== expected.currentMonthPendingHash) {
    throw new Error("Current-month customer payments changed after the audit. Financial cutover was refused.");
  }

  await mkdir(dirname(backupPath), { recursive: true });
  await backup(database, backupPath);

  const at = new Date().toISOString();
  const debtAudits = auditBalanceChanges(currentDebts, replacementDebts, "daily_customer_debt_changed", "Müştəri borcu", at);
  const pastAudits = auditBalanceChanges(currentPast, replacementPast, "daily_past_month_balance_changed", "Əvvəlki aydan qalan", at);
  snapshot.customerDebts = replacementDebts;
  snapshot.pastMonthUninvoiced = replacementPast;
  snapshot.version = Math.max(2, Number(snapshot.version) || 1);
  state.snapshotRevision = Math.max(1, Number(state.snapshotRevision) || 1) + 1;
  state.updatedAt = at;
  state.updatedBy = "AriX Daily financial cutover";
  state.audit = [
    ...(Array.isArray(state.audit) ? state.audit : []),
    ...debtAudits,
    ...pastAudits,
    {
      id: randomUUID(),
      action: "daily_financial_cutover",
      at,
      by: "AriX Daily financial cutover",
      target: "Əvvəldən qalıq",
      entityType: "snapshot",
      entityId: "financial-cutover-2026-11-02",
      details: `${debtAudits.length} müştəri borcu mənbə ilə eyniləşdirildi; ${pastAudits.length} köhnə-ay qalığı ikiqat hesablamadan çıxarıldı.`,
    },
  ].slice(-500);

  database.exec("BEGIN IMMEDIATE");
  try {
    const result = database.prepare("UPDATE app_state SET data = ?, revision = revision + 1, updated_at = ? WHERE id = 1 AND revision = ?")
      .run(JSON.stringify(state), at, row.revision);
    if (result.changes !== 1) throw new Error("Daily app_state changed during financial cutover.");
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }

  const after = database.prepare("SELECT data, revision FROM app_state WHERE id = 1").get();
  const afterState = JSON.parse(after.data);
  const afterSnapshot = afterState.snapshot;
  if (hashJson(afterSnapshot.customerDebts) !== payload.replacement.customerDebtsHash || hashJson(afterSnapshot.pastMonthUninvoiced) !== payload.replacement.pastMonthHash) {
    throw new Error("Post-cutover balance verification failed.");
  }
  if (hashJson(afterSnapshot.state.entries) !== expected.entriesHash || hashJson(afterSnapshot.invoices) !== expected.invoicesHash) {
    throw new Error("Post-cutover transaction preservation verification failed.");
  }
  const finalCheck = database.prepare("PRAGMA quick_check").get();
  if (finalCheck?.quick_check !== "ok") throw new Error(`Post-cutover quick_check failed: ${finalCheck?.quick_check || "unknown"}`);

  console.log(JSON.stringify({
    ok: true,
    revision: after.revision,
    snapshotRevision: afterState.snapshotRevision,
    entries: afterSnapshot.state.entries.length,
    invoices: afterSnapshot.invoices.length,
    customerDebts: Object.keys(afterSnapshot.customerDebts).length,
    customerDebtSum: money(Object.values(afterSnapshot.customerDebts).reduce((sum, value) => sum + Number(value), 0)),
    pastMonthBalances: Object.keys(afterSnapshot.pastMonthUninvoiced).length,
    currentMonthPending: { count: Object.keys(currentPending).length, sum: pendingSum },
    debtAuditRows: debtAudits.length,
    pastMonthAuditRows: pastAudits.length,
    backupPath,
  }));
} finally {
  database.close();
}
