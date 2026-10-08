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
  const selection = createAutomaticSaleRollSelection(db, { lines: [{ productId: 1, name: "A", qty: 120, deliveryMode: "flexible" }] });
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

test("single-piece delivery never joins two rolls", () => {
  const db = {
    documents: [movement("one", "2026-01-01T09:00:00Z", [
      { rollId: "R-1", rollNo: "R-1", productId: 1, qty: 40 },
      { rollId: "R-2", rollNo: "R-2", productId: 1, qty: 40 },
    ])],
  };
  const selection = createAutomaticSaleRollSelection(db, {
    lines: [{ productId: 1, name: "A", qty: 70, deliveryMode: "singlePiece" }],
  });
  assert.equal(selection.selectedQty, 0);
  assert.equal(selection.incomplete, true);
});

test("custom cuts can use any agreed lengths without joining a piece", () => {
  const db = {
    documents: [movement("one", "2026-01-01T09:00:00Z", [
      { rollId: "R-100", rollNo: "R-100", productId: 1, qty: 100 },
    ])],
  };
  const selection = createAutomaticSaleRollSelection(db, {
    lines: [{ productId: 1, name: "A", qty: 83, deliveryMode: "customCuts", cutLengths: [30, 21, 32] }],
  });
  assert.equal(selection.incomplete, false);
  assert.deepEqual(selection.allocations.map((item) => item.pieceQty), [30, 21, 32]);
  assert.equal(selection.rollCount, 1);
  assert.equal(Math.min(...selection.allocations.map((item) => item.remainingQty)), 17);
});

test("full-roll delivery uses only unopened rolls with an exact total", () => {
  const db = {
    documents: [
      movement("one", "2026-01-01T09:00:00Z", [
        { rollId: "R-OPEN", rollNo: "R-OPEN", productId: 1, qty: 80 },
        { rollId: "R-A", rollNo: "R-A", productId: 1, qty: 50 },
        { rollId: "R-B", rollNo: "R-B", productId: 1, qty: 30 },
      ]),
      {
        id: "sale-open",
        type: "sale",
        posted: true,
        documentDate: "2026-01-02T09:00:00Z",
        lines: [{ productId: 1, qty: 10 }],
        rollSelection: { allocations: [{ rollId: "R-OPEN", productId: 1, qty: 10 }] },
      },
    ],
  };
  const selection = createAutomaticSaleRollSelection(db, {
    lines: [{ productId: 1, name: "A", qty: 80, deliveryMode: "fullRoll" }],
  });
  assert.equal(selection.incomplete, false);
  assert.deepEqual(selection.allocations.map((item) => item.rollId), ["R-A", "R-B"]);
});

test("manual measurement changes the available roll before allocation", () => {
  const db = {
    documents: [movement("one", "2026-01-01T09:00:00Z", [
      { rollId: "R-OLD", rollNo: "R-OLD", productId: 1, qty: 80 },
      { rollId: "R-NEW", rollNo: "R-NEW", productId: 1, qty: 90 },
    ])],
  };
  const selection = createAutomaticSaleRollSelection(db, {
    rollMeasurements: [{ rollId: "R-OLD", actualQty: 20 }],
    lines: [{ productId: 1, name: "A", qty: 70, deliveryMode: "singlePiece" }],
  });
  assert.equal(selection.allocations[0].rollId, "R-NEW");
  assert.equal(selection.measurements[0].variance, -60);
});
