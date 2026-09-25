import test from "node:test";
import assert from "node:assert/strict";
import { rebuildLotAccounting } from "./lotAccounting.js";

const purchaseId = "purchase-1";
const containerNumber = "CONT-001";

function selection(rollId, productId, qty) {
  return {
    containers: [{
      documentId: purchaseId,
      number: containerNumber,
      key: `${purchaseId}:${containerNumber}`,
      pallets: [{ id: "PAL-1", rolls: [{ rollId, productId, qty }] }],
    }],
  };
}

function costDocument(id, date, amount, category) {
  return {
    id,
    type: "cashOut",
    posted: true,
    createdAt: date,
    documentDate: date,
    amount,
    total: amount,
    category,
    costLink: {
      enabled: true,
      category,
      containers: [{ documentId: purchaseId, number: containerNumber, key: `${purchaseId}:${containerNumber}` }],
    },
  };
}

function movementCostDocument(id, date, amount, movementDocumentId) {
  return {
    id,
    type: "cashOut",
    posted: true,
    createdAt: date,
    documentDate: date,
    amount,
    total: amount,
    category: "Depoya düşüm xərci",
    costLink: { enabled: true, scope: "movement", movementDocumentId, category: "Depoya düşüm xərci" },
  };
}

function scenarioDocuments() {
  return [
    {
      id: purchaseId,
      type: "purchase",
      posted: true,
      createdAt: "2026-01-01T08:00:00Z",
      documentDate: "2026-01-01T08:00:00Z",
      counterpartyName: "Z təchizatçısı",
      lines: [{ productId: 1, qty: 5000, price: 2, total: 10000 }],
      bondedStock: {
        containers: [{
          number: containerNumber,
          pallets: [{
            id: "PAL-1",
            rolls: [
              { id: "R-EXPORT-JAN", productId: 1, qty: 500 },
              { id: "R-MOVE-JAN", productId: 1, qty: 500 },
              { id: "R-EXPORT-FEB", productId: 1, qty: 500 },
              { id: "R-MOVE-FEB", productId: 1, qty: 500 },
              { id: "R-REST", productId: 1, qty: 3000 },
            ],
          }],
        }],
      },
    },
    costDocument("initial-cost", "2026-01-01T09:00:00Z", 1000, "İlkin alış xərcləri"),
    {
      id: "export-jan",
      type: "sale",
      saleMode: "export",
      posted: true,
      createdAt: "2026-01-15T10:00:00Z",
      documentDate: "2026-01-15T10:00:00Z",
      lines: [{ productId: 1, qty: 500, price: 4, total: 2000 }],
      movementSelection: selection("R-EXPORT-JAN", 1, 500),
    },
    {
      id: "move-jan",
      type: "movement",
      posted: true,
      createdAt: "2026-01-20T10:00:00Z",
      documentDate: "2026-01-20T10:00:00Z",
      lines: [{ productId: 1, qty: 500 }],
      movementSelection: selection("R-MOVE-JAN", 1, 500),
    },
    movementCostDocument("move-jan-cost", "2026-01-20T11:00:00Z", 300, "move-jan"),
    costDocument("feb-storage", "2026-02-01T09:00:00Z", 80, "Antrepo saxlama xərci"),
    {
      id: "export-feb",
      type: "sale",
      saleMode: "export",
      posted: true,
      createdAt: "2026-02-10T10:00:00Z",
      documentDate: "2026-02-10T10:00:00Z",
      lines: [{ productId: 1, qty: 500, price: 4, total: 2000 }],
      movementSelection: selection("R-EXPORT-FEB", 1, 500),
    },
    {
      id: "move-feb",
      type: "movement",
      posted: true,
      createdAt: "2026-02-15T10:00:00Z",
      documentDate: "2026-02-15T10:00:00Z",
      lines: [{ productId: 1, qty: 500 }],
      movementSelection: selection("R-MOVE-FEB", 1, 500),
    },
    movementCostDocument("move-feb-cost", "2026-02-15T11:00:00Z", 350, "move-feb"),
    {
      id: "regular-sale",
      type: "sale",
      saleMode: "regular",
      posted: true,
      createdAt: "2026-02-20T10:00:00Z",
      documentDate: "2026-02-20T10:00:00Z",
      lines: [{ productId: 1, qty: 100, price: 5, total: 500 }],
    },
  ];
}

function documentById(db, id) {
  return db.documents.find((document) => document.id === id);
}

test("costs exports and depot layers follow their effective timestamps", () => {
  const db = { products: [{ id: 1, name: "A", purchasePrice: 2, cost: 2 }], documents: scenarioDocuments() };
  const result = rebuildLotAccounting(db, { recordAudit: false });

  assert.equal(documentById(db, "export-jan").lines[0].unitCost, 2.2);
  assert.equal(documentById(db, "export-feb").lines[0].unitCost, 2.22);
  assert.equal(documentById(db, "regular-sale").lines[0].unitCost, 2.8);
  assert.equal(result.purchaseLots[0].remainingBondedQty, 3000);

  const januaryDepotLot = result.depotLots.find((lot) => lot.sourceMovementDocumentId === "move-jan");
  const februaryDepotLot = result.depotLots.find((lot) => lot.sourceMovementDocumentId === "move-feb");
  assert.equal(januaryDepotLot.currentUnitCost, 2.8);
  assert.equal(januaryDepotLot.remainingQty, 400);
  assert.equal(februaryDepotLot.currentUnitCost, 2.92);
  assert.equal(februaryDepotLot.remainingQty, 500);
  assert.equal(result.unresolved.length, 0);
});

test("a forgotten backdated cost recalculates every dependent result", () => {
  const db = {
    products: [{ id: 1, name: "A", purchasePrice: 2, cost: 2 }],
    documents: scenarioDocuments(),
    lotRecalculations: [],
  };
  rebuildLotAccounting(db, { recordAudit: false });
  db.documents.push(costDocument("forgotten-cost", "2026-01-10T09:00:00Z", 100, "Unudulmuş xərc"));
  const result = rebuildLotAccounting(db, {
    sourceDocumentId: "forgotten-cost",
    effectiveFrom: "2026-01-10T09:00:00Z",
    reason: "Keçmiş tarixli xərc",
  });

  assert.equal(documentById(db, "export-jan").lines[0].unitCost, 2.22);
  assert.equal(documentById(db, "export-feb").lines[0].unitCost, 2.24);
  assert.equal(documentById(db, "regular-sale").lines[0].unitCost, 2.82);
  assert.equal(result.depotLots.find((lot) => lot.sourceMovementDocumentId === "move-jan").currentUnitCost, 2.82);
  assert.equal(result.depotLots.find((lot) => lot.sourceMovementDocumentId === "move-feb").currentUnitCost, 2.94);
  assert.ok(db.lotRecalculations[0].changes.some((change) => change.documentId === "export-jan"));
  assert.ok(db.lotRecalculations[0].changes.some((change) => change.documentId === "regular-sale"));
});
