import test from "node:test";
import assert from "node:assert/strict";
import { buildDepotRollInventory, createAutomaticSaleRollSelection, validateAutomaticSaleRollSelection } from "./rollAllocation.js";

function movement(id, date, rolls) {
  return {
    id,
    type: "movement",
    posted: true,
    documentDate: date,
    toAccount: "ERSA DEPO",
    movementSelection: {
      containers: [{
        key: `container-${id}`,
        number: `C-${id}`,
        pallets: [{ id: `pallet-${id}`, number: `P-${id}`, rolls }],
      }],
    },
  };
}

test("automatic sale uses an exact full roll before opening another roll", () => {
  const db = {
    documents: [
      movement("old", "2026-01-01T09:00:00Z", [
        { rollId: "R-100", rollNo: "R-100", productId: 1, qty: 100 },
        { rollId: "R-80", rollNo: "R-80", productId: 1, qty: 80 },
      ]),
    ],
  };
  const selection = createAutomaticSaleRollSelection(db, { lines: [{ productId: 1, qty: 80 }] });
  assert.equal(selection.incomplete, false);
  assert.equal(selection.allocations.length, 1);
  assert.equal(selection.allocations[0].rollId, "R-80");
  assert.equal(selection.allocations[0].remainingQty, 0);
});

test("meter sale continues from the open roll and keeps the remainder", () => {
  const db = {
    documents: [
      movement("old", "2026-01-01T09:00:00Z", [
        { rollId: "R-OLD", rollNo: "R-OLD", productId: 1, qty: 100 },
      ]),
      movement("new", "2026-02-01T09:00:00Z", [
        { rollId: "R-NEW", rollNo: "R-NEW", productId: 1, qty: 100 },
      ]),
      {
        id: "sale-1",
        type: "sale",
        posted: true,
        documentDate: "2026-02-02T09:00:00Z",
        lines: [{ productId: 1, qty: 30 }],
        rollSelection: { allocations: [{ rollId: "R-OLD", productId: 1, qty: 30 }] },
      },
    ],
  };
  const inventory = buildDepotRollInventory(db);
  assert.equal(inventory.find((roll) => roll.rollId === "R-OLD").remainingQty, 70);
  const selection = createAutomaticSaleRollSelection(db, { lines: [{ productId: 1, qty: 40 }] });
  assert.equal(selection.allocations[0].rollId, "R-OLD");
  assert.equal(selection.allocations[0].qty, 40);
  assert.equal(selection.allocations[0].remainingQty, 30);
});

test("automatic selection spans rolls and reports a shortage", () => {
  const db = {
    documents: [movement("one", "2026-01-01T09:00:00Z", [
      { rollId: "R-1", rollNo: "R-1", productId: 1, qty: 60 },
      { rollId: "R-2", rollNo: "R-2", productId: 1, qty: 40 },
    ])],
  };
  const selection = createAutomaticSaleRollSelection(db, { lines: [{ productId: 1, name: "A", qty: 120 }] });
  assert.equal(selection.selectedQty, 100);
  assert.equal(selection.incomplete, true);
  assert.equal(selection.lines[0].shortageQty, 20);
});

test("service lines do not require roll stock", () => {
  const db = {
    products: [{ id: 9, name: "Quraşdırma", type: "service" }],
    documents: [],
  };
  const result = validateAutomaticSaleRollSelection(db, {
    id: "service-sale",
    lines: [{ productId: 9, name: "Quraşdırma", qty: 1 }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.selection.requestedQty, 0);
  assert.equal(result.selection.allocations.length, 0);
});
