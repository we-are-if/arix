import test from "node:test";
import assert from "node:assert/strict";
import { buildProductLedger } from "./productLedger.js";

test("product ledger keeps movement neutral and includes cost events", () => {
  const db = {
    products: [{ id: 1, antrepo: 40, depo: 40 }],
    documents: [
      { id: "sale", type: "sale", documentDate: "2026-02-03T10:00:00Z", account: "Depo", lines: [{ productId: 1, qty: 20, price: 4, unitCost: 2.8 }] },
      { id: "cost", type: "cashOut", documentDate: "2026-02-01T10:00:00Z", counterpartyName: "Antrepo", lines: [] },
      { id: "move", type: "movement", documentDate: "2026-01-20T10:00:00Z", fromAccount: "Antrepo", toAccount: "Depo", lines: [{ productId: 1, qty: 40, unitCost: 2.8 }] },
      { id: "purchase", type: "purchase", documentDate: "2026-01-01T10:00:00Z", lines: [{ productId: 1, qty: 100, price: 2, unitCost: 2.2 }] },
    ],
    lotCostEvents: [{ sourceDocumentId: "cost", productId: 1, type: "bondedCost", balanceQty: 60, unitCostAfter: 2.22, amount: 1.2, label: "Antrepo saxlama" }],
  };

  const ledger = buildProductLedger(db, 1);
  const chronological = [...ledger.entries].reverse();
  assert.deepEqual(chronological.map((entry) => entry.kind), ["purchase", "movement", "bondedCost", "sale"]);
  assert.deepEqual(chronological.map((entry) => entry.balance), [100, 100, 100, 80]);
  assert.equal(ledger.summary.currentBalance, 80);
  assert.equal(ledger.summary.openingBalance, 0);
  assert.equal(ledger.summary.inQty, 140);
  assert.equal(ledger.summary.outQty, 60);
});

test("delivery-pending sale does not reduce product ledger balance", () => {
  const db = {
    products: [{ id: 1, antrepo: 0, depo: 100 }],
    documents: [
      { id: "pending-sale", type: "sale", deferStockUntilDelivery: true, documentDate: "2026-02-03T10:00:00Z", account: "Depo", counterpartyName: "Duru", lines: [{ productId: 1, qty: 30, price: 4 }] },
      { id: "opening", type: "openingBalance", documentDate: "2026-01-01T10:00:00Z", account: "Depo", lines: [{ productId: 1, qty: 100 }] },
    ],
    lotCostEvents: [],
  };

  const ledger = buildProductLedger(db, 1);
  const pending = ledger.entries.find((entry) => entry.documentId === "pending-sale");
  assert.equal(pending?.kind, "sale_pending");
  assert.equal(pending?.delta, 0);
  assert.equal(ledger.summary.currentBalance, 100);
});

test("delivered part of a pending sale reduces stock until the whole sale is completed", () => {
  const db = {
    products: [{ id: 1, name: "Folyolu", warehouses: { depo: 80 } }],
    documents: [{
      id: "pending-sale", type: "sale", deferStockUntilDelivery: true,
      documentDate: "2026-02-03T10:00:00Z", account: "Depo", counterpartyName: "Duru",
      lines: [{ productId: 1, qty: 30, price: 4 }],
    }],
    deferredDeliveryMovements: [{
      id: "delivery-1", sourceDocumentId: "pending-sale", orderNumber: "ORD-1",
      productId: 1, quantity: 20, warehouse: "depo", createdAt: "2026-02-04T10:00:00Z", createdBy: "Arif",
    }],
    lotCostEvents: [],
  };
  const ledger = buildProductLedger(db, 1);
  assert.equal(ledger.summary.currentBalance, 80);
  assert.equal(ledger.summary.outQty, 20);
  assert.equal(ledger.entries.find((entry) => entry.kind === "deferredDelivery")?.delta, -20);
});
