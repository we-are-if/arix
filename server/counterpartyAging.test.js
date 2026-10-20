import test from "node:test";
import assert from "node:assert/strict";
import { calculateCounterpartyAging } from "./counterpartyAging.js";

test("groups open customer debt by due-date aging buckets", () => {
  const db = {
    counterparties: [{ id: 1, kind: "customer", name: "Test", paymentTermDays: 30 }],
    documents: [
      { type: "sale", posted: true, counterpartyId: 1, total: 100, documentDate: "2026-10-01", dueDate: "2026-11-01", payments: [] },
      { type: "sale", posted: true, counterpartyId: 1, total: 200, dueDate: "2026-09-30", payments: [{ amount: 50 }] },
      { type: "sale", posted: true, counterpartyId: 1, total: 300, dueDate: "2026-06-30", payments: [] },
    ],
  };
  const result = calculateCounterpartyAging(db, "customer", new Date("2026-10-20T12:00:00Z"));
  assert.equal(result.data[0].current, 100);
  assert.equal(result.data[0].days1To30, 150);
  assert.equal(result.data[0].daysOver90, 300);
  assert.equal(result.data[0].total, 550);
  assert.equal(result.totals.overdue, 450);
});

test("excludes drafts, canceled documents and fully paid documents", () => {
  const db = {
    counterparties: [{ id: 2, kind: "supplier", name: "Supplier" }],
    documents: [
      { type: "purchase", posted: false, counterpartyId: 2, total: 100 },
      { type: "purchase", posted: true, status: "canceled", counterpartyId: 2, total: 100 },
      { type: "purchase", posted: true, counterpartyId: 2, total: 100, payments: [{ amount: 100 }] },
    ],
  };
  const result = calculateCounterpartyAging(db, "supplier", new Date("2026-10-20T12:00:00Z"));
  assert.equal(result.data[0].total, 0);
  assert.equal(result.data[0].openDocumentCount, 0);
});
