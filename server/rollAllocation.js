const EPSILON = 0.000001;

function numberValue(value) {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 4) {
  return Number(numberValue(value).toFixed(digits));
}

function effectiveAt(document) {
  return String(document.documentDate ?? document.createdAt ?? new Date(0).toISOString());
}

function isDepot(value) {
  return String(value ?? "").toLowerCase().includes("depo");
}

function selectedRolls(document) {
  return (document.movementSelection?.containers ?? []).flatMap((container) =>
    (container.pallets ?? []).flatMap((pallet) =>
      (pallet.rolls ?? []).map((roll) => ({
        rollId: String(roll.rollId ?? roll.id ?? ""),
        rollNo: String(roll.rollNo ?? roll.rollId ?? roll.id ?? "Rulo"),
        productId: Number(roll.productId),
        qty: numberValue(roll.qty),
        containerNumber: String(roll.containerNumber ?? container.number ?? ""),
        palletId: String(roll.palletId ?? pallet.id ?? ""),
        palletNumber: String(roll.palletNumber ?? pallet.number ?? ""),
        purchaseDocumentId: String(roll.sourceDocumentId ?? container.documentId ?? ""),
      }))
    )
  );
}

function purchaseRolls(document) {
  return (document.bondedStock?.containers ?? []).flatMap((container) =>
    (container.pallets ?? []).flatMap((pallet) =>
      (pallet.rolls ?? []).map((roll) => ({
        rollId: String(roll.id ?? roll.rollId ?? ""),
        rollNo: String(roll.rollNo ?? roll.id ?? "Rulo"),
        productId: Number(roll.productId),
        qty: numberValue(roll.qty),
        containerNumber: String(container.number ?? ""),
        palletId: String(pallet.id ?? ""),
        palletNumber: String(pallet.number ?? ""),
        purchaseDocumentId: String(document.id ?? ""),
      }))
    )
  );
}

function addInboundRoll(inventory, roll, document) {
  if (!roll.rollId || !roll.productId || roll.qty <= EPSILON || inventory.has(roll.rollId)) return;
  inventory.set(roll.rollId, {
    ...roll,
    sourceDocumentId: String(document.id ?? ""),
    receivedAt: effectiveAt(document),
    initialQty: round(roll.qty),
    remainingQty: round(roll.qty),
  });
}

function allocationCandidates(inventory, productId) {
  return Array.from(inventory.values()).filter((roll) =>
    roll.productId === Number(productId) && roll.remainingQty > EPSILON
  );
}

function compareOldest(a, b) {
  return a.receivedAt.localeCompare(b.receivedAt) || a.rollId.localeCompare(b.rollId);
}

function chooseRoll(candidates, requiredQty) {
  const exact = candidates
    .filter((roll) => Math.abs(roll.remainingQty - requiredQty) <= EPSILON)
    .sort(compareOldest)[0];
  if (exact) return exact;

  const open = candidates.filter((roll) => roll.remainingQty < roll.initialQty - EPSILON);
  if (open.length > 0) {
    return open.sort((a, b) => {
      const aFits = a.remainingQty >= requiredQty;
      const bFits = b.remainingQty >= requiredQty;
      if (aFits !== bFits) return aFits ? -1 : 1;
      if (aFits) return a.remainingQty - b.remainingQty || compareOldest(a, b);
      return b.remainingQty - a.remainingQty || compareOldest(a, b);
    })[0];
  }

  return candidates.sort((a, b) => {
    const aFits = a.remainingQty >= requiredQty;
    const bFits = b.remainingQty >= requiredQty;
    if (aFits !== bFits) return aFits ? -1 : 1;
    if (aFits) return a.remainingQty - b.remainingQty || compareOldest(a, b);
    return b.remainingQty - a.remainingQty || compareOldest(a, b);
  })[0];
}

function allocateLines(inventory, lines) {
  const allocations = [];
  const lineResults = [];

  for (const line of lines) {
    const productId = Number(line.productId);
    const requestedQty = Math.max(0, numberValue(line.qty));
    let remaining = requestedQty;
    const lineAllocations = [];

    while (remaining > EPSILON) {
      const roll = chooseRoll(allocationCandidates(inventory, productId), remaining);
      if (!roll) break;
      const beforeQty = roll.remainingQty;
      const consumedQty = Math.min(beforeQty, remaining);
      roll.remainingQty = round(beforeQty - consumedQty);
      remaining = round(remaining - consumedQty);
      const allocation = {
        rollId: roll.rollId,
        rollNo: roll.rollNo,
        productId,
        qty: round(consumedQty),
        initialQty: roll.initialQty,
        beforeQty: round(beforeQty),
        remainingQty: roll.remainingQty,
        opened: beforeQty >= roll.initialQty - EPSILON && roll.remainingQty > EPSILON,
        receivedAt: roll.receivedAt,
        sourceDocumentId: roll.sourceDocumentId,
        purchaseDocumentId: roll.purchaseDocumentId,
        containerNumber: roll.containerNumber,
        palletId: roll.palletId,
        palletNumber: roll.palletNumber,
      };
      allocations.push(allocation);
      lineAllocations.push(allocation);
    }

    const selectedQty = round(lineAllocations.reduce((sum, item) => sum + item.qty, 0));
    lineResults.push({
      productId,
      name: String(line.name ?? ""),
      requestedQty: round(requestedQty),
      selectedQty,
      shortageQty: round(Math.max(0, requestedQty - selectedQty)),
      rollCount: lineAllocations.length,
      complete: selectedQty + EPSILON >= requestedQty,
    });
  }

  return {
    automatic: true,
    strategy: "exact-open-fifo",
    calculatedAt: new Date().toISOString(),
    allocations,
    lines: lineResults,
    requestedQty: round(lineResults.reduce((sum, line) => sum + line.requestedQty, 0)),
    selectedQty: round(lineResults.reduce((sum, line) => sum + line.selectedQty, 0)),
    rollCount: allocations.length,
    incomplete: lineResults.some((line) => !line.complete),
  };
}

function applySavedSale(inventory, document) {
  const allocations = Array.isArray(document.rollSelection?.allocations)
    ? document.rollSelection.allocations
    : [];
  if (allocations.length > 0) {
    for (const allocation of allocations) {
      const roll = inventory.get(String(allocation.rollId ?? ""));
      if (!roll || roll.productId !== Number(allocation.productId)) continue;
      roll.remainingQty = round(Math.max(0, roll.remainingQty - numberValue(allocation.qty)));
    }
    return;
  }
  allocateLines(inventory, document.lines ?? []);
}

export function buildDepotRollInventory(db, options = {}) {
  const excludeDocumentId = String(options.excludeDocumentId ?? "");
  const inventory = new Map();
  const documents = (db.documents ?? [])
    .filter((document) => document.posted !== false && String(document.id ?? "") !== excludeDocumentId)
    .slice()
    .sort((a, b) => effectiveAt(a).localeCompare(effectiveAt(b)) || String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));

  for (const document of documents) {
    if (document.type === "purchase" && isDepot(document.bondedStock?.destination ?? document.account)) {
      for (const roll of purchaseRolls(document)) addInboundRoll(inventory, roll, document);
      continue;
    }
    if (document.type === "movement" && isDepot(document.toAccount)) {
      for (const roll of selectedRolls(document)) addInboundRoll(inventory, roll, document);
      continue;
    }
    if (document.type === "sale" && document.saleMode !== "export" && !document.exportMode) {
      applySavedSale(inventory, document);
    }
  }
  return Array.from(inventory.values()).sort(compareOldest);
}

export function createAutomaticSaleRollSelection(db, body = {}) {
  const inventoryRows = buildDepotRollInventory(db, { excludeDocumentId: body.currentDocumentId });
  const inventory = new Map(inventoryRows.map((roll) => [roll.rollId, { ...roll }]));
  const lines = (Array.isArray(body.lines) ? body.lines : [])
    .map((line) => ({
      productId: Number(line.productId),
      name: String(line.name ?? ""),
      qty: numberValue(line.qty),
    }))
    .filter((line) => line.productId && line.qty > EPSILON);
  return allocateLines(inventory, lines);
}

export function validateAutomaticSaleRollSelection(db, document) {
  const trackedLines = (document.lines ?? []).filter((line) => {
    const product = (db.products ?? []).find((item) => Number(item.id) === Number(line.productId));
    return product && product.type !== "service";
  });
  const expected = createAutomaticSaleRollSelection(db, {
    currentDocumentId: document.id,
    lines: trackedLines,
  });
  if (expected.incomplete) {
    const line = expected.lines.find((item) => !item.complete);
    return { ok: false, error: `${line?.name || "Məhsul"} üçün rulo stoku çatmır: ${line?.shortageQty ?? 0}` };
  }
  return { ok: true, selection: expected };
}
