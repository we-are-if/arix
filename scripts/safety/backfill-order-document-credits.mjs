import { DatabaseSync } from "node:sqlite";

const sqlitePath = process.argv[2] || "/opt/arix/server/data/arix.sqlite";
const database = new DatabaseSync(sqlitePath);
const month = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
}).format(new Date());

const row = database.prepare("SELECT data FROM app_state WHERE id = 1").get();
if (!row?.data) throw new Error("AriX application state was not found.");
const state = JSON.parse(row.data);
const rawCompany = String(state?.companySettings?.profile?.organizationName || "arix-order").trim();
const company = rawCompany.toLocaleLowerCase("tr").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "arix-order";
const meterKey = `metered:order-document-credits:${company}:${month}`;
const documents = new Map();

for (const order of [...(state.orderBoard || []), ...(state.orderTrash || [])]) {
  if (order?.isTest || !order?.approvalForm || !order?.id) continue;
  const root = order.approvalForm;
  const rootType = ["proforma", "commercial_invoice", "packing_list"].includes(String(root.documentType))
    ? String(root.documentType)
    : "domestic";
  const variants = new Map([[rootType, root]]);
  for (const [type, form] of Object.entries(root.exportDocuments || {})) {
    if (["proforma", "commercial_invoice", "packing_list"].includes(type) && form && typeof form === "object") {
      variants.set(type, form);
    }
  }
  for (const [type, form] of variants) {
    const createdAt = String(form.preparedAt || form.createdAt || form.updatedAt || form.rejectedAt || "");
    if (!createdAt.startsWith(month)) continue;
    documents.set(`${company}:${order.id}:${type}`, { orderId: String(order.id), type, number: String(form.number || order.number || "") });
  }
}

database.exec("BEGIN IMMEDIATE");
try {
  let used = Math.max(0, Number(database.prepare("SELECT value FROM persistence_meta WHERE key = ?").get(meterKey)?.value || 0));
  let added = 0;
  const hasEvent = database.prepare("SELECT 1 FROM metered_usage_events WHERE usage_key = ?");
  const addEvent = database.prepare("INSERT INTO metered_usage_events (usage_key, meter_key, created_at) VALUES (?, ?, ?)");
  const saveUsage = database.prepare("INSERT INTO persistence_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  for (const usageKey of documents.keys()) {
    if (hasEvent.get(usageKey)) continue;
    used += 1;
    addEvent.run(usageKey, meterKey, new Date().toISOString());
    added += 1;
  }
  saveUsage.run(meterKey, String(used));
  database.exec("COMMIT");
  console.log(JSON.stringify({ month, documentsFound: documents.size, added, used, freeLimit: 200, remaining: Math.max(0, 200 - used), billable: Math.max(0, used - 200), amountTry: Math.max(0, used - 200) * 5 }));
} catch (error) {
  database.exec("ROLLBACK");
  throw error;
} finally {
  database.close();
}
