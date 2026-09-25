import { randomUUID } from "node:crypto";

const EPSILON = 0.000001;

function numberValue(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 6) {
  return Number(numberValue(value).toFixed(digits));
}

function effectiveAt(document) {
  return String(document.documentDate ?? document.createdAt ?? new Date(0).toISOString());
}

function eventTimestamp(document) {
  const parsed = Date.parse(effectiveAt(document));
  return Number.isFinite(parsed) ? parsed : 0;
}

function sourceLine(document, productId) {
  return (document.lines ?? []).find((line) => Number(line.productId) === Number(productId));
}

function documentRevenue(line) {
  return Math.max(0, numberValue(line.total) || numberValue(line.qty) * numberValue(line.price) - numberValue(line.discount));
}

function containerIdentity(documentId, containerNumber) {
  return `${documentId}:${containerNumber || "unassigned"}`;
}

function purchaseLotId(documentId, containerNumber, productId) {
  return `purchase:${documentId}:${containerNumber || "unassigned"}:${productId}`;
}

function depotLotId(documentId, sourceLotId, productId) {
  return `depot:${documentId}:${sourceLotId || "direct"}:${productId}`;
}

function appendTimeline(lot, event) {
  lot.costTimeline.push({
    id: event.id ?? randomUUID(),
    effectiveAt: event.effectiveAt,
    type: event.type,
    sourceDocumentId: event.sourceDocumentId,
    label: event.label,
    amount: round(event.amount, 4),
    balanceQty: round(event.balanceQty, 4),
    unitDelta: round(event.unitDelta),
    unitCostBefore: round(event.unitCostBefore),
    unitCostAfter: round(event.unitCostAfter),
  });
}

function flattenSelection(document) {
  const rows = [];
  for (const container of document.movementSelection?.containers ?? []) {
    for (const pallet of container.pallets ?? []) {
      for (const roll of pallet.rolls ?? []) {
        rows.push({
          sourceDocumentId: String(roll.sourceDocumentId ?? container.documentId ?? ""),
          containerKey: String(roll.containerKey ?? container.key ?? ""),
          containerNumber: String(roll.containerNumber ?? container.number ?? ""),
          rollId: String(roll.rollId ?? roll.id ?? ""),
          productId: Number(roll.productId),
          qty: numberValue(roll.qty ?? roll.qtyValue),
          palletId: String(roll.palletId ?? pallet.id ?? ""),
        });
      }
    }
  }
  return rows.filter((row) => row.productId && row.qty > EPSILON);
}

function findPurchaseLot(row, purchaseLots, rollIndex) {
  const byRoll = rollIndex.get(row.rollId);
  if (byRoll) return byRoll;
  return purchaseLots.find((lot) => {
    if (Number(lot.productId) !== Number(row.productId)) return false;
    if (row.sourceDocumentId && String(lot.purchaseDocumentId) !== row.sourceDocumentId) return false;
    if (row.containerKey && String(lot.containerKey) === row.containerKey) return true;
    return row.containerNumber && String(lot.containerNumber) === row.containerNumber;
  });
}

function allocationSnapshot(lot, qty, unitCost, extra = {}) {
  return {
    lotId: lot.id,
    sourcePurchaseLotId: lot.sourcePurchaseLotId ?? lot.id,
    purchaseDocumentId: lot.purchaseDocumentId,
    containerNumber: lot.containerNumber ?? null,
    productId: lot.productId,
    qty: round(qty, 4),
    unitCost: round(unitCost),
    costTotal: round(qty * unitCost, 4),
    ...extra,
  };
}

function applyLineCost(document, productId, allocations, source) {
  const line = sourceLine(document, productId);
  if (!line || allocations.length === 0) return;
  const allocatedQty = allocations.reduce((sum, item) => sum + numberValue(item.qty), 0);
  const costTotal = allocations.reduce((sum, item) => sum + numberValue(item.costTotal), 0);
  const unitCost = allocatedQty > 0 ? costTotal / allocatedQty : 0;
  const revenue = documentRevenue(line);
  line.lotAllocations = allocations;
  line.unitCost = round(unitCost);
  line.costTotal = round(costTotal, 4);
  line.grossProfit = round(revenue - costTotal, 4);
  line.marginPercent = revenue > 0 ? round(((revenue - costTotal) / revenue) * 100, 4) : 0;
  line.costSource = source;
  line.costCalculatedAt = new Date().toISOString();
  line.costStatus = allocatedQty + EPSILON >= numberValue(line.qty) ? "complete" : "partial";
}

function consumeLots(lots, qty, unitCostKey, remainingKey) {
  let remaining = numberValue(qty);
  const allocations = [];
  const candidates = lots
    .filter((lot) => numberValue(lot[remainingKey]) > EPSILON)
    .sort((a, b) => String(a.availableAt ?? a.documentDate).localeCompare(String(b.availableAt ?? b.documentDate)) || a.id.localeCompare(b.id));
  for (const lot of candidates) {
    if (remaining <= EPSILON) break;
    const consumed = Math.min(remaining, numberValue(lot[remainingKey]));
    lot[remainingKey] = round(numberValue(lot[remainingKey]) - consumed, 4);
    allocations.push(allocationSnapshot(lot, consumed, numberValue(lot[unitCostKey])));
    remaining -= consumed;
  }
  return { allocations, missingQty: Math.max(0, round(remaining, 4)) };
}

function selectedPurchaseAllocations(document, purchaseLots, rollIndex) {
  const grouped = new Map();
  for (const row of flattenSelection(document)) {
    const lot = findPurchaseLot(row, purchaseLots, rollIndex);
    if (!lot) continue;
    const current = grouped.get(lot.id) ?? { lot, qty: 0, rollIds: [] };
    current.qty += row.qty;
    if (row.rollId) current.rollIds.push(row.rollId);
    grouped.set(lot.id, current);
  }
  return Array.from(grouped.values());
}

function linkedPurchaseLots(document, purchaseLots) {
  const link = document.costLink ?? {};
  const containers = Array.isArray(link.containers) ? link.containers : [];
  const keys = new Set([
    ...(Array.isArray(link.containerKeys) ? link.containerKeys.map(String) : []),
    ...containers.map((item) => String(item.key ?? "")).filter(Boolean),
  ]);
  const numbers = new Set(containers.map((item) => String(item.number ?? "")).filter(Boolean));
  const documentIds = new Set(containers.map((item) => String(item.documentId ?? "")).filter(Boolean));
  return purchaseLots.filter((lot) => {
    if (documentIds.size && !documentIds.has(String(lot.purchaseDocumentId))) return false;
    if (keys.has(String(lot.containerKey))) return true;
    return numbers.has(String(lot.containerNumber));
  });
}

function applyPurchaseCostDocument(document, purchaseLots, costEvents) {
  const targets = linkedPurchaseLots(document, purchaseLots).filter((lot) => lot.remainingBondedQty > EPSILON);
  const totalBalance = targets.reduce((sum, lot) => sum + lot.remainingBondedQty, 0);
  const totalExpense = Math.abs(numberValue(document.amount ?? document.total));
  if (targets.length === 0 || totalBalance <= EPSILON || totalExpense <= 0) return false;
  const unitDelta = totalExpense / totalBalance;
  for (const lot of targets) {
    const before = lot.currentBondedUnitCost;
    const allocatedAmount = unitDelta * lot.remainingBondedQty;
    lot.currentBondedUnitCost = round(before + unitDelta);
    lot.totalAddedCost = round(lot.totalAddedCost + allocatedAmount, 4);
    const event = {
      id: `${document.id}:${lot.id}`,
      lotId: lot.id,
      productId: lot.productId,
      effectiveAt: effectiveAt(document),
      type: "bondedCost",
      sourceDocumentId: document.id,
      label: String(document.costLink?.category ?? document.category ?? "Antrepo maya xərci"),
      amount: allocatedAmount,
      balanceQty: lot.remainingBondedQty,
      unitDelta,
      unitCostBefore: before,
      unitCostAfter: lot.currentBondedUnitCost,
    };
    costEvents.push(event);
    appendTimeline(lot, event);
  }
  return true;
}

function movementTargetId(document) {
  const link = document.costLink ?? {};
  if (link.scope === "movement") return String(link.movementDocumentId ?? link.documentId ?? "");
  return String(link.movementDocumentId ?? "");
}

function applyMovementCostDocument(document, depotLots, costEvents) {
  const targetId = movementTargetId(document);
  if (!targetId) return false;
  const targets = depotLots.filter((lot) => String(lot.sourceMovementDocumentId) === targetId && lot.remainingQty > EPSILON);
  const totalBalance = targets.reduce((sum, lot) => sum + lot.remainingQty, 0);
  const totalExpense = Math.abs(numberValue(document.amount ?? document.total));
  if (targets.length === 0 || totalBalance <= EPSILON || totalExpense <= 0) return false;
  const unitDelta = totalExpense / totalBalance;
  for (const lot of targets) {
    const before = lot.currentUnitCost;
    const allocatedAmount = unitDelta * lot.remainingQty;
    lot.currentUnitCost = round(before + unitDelta);
    lot.movementCostPerUnit = round(lot.movementCostPerUnit + unitDelta);
    const event = {
      id: `${document.id}:${lot.id}`,
      lotId: lot.id,
      productId: lot.productId,
      effectiveAt: effectiveAt(document),
      type: "depotCost",
      sourceDocumentId: document.id,
      label: String(document.costLink?.category ?? document.category ?? "Depoya düşüm xərci"),
      amount: allocatedAmount,
      balanceQty: lot.remainingQty,
      unitDelta,
      unitCostBefore: before,
      unitCostAfter: lot.currentUnitCost,
    };
    costEvents.push(event);
    appendTimeline(lot, event);
  }
  return true;
}

function addPurchaseLots(document, purchaseLots, depotLots, rollIndex) {
  const coveredByProduct = new Map();
  const containers = document.bondedStock?.containers ?? [];
  for (const container of containers) {
    const rollsByProduct = new Map();
    for (const pallet of container.pallets ?? []) {
      for (const roll of pallet.rolls ?? []) {
        const productId = Number(roll.productId);
        const qty = numberValue(roll.qty);
        if (!productId || qty <= EPSILON) continue;
        const current = rollsByProduct.get(productId) ?? { qty: 0, rollIds: [] };
        current.qty += qty;
        current.rollIds.push(String(roll.id));
        rollsByProduct.set(productId, current);
      }
    }
    for (const [productId, rollData] of rollsByProduct) {
      const line = sourceLine(document, productId) ?? {};
      const baseUnitCost = numberValue(line.directPurchasePrice ?? line.price);
      const lot = {
        id: purchaseLotId(document.id, container.number, productId),
        productId,
        purchaseDocumentId: document.id,
        supplierId: document.counterpartyId ?? null,
        supplierName: document.counterpartyName ?? "",
        documentDate: effectiveAt(document),
        containerKey: containerIdentity(document.id, container.number),
        containerNumber: String(container.number ?? ""),
        initialQty: round(rollData.qty, 4),
        remainingBondedQty: round(rollData.qty, 4),
        exportedQty: 0,
        movedToDepotQty: 0,
        baseUnitCost: round(baseUnitCost),
        currentBondedUnitCost: round(baseUnitCost),
        totalAddedCost: 0,
        rollIds: rollData.rollIds,
        costTimeline: [],
      };
      appendTimeline(lot, {
        effectiveAt: lot.documentDate,
        type: "purchase",
        sourceDocumentId: document.id,
        label: "Alış partiyası",
        amount: lot.initialQty * lot.baseUnitCost,
        balanceQty: lot.initialQty,
        unitDelta: lot.baseUnitCost,
        unitCostBefore: 0,
        unitCostAfter: lot.baseUnitCost,
      });
      purchaseLots.push(lot);
      coveredByProduct.set(productId, (coveredByProduct.get(productId) ?? 0) + rollData.qty);
      for (const rollId of rollData.rollIds) rollIndex.set(rollId, lot);
    }
  }

  for (const [lineIndex, line] of (document.lines ?? []).entries()) {
    const productId = Number(line.productId);
    const remainingQty = Math.max(0, numberValue(line.qty) - numberValue(coveredByProduct.get(productId)));
    if (!productId || remainingQty <= EPSILON) continue;
    const baseUnitCost = numberValue(line.directPurchasePrice ?? line.price);
    if (containers.length > 0) {
      const lot = {
        id: purchaseLotId(document.id, `unassigned-${lineIndex}`, productId),
        productId,
        purchaseDocumentId: document.id,
        supplierId: document.counterpartyId ?? null,
        supplierName: document.counterpartyName ?? "",
        documentDate: effectiveAt(document),
        containerKey: containerIdentity(document.id, `unassigned-${lineIndex}`),
        containerNumber: "Təyin edilməyib",
        initialQty: round(remainingQty, 4),
        remainingBondedQty: round(remainingQty, 4),
        exportedQty: 0,
        movedToDepotQty: 0,
        baseUnitCost: round(baseUnitCost),
        currentBondedUnitCost: round(baseUnitCost),
        totalAddedCost: 0,
        rollIds: [],
        costTimeline: [],
      };
      appendTimeline(lot, {
        effectiveAt: lot.documentDate,
        type: "purchase",
        sourceDocumentId: document.id,
        label: "Alış partiyası",
        amount: lot.initialQty * lot.baseUnitCost,
        balanceQty: lot.initialQty,
        unitDelta: lot.baseUnitCost,
        unitCostBefore: 0,
        unitCostAfter: lot.baseUnitCost,
      });
      purchaseLots.push(lot);
    } else {
      const lot = {
        id: depotLotId(document.id, `direct-${lineIndex}`, productId),
        productId,
        sourcePurchaseLotId: null,
        purchaseDocumentId: document.id,
        sourceMovementDocumentId: null,
        supplierName: document.counterpartyName ?? "",
        availableAt: effectiveAt(document),
        documentDate: effectiveAt(document),
        containerNumber: null,
        initialQty: round(remainingQty, 4),
        remainingQty: round(remainingQty, 4),
        soldQty: 0,
        inheritedUnitCost: round(baseUnitCost),
        movementCostPerUnit: 0,
        currentUnitCost: round(baseUnitCost),
        costTimeline: [],
      };
      appendTimeline(lot, {
        effectiveAt: lot.availableAt,
        type: "directPurchase",
        sourceDocumentId: document.id,
        label: "Birbaşa depo alışı",
        amount: lot.initialQty * lot.currentUnitCost,
        balanceQty: lot.initialQty,
        unitDelta: lot.currentUnitCost,
        unitCostBefore: 0,
        unitCostAfter: lot.currentUnitCost,
      });
      depotLots.push(lot);
    }
  }
}

function applyBondedExit(document, purchaseLots, depotLots, rollIndex, unresolved) {
  const selected = selectedPurchaseAllocations(document, purchaseLots, rollIndex);
  const allocationsByProduct = new Map();
  const isExport = document.type === "sale";
  for (const item of selected) {
    const available = item.lot.remainingBondedQty;
    const consumed = Math.min(item.qty, available);
    if (consumed <= EPSILON) {
      unresolved.push({ documentId: document.id, type: document.type, reason: "Seçilmiş alış partiyasında qalıq yoxdur", lotId: item.lot.id });
      continue;
    }
    item.lot.remainingBondedQty = round(available - consumed, 4);
    if (isExport) item.lot.exportedQty = round(item.lot.exportedQty + consumed, 4);
    else item.lot.movedToDepotQty = round(item.lot.movedToDepotQty + consumed, 4);
    const allocation = allocationSnapshot(item.lot, consumed, item.lot.currentBondedUnitCost, { rollIds: item.rollIds });
    const list = allocationsByProduct.get(item.lot.productId) ?? [];
    list.push(allocation);
    allocationsByProduct.set(item.lot.productId, list);

    if (!isExport) {
      const lot = {
        id: depotLotId(document.id, item.lot.id, item.lot.productId),
        productId: item.lot.productId,
        sourcePurchaseLotId: item.lot.id,
        purchaseDocumentId: item.lot.purchaseDocumentId,
        sourceMovementDocumentId: document.id,
        supplierName: item.lot.supplierName,
        availableAt: effectiveAt(document),
        documentDate: effectiveAt(document),
        containerNumber: item.lot.containerNumber,
        initialQty: round(consumed, 4),
        remainingQty: round(consumed, 4),
        soldQty: 0,
        inheritedUnitCost: round(item.lot.currentBondedUnitCost),
        movementCostPerUnit: 0,
        currentUnitCost: round(item.lot.currentBondedUnitCost),
        rollIds: item.rollIds,
        costTimeline: [],
      };
      appendTimeline(lot, {
        effectiveAt: lot.availableAt,
        type: "bondedTransfer",
        sourceDocumentId: document.id,
        label: "Antrepodan depoya düşüm",
        amount: lot.initialQty * lot.currentUnitCost,
        balanceQty: lot.initialQty,
        unitDelta: lot.currentUnitCost,
        unitCostBefore: 0,
        unitCostAfter: lot.currentUnitCost,
      });
      depotLots.push(lot);
    }
  }

  for (const line of document.lines ?? []) {
    const productId = Number(line.productId);
    let allocations = allocationsByProduct.get(productId) ?? [];
    const selectedQty = allocations.reduce((sum, item) => sum + numberValue(item.qty), 0);
    const missingSelectionQty = Math.max(0, numberValue(line.qty) - selectedQty);
    if (missingSelectionQty > EPSILON) {
      const fallback = consumeLots(
        purchaseLots.filter((lot) => lot.productId === productId),
        missingSelectionQty,
        "currentBondedUnitCost",
        "remainingBondedQty"
      );
      for (const allocation of fallback.allocations) {
        const sourceLot = purchaseLots.find((lot) => lot.id === allocation.lotId);
        if (!sourceLot) continue;
        if (isExport) sourceLot.exportedQty = round(sourceLot.exportedQty + allocation.qty, 4);
        else {
          sourceLot.movedToDepotQty = round(sourceLot.movedToDepotQty + allocation.qty, 4);
          const lot = {
            id: depotLotId(document.id, sourceLot.id, sourceLot.productId),
            productId: sourceLot.productId,
            sourcePurchaseLotId: sourceLot.id,
            purchaseDocumentId: sourceLot.purchaseDocumentId,
            sourceMovementDocumentId: document.id,
            supplierName: sourceLot.supplierName,
            availableAt: effectiveAt(document),
            documentDate: effectiveAt(document),
            containerNumber: sourceLot.containerNumber,
            initialQty: round(allocation.qty, 4),
            remainingQty: round(allocation.qty, 4),
            soldQty: 0,
            inheritedUnitCost: round(sourceLot.currentBondedUnitCost),
            movementCostPerUnit: 0,
            currentUnitCost: round(sourceLot.currentBondedUnitCost),
            rollIds: [],
            costTimeline: [],
          };
          appendTimeline(lot, {
            effectiveAt: lot.availableAt,
            type: "bondedTransfer",
            sourceDocumentId: document.id,
            label: "Antrepodan depoya düşüm",
            amount: lot.initialQty * lot.currentUnitCost,
            balanceQty: lot.initialQty,
            unitDelta: lot.currentUnitCost,
            unitCostBefore: 0,
            unitCostAfter: lot.currentUnitCost,
          });
          depotLots.push(lot);
        }
      }
      allocations = [...allocations, ...fallback.allocations];
      if (fallback.missingQty > EPSILON) unresolved.push({ documentId: document.id, type: document.type, productId, missingQty: fallback.missingQty, reason: "Antrepo partiyası çatmır" });
    }
    if (document.type === "sale") applyLineCost(document, productId, allocations, "bonded-lot");
    else line.lotAllocations = allocations;
  }
}

function applyRegularSale(document, depotLots, unresolved) {
  for (const line of document.lines ?? []) {
    const productId = Number(line.productId);
    const result = consumeLots(
      depotLots.filter((lot) => lot.productId === productId),
      line.qty,
      "currentUnitCost",
      "remainingQty"
    );
    for (const allocation of result.allocations) {
      const lot = depotLots.find((item) => item.id === allocation.lotId);
      if (lot) lot.soldQty = round(lot.soldQty + allocation.qty, 4);
    }
    if (result.allocations.length > 0) applyLineCost(document, productId, result.allocations, "depot-lot");
    if (result.missingQty > EPSILON) unresolved.push({ documentId: document.id, type: document.type, productId, missingQty: result.missingQty, reason: "Depo partiyası çatmır" });
  }
}

function summarizeProductCosts(db, purchaseLots, depotLots) {
  for (const product of db.products ?? []) {
    const bonded = purchaseLots.filter((lot) => lot.productId === Number(product.id) && lot.remainingBondedQty > EPSILON);
    const depot = depotLots.filter((lot) => lot.productId === Number(product.id) && lot.remainingQty > EPSILON);
    const bondedQty = bonded.reduce((sum, lot) => sum + lot.remainingBondedQty, 0);
    const depotQty = depot.reduce((sum, lot) => sum + lot.remainingQty, 0);
    const value = bonded.reduce((sum, lot) => sum + lot.remainingBondedQty * lot.currentBondedUnitCost, 0)
      + depot.reduce((sum, lot) => sum + lot.remainingQty * lot.currentUnitCost, 0);
    const qty = bondedQty + depotQty;
    product.lotCostSummary = {
      bondedQty: round(bondedQty, 4),
      depotQty: round(depotQty, 4),
      totalQty: round(qty, 4),
      totalValue: round(value, 4),
      weightedUnitCost: qty > EPSILON ? round(value / qty) : null,
      purchaseLotCount: bonded.length,
      depotLotCount: depot.length,
    };
    if (qty > EPSILON) product.cost = round(value / qty);
  }
}

function previousLineCosts(db) {
  const values = new Map();
  for (const document of db.documents ?? []) {
    for (const [index, line] of (document.lines ?? []).entries()) {
      if (document.type !== "sale") continue;
      values.set(`${document.id}:${index}`, {
        unitCost: line.unitCost,
        costTotal: line.costTotal,
        grossProfit: line.grossProfit,
      });
    }
  }
  return values;
}

function collectRecalculationChanges(db, before) {
  const changes = [];
  for (const document of db.documents ?? []) {
    for (const [index, line] of (document.lines ?? []).entries()) {
      if (document.type !== "sale") continue;
      const previous = before.get(`${document.id}:${index}`);
      if (!previous || line.costSource == null) continue;
      if (round(previous.unitCost) === round(line.unitCost) && round(previous.costTotal, 4) === round(line.costTotal, 4)) continue;
      changes.push({
        documentId: document.id,
        lineIndex: index,
        productId: Number(line.productId),
        oldUnitCost: previous.unitCost ?? null,
        newUnitCost: line.unitCost ?? null,
        oldCostTotal: previous.costTotal ?? null,
        newCostTotal: line.costTotal ?? null,
        oldGrossProfit: previous.grossProfit ?? null,
        newGrossProfit: line.grossProfit ?? null,
      });
    }
  }
  return changes;
}

export function rebuildLotAccounting(db, options = {}) {
  const before = previousLineCosts(db);
  const purchaseLots = [];
  const depotLots = [];
  const costEvents = [];
  const unresolved = [];
  const rollIndex = new Map();
  const documentsById = new Map((db.documents ?? []).map((document) => [String(document.id), document]));
  const documents = (db.documents ?? [])
    .map((document, index) => ({ document, index }))
    .filter(({ document }) => document.posted !== false)
    .sort((a, b) => eventTimestamp(a.document) - eventTimestamp(b.document)
      || String(a.document.createdAt ?? "").localeCompare(String(b.document.createdAt ?? ""))
      || b.index - a.index);

  for (const document of db.documents ?? []) {
    for (const line of document.lines ?? []) {
      delete line.lotAllocations;
      delete line.costSource;
      delete line.costCalculatedAt;
      delete line.costStatus;
    }
  }

  for (const { document } of documents) {
    if (document.type === "purchase") {
      addPurchaseLots(document, purchaseLots, depotLots, rollIndex);
      continue;
    }
    if (document.type === "cashOut" && document.costLink?.enabled) {
      const targetMovement = movementTargetId(document);
      const targetDocument = targetMovement ? documentsById.get(targetMovement) : null;
      const applied = targetDocument?.type === "movement"
        ? applyMovementCostDocument(document, depotLots, costEvents)
        : applyPurchaseCostDocument(document, purchaseLots, costEvents);
      if (!applied) unresolved.push({ documentId: document.id, type: document.type, reason: "Maya xərci üçün tarixdə uyğun qalıq tapılmadı" });
      continue;
    }
    if (document.type === "movement" && document.movementSelection?.containers?.length) {
      applyBondedExit(document, purchaseLots, depotLots, rollIndex, unresolved);
      continue;
    }
    if (document.type === "sale" && (document.saleMode === "export" || document.exportMode)) {
      applyBondedExit(document, purchaseLots, depotLots, rollIndex, unresolved);
      continue;
    }
    if (document.type === "sale") applyRegularSale(document, depotLots, unresolved);
  }

  summarizeProductCosts(db, purchaseLots, depotLots);
  db.purchaseLots = purchaseLots;
  db.depotLots = depotLots;
  db.lotCostEvents = costEvents;
  db.lotAccountingSummary = {
    recalculatedAt: new Date().toISOString(),
    purchaseLotCount: purchaseLots.length,
    depotLotCount: depotLots.length,
    costEventCount: costEvents.length,
    unresolved,
  };

  const changes = collectRecalculationChanges(db, before);
  if (options.recordAudit !== false && changes.length > 0) {
    db.lotRecalculations ??= [];
    db.lotRecalculations.unshift({
      id: randomUUID(),
      sourceDocumentId: options.sourceDocumentId ?? null,
      reason: options.reason ?? "Partiya mayası yenidən hesablandı",
      effectiveFrom: options.effectiveFrom ?? null,
      recalculatedAt: new Date().toISOString(),
      changes,
    });
    db.lotRecalculations = db.lotRecalculations.slice(0, 1000);
  }
  return { purchaseLots, depotLots, costEvents, unresolved, changes };
}

export function lotAccountingForProduct(db, productId) {
  const id = Number(productId);
  const purchaseLots = (db.purchaseLots ?? []).filter((lot) => Number(lot.productId) === id);
  const depotLots = (db.depotLots ?? []).filter((lot) => Number(lot.productId) === id);
  const costEvents = (db.lotCostEvents ?? []).filter((event) => Number(event.productId) === id);
  const recalculations = (db.lotRecalculations ?? []).filter((entry) =>
    (entry.changes ?? []).some((change) => Number(change.productId) === id)
  );
  return { purchaseLots, depotLots, costEvents, recalculations };
}
