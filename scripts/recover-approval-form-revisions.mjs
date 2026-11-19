import { createHash, randomUUID } from "node:crypto";
import { copyFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDir = process.argv[2] || "server/data";
const apply = process.argv.includes("--apply");
const livePath = join(dataDir, "arix.sqlite");
const backupDir = join(dataDir, "backups");

const readState = (path) => {
  let database;
  try {
    database = new DatabaseSync(path, { readOnly: true });
    const row = database.prepare("SELECT data FROM app_state WHERE id = 1").get();
    return row?.data ? JSON.parse(row.data) : null;
  } catch {
    return null;
  } finally {
    database?.close();
  }
};

const snapshot = (form) => {
  const value = structuredClone(form || {});
  delete value.revisions;
  delete value.exportDocuments;
  delete value.printedByCurrentUser;
  delete value.printedAtForCurrentUser;
  return value;
};

const revisionTime = (form) => String(form.rejectedAt || form.approvedAt || form.updatedAt || form.preparedAt || `${form.date || "1970-01-01"}T00:00:00.000Z`);
const revisionSignature = (form) => {
  const value = snapshot(form);
  delete value.archive;
  return createHash("sha256").update(JSON.stringify({ at: revisionTime(form), status: form.status, value })).digest("hex");
};

const formsFromOrder = (order) => {
  if (!order?.approvalForm) return [];
  const root = order.approvalForm;
  const forms = [root, ...Object.values(root.exportDocuments || {})].filter(Boolean);
  const unique = new Map();
  for (const form of forms) unique.set(revisionSignature(form), form);
  return [...unique.values()];
};

const live = readState(livePath);
if (!live) throw new Error("Canlı uygulama durumu okunamadı.");
const backupFiles = readdirSync(backupDir)
  .filter((name) => name.endsWith(".sqlite"))
  .sort();

const savedOrders = new Map();
for (const file of backupFiles) {
  const state = readState(join(backupDir, file));
  for (const order of state?.orderBoard || []) {
    const keys = new Set([String(order.id || ""), String(order.number || "")].filter(Boolean));
    for (const key of keys) {
      const entry = savedOrders.get(key) || [];
      for (const form of formsFromOrder(order)) entry.push({ form, source: file });
      savedOrders.set(key, entry);
    }
  }
}

const recoveredSummary = [];
for (const order of live.orderBoard || []) {
  if (!order.approvalForm) continue;
  const existingRevisions = Array.isArray(order.approvalForm.revisions) ? order.approvalForm.revisions : [];
  const signatures = new Set([
    ...formsFromOrder(order).map(revisionSignature),
    ...existingRevisions.map((revision) => revisionSignature(revision.form || {})),
  ]);
  const recovered = [];
  const candidates = [...(savedOrders.get(String(order.id || "")) || []), ...(savedOrders.get(String(order.number || "")) || [])];
  for (const candidate of candidates) {
    const signature = revisionSignature(candidate.form);
    if (signatures.has(signature)) continue;
    signatures.add(signature);
    const form = snapshot(candidate.form);
    recovered.push({
      id: randomUUID(),
      documentType: ["proforma", "commercial_invoice", "packing_list"].includes(String(form.documentType)) ? form.documentType : "domestic",
      status: ["approved", "rejected"].includes(String(form.status)) ? form.status : "draft",
      createdAt: revisionTime(form),
      createdBy: String(form.rejectedBy || form.approvedBy || form.updatedBy || form.preparedBy || "AriX"),
      ...(form.rejectionReason || form.approvalNote ? { reason: String(form.rejectionReason || form.approvalNote).slice(0, 500) } : {}),
      form,
      recoveredFrom: candidate.source,
    });
  }
  if (!recovered.length) continue;
  order.approvalForm.revisions = [...existingRevisions, ...recovered]
    .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)))
    .slice(-100);
  recoveredSummary.push({
    orderNumber: order.number,
    customerName: order.customerName,
    recovered: recovered.length,
    statuses: recovered.reduce((result, revision) => ({ ...result, [revision.status]: (result[revision.status] || 0) + 1 }), {}),
  });
}

let safetyPath = "";
if (apply && recoveredSummary.length) {
  const checkpoint = new DatabaseSync(livePath);
  checkpoint.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
  checkpoint.close();
  safetyPath = join(backupDir, `arix-before-approval-revision-recovery-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}.sqlite`);
  copyFileSync(livePath, safetyPath);
  const database = new DatabaseSync(livePath);
  const now = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("UPDATE app_state SET data = ?, revision = revision + 1, updated_at = ? WHERE id = 1").run(JSON.stringify(live), now);
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  } finally {
    database.close();
  }
}

console.log(JSON.stringify({
  mode: apply ? "applied" : "inspect",
  backups: backupFiles.length,
  affectedOrders: recoveredSummary.length,
  recoveredRevisions: recoveredSummary.reduce((sum, item) => sum + item.recovered, 0),
  safetyBackup: safetyPath ? basename(safetyPath) : null,
  orders: recoveredSummary,
}, null, 2));
