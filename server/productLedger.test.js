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
