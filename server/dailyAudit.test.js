import test from "node:test";
import assert from "node:assert/strict";
import { buildDailySnapshotAudit, findInvoiceIdentityReplacements, hasInvoiceApprovalChange, hasInvoiceRestartChange } from "./dailyAudit.js";

const invoice = {
  id: "invoice-1",
  invoiceNo: "32609",
  customer: "Membran Group",
  status: "active",
  salesAmount: 872.7,
  returnAmount: 0,
  purchaseAmount: 0,
  paymentDeducted: 200,
  finalDebt: 3322.7,
  items: [{ name: "Məhsul", total: 872.7 }],
  linkedEntryIds: ["entry-1"],
};

const audit = (before, after) => buildDailySnapshotAudit({
  before,
  after,
  actorName: "Arif Mahmud",
  at: "2026-11-01T12:00:00.000Z",
  idFactory: (() => { let id = 0; return () => `audit-${++id}`; })(),
});

test("records an invoice restart with actor and changed fields", () => {
  const before = { state: { entries: [], closes: [] }, invoices: [invoice] };
  const after = { state: { entries: [], closes: [] }, invoices: [{
    ...invoice,
    status: "cancelled",
    restartedAt: "2026-11-01T12:00:00.000Z",
    restartedBy: "Arif Mahmud",
  }] };
  const rows = audit(before, after);
  const row = rows.find((item) => item.action === "daily_invoice_restarted");
  assert.equal(row?.by, "Arif Mahmud");
  assert.equal(row?.target, "SPF-32609 · Membran Group");
  assert.ok(row?.changes.some((change) => change.field === "Status"));
});

test("keeps a permanent deletion record after the invoice is removed", () => {
  const rows = audit(
    { state: { entries: [], closes: [] }, invoices: [invoice] },
    { state: { entries: [], closes: [] }, invoices: [] },
  );
  const row = rows.find((item) => item.action === "daily_invoice_permanently_deleted");
  assert.equal(row?.entityId, "invoice-1");
  assert.match(row?.details || "", /872\.70/);
  assert.equal(row?.documentSnapshot?.customer, "Membran Group");
});

test("keeps recoverable invoice data without duplicating the source image", () => {
  const created = audit(
    { state: { entries: [], closes: [] }, invoices: [] },
    { state: { entries: [], closes: [] }, invoices: [{ ...invoice, screenshotDataUrl: "data:image/png;base64,large" }] },
  ).find((row) => row.action === "daily_invoice_approved");
  assert.equal(created?.documentSnapshot?.invoiceNo, "32609");
  assert.equal(created?.documentSnapshot?.sourceImageAvailable, true);
  assert.equal("screenshotDataUrl" in (created?.documentSnapshot || {}), false);

  const updated = audit(
    { state: { entries: [], closes: [] }, invoices: [invoice] },
    { state: { entries: [], closes: [] }, invoices: [{ ...invoice, customer: "Yeni müştəri" }] },
  ).find((row) => row.action === "daily_invoice_updated");
  assert.equal(updated?.documentBefore?.customer, "Membran Group");
  assert.equal(updated?.documentAfter?.customer, "Yeni müştəri");
});

test("records debt, entry creation and entry deletion separately", () => {
  const before = {
    state: { entries: [{ id: "old", date: "2026-10-31", counterparty: "A", amount: 10 }], closes: [] },
    invoices: [],
    customerDebts: { A: 100 },
  };
  const after = {
    state: { entries: [{ id: "new", date: "2026-11-01", counterparty: "B", amount: 20 }], closes: [] },
    invoices: [],
    customerDebts: { A: 120 },
  };
  const actions = audit(before, after).map((row) => row.action);
  assert.ok(actions.includes("daily_entry_created"));
  assert.ok(actions.includes("daily_entry_deleted"));
  assert.ok(actions.includes("daily_customer_debt_changed"));
});

test("requires restart permission only for a new restart mutation", () => {
  const restartedCopy = { ...invoice, id: "invoice-2", restartOf: "invoice-1", status: "draft" };
  assert.equal(hasInvoiceRestartChange([], [restartedCopy]), true);
  assert.equal(hasInvoiceRestartChange([restartedCopy], [restartedCopy]), false);
  assert.equal(hasInvoiceRestartChange([invoice], [{ ...invoice, restartedAt: "2026-11-01T12:00:00.000Z" }]), true);
});

test("requires approval permission when an active invoice is changed", () => {
  assert.equal(hasInvoiceApprovalChange([], [invoice]), true);
  assert.equal(hasInvoiceApprovalChange([invoice], [invoice]), false);
  assert.equal(hasInvoiceApprovalChange([invoice], [{ ...invoice, salesAmount: 999 }]), true);
  assert.equal(hasInvoiceApprovalChange([{ ...invoice, status: "draft" }], [{ ...invoice, status: "cancelled" }]), true);
});

test("detects a different source document trying to reuse an existing invoice id", () => {
  const replacement = {
    ...invoice,
    invoiceNo: "32632",
    customer: "Kapakçı MMC (Fuad)",
    screenshotDataUrl: "data:image/png;base64,new",
  };
  assert.deepEqual(findInvoiceIdentityReplacements([invoice], [replacement]).map((item) => item.id), ["invoice-1"]);
  assert.equal(findInvoiceIdentityReplacements([invoice], [{ ...invoice, customer: "Corrected customer" }]).length, 0);
});

test("records card limit and bank rule changes", () => {
  const before = { state: { entries: [], closes: [] }, invoices: [], cardLimitSettings: null };
  const after = {
    state: { entries: [], closes: [] },
    invoices: [],
    cardLimitSettings: {
      "Kapital Bank": {
        limits: { Arif: 5000 },
        rules: { opening: true, income: true, onlinePayment: true, sameBankTransfer: true, diffBankTransfer: false, cashOut: false },
      },
    },
  };
  const row = audit(before, after).find((item) => item.action === "daily_card_limit_settings_changed");
  assert.equal(row?.target, "Kart limitləri");
  assert.equal(row?.entityId, "card-limit-settings");
});
