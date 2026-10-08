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

function resolveStore(db, value) {
  const text = String(value ?? "").trim().toLocaleLowerCase();
  return (db.stores ?? []).find((store) =>
    String(store.key ?? "").trim().toLocaleLowerCase() === text
    || String(store.name ?? "").trim().toLocaleLowerCase() === text
  );
}

function storeKey(db, value) {
  const text = String(value ?? "").trim().toLocaleLowerCase();
  const store = resolveStore(db, value);
  if (store) return String(store.key);
  if (text.includes("antrepo")) return "antrepo";
  if (text.includes("depo") || !text) return "depo";
  return text;
}

function isBondedStore(db, value) {
  const store = resolveStore(db, value);
  if (store) return store.isBonded === true;
  return String(value ?? "").toLocaleLowerCase().includes("antrepo");
}

function matchesAccount(db, value, account) {
  return !account || storeKey(db, value) === storeKey(db, account);
}

function normalizeDeliveryMode(value, fallback = "singlePiece") {
  return ["fullRoll", "singlePiece", "customCuts", "flexible"].includes(value) ? value : fallback;
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
    opened: false,
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

function chooseFittingRoll(candidates, requiredQty) {
  const fitting = candidates.filter((roll) => roll.remainingQty + EPSILON >= requiredQty);
  const exact = fitting
    .filter((roll) => Math.abs(roll.remainingQty - requiredQty) <= EPSILON)
    .sort(compareOldest)[0];
  if (exact) return exact;
  const open = fitting.filter((roll) => roll.opened);
  if (open.length > 0) return open.sort((a, b) => a.remainingQty - b.remainingQty || compareOldest(a, b))[0];
  return fitting.sort((a, b) => a.remainingQty - b.remainingQty || compareOldest(a, b))[0];
}

function chooseFlexibleRoll(candidates, requiredQty) {
  const fitting = chooseFittingRoll(candidates, requiredQty);
  if (fitting) return fitting;
  const open = candidates.filter((roll) => roll.opened);
  if (open.length > 0) return open.sort((a, b) => b.remainingQty - a.remainingQty || compareOldest(a, b))[0];
  return candidates.sort((a, b) => b.remainingQty - a.remainingQty || compareOldest(a, b))[0];
}

function selectExactFullRolls(candidates, requestedQty) {
  const rolls = candidates.filter((roll) => !roll.opened).sort(compareOldest);
  const states = new Map([["0.0000", []]]);
  for (const roll of rolls) {
    const snapshot = Array.from(states.entries());
    for (const [sumKey, selected] of snapshot) {
      const nextSum = round(numberValue(sumKey) + roll.remainingQty);
      if (nextSum > requestedQty + EPSILON) continue;
      const nextKey = nextSum.toFixed(4);
      if (!states.has(nextKey)) states.set(nextKey, [...selected, roll]);
      if (Math.abs(nextSum - requestedQty) <= EPSILON) return states.get(nextKey);
    }
    if (states.size > 10000) break;
  }
  return [];
}

function consumeRoll(roll, qty, metadata = {}) {
  const beforeQty = roll.remainingQty;
  const wasOpen = roll.opened;
  const consumedQty = Math.min(beforeQty, qty);
  roll.remainingQty = round(beforeQty - consumedQty);
  if (consumedQty > EPSILON && roll.remainingQty > EPSILON) roll.opened = true;
  return {
    rollId: roll.rollId,
    rollNo: roll.rollNo,
    productId: roll.productId,
    qty: round(consumedQty),
    initialQty: roll.initialQty,
    beforeQty: round(beforeQty),
    remainingQty: roll.remainingQty,
    wasOpen,
    opened: roll.opened,
    receivedAt: roll.receivedAt,
    sourceDocumentId: roll.sourceDocumentId,
    purchaseDocumentId: roll.purchaseDocumentId,
    containerNumber: roll.containerNumber,
    palletId: roll.palletId,
    palletNumber: roll.palletNumber,
    ...metadata,
  };
}

function applyMeasurementAdjustments(inventory, measurements) {
  const normalized = [];
  const seen = new Set();
  for (const measurement of Array.isArray(measurements) ? measurements : []) {
    const rollId = String(measurement.rollId ?? "");
    const roll = inventory.get(rollId);
    if (!roll || seen.has(rollId)) continue;
    const actualQty = Math.max(0, round(measurement.actualQty));
    const previousQty = round(roll.remainingQty);
    roll.remainingQty = actualQty;
    seen.add(rollId);
    normalized.push({
      rollId,
      rollNo: roll.rollNo,
      productId: roll.productId,
      previousQty,
      actualQty,
      variance: round(actualQty - previousQty),
      reason: String(measurement.reason || "manual-measurement"),
      measuredAt: String(measurement.measuredAt || new Date().toISOString()),
    });
  }
  return normalized;
}

function linePlan(line, defaultMode) {
  const requestedQty = Math.max(0, round(line.qty));
  const deliveryMode = normalizeDeliveryMode(line.deliveryMode, defaultMode);
  const cutLengths = (Array.isArray(line.cutLengths) ? line.cutLengths : [])
    .map((value) => Math.max(0, round(value)))
    .filter((value) => value > EPSILON);
  if (deliveryMode === "customCuts") {
    const cutTotal = round(cutLengths.reduce((sum, value) => sum + value, 0));
    if (cutLengths.length === 0) return { requestedQty, deliveryMode, cutLengths, planError: "Ən az bir parça ölçüsü əlavə et" };
    if (Math.abs(cutTotal - requestedQty) > EPSILON) {
      return { requestedQty, deliveryMode, cutLengths, planError: `Parçaların cəmi ${cutTotal} mt-dir, tələb ${requestedQty} mt` };
    }
  }
  return { requestedQty, deliveryMode, cutLengths, planError: "" };
}

function allocateLines(inventory, lines, options = {}) {
  const allocations = [];
  const lineResults = [];
  const defaultMode = options.defaultMode ?? "singlePiece";

  for (const line of lines) {
    const productId = Number(line.productId);
    const plan = linePlan(line, defaultMode);
    const lineAllocations = [];

    if (!plan.planError && plan.deliveryMode === "fullRoll") {
      const rolls = selectExactFullRolls(allocationCandidates(inventory, productId), plan.requestedQty);
      for (const roll of rolls) lineAllocations.push(consumeRoll(roll, roll.remainingQty, { deliveryMode: plan.deliveryMode }));
    } else if (!plan.planError && plan.deliveryMode === "singlePiece") {
      const roll = chooseFittingRoll(allocationCandidates(inventory, productId), plan.requestedQty);
      if (roll) lineAllocations.push(consumeRoll(roll, plan.requestedQty, { deliveryMode: plan.deliveryMode, pieceIndex: 0, pieceQty: plan.requestedQty }));
    } else if (!plan.planError && plan.deliveryMode === "customCuts") {
      const indexedCuts = plan.cutLengths
        .map((qty, index) => ({ qty, index }))
        .sort((a, b) => b.qty - a.qty || a.index - b.index);
      for (const cut of indexedCuts) {
        const roll = chooseFittingRoll(allocationCandidates(inventory, productId), cut.qty);
        if (!roll) continue;
        lineAllocations.push(consumeRoll(roll, cut.qty, { deliveryMode: plan.deliveryMode, pieceIndex: cut.index, pieceQty: cut.qty }));
      }
      lineAllocations.sort((a, b) => a.pieceIndex - b.pieceIndex);
    } else if (!plan.planError) {
      let remaining = plan.requestedQty;
      while (remaining > EPSILON) {
        const roll = chooseFlexibleRoll(allocationCandidates(inventory, productId), remaining);
        if (!roll) break;
        const allocation = consumeRoll(roll, Math.min(roll.remainingQty, remaining), { deliveryMode: "flexible" });
        remaining = round(remaining - allocation.qty);
        lineAllocations.push(allocation);
      }
    }

    allocations.push(...lineAllocations);
    const selectedQty = round(lineAllocations.reduce((sum, item) => sum + item.qty, 0));
    const selectedPieceIndexes = new Set(lineAllocations.map((item) => item.pieceIndex).filter((value) => Number.isInteger(value)));
    const complete = !plan.planError
      && selectedQty + EPSILON >= plan.requestedQty
      && (plan.deliveryMode !== "customCuts" || selectedPieceIndexes.size === plan.cutLengths.length);
    lineResults.push({
      productId,
      name: String(line.name ?? ""),
      requestedQty: plan.requestedQty,
      selectedQty,
      shortageQty: round(Math.max(0, plan.requestedQty - selectedQty)),
      rollCount: new Set(lineAllocations.map((item) => item.rollId)).size,
      deliveryMode: plan.deliveryMode,
      cutLengths: plan.cutLengths,
      planError: plan.planError,
      complete,
    });
  }

  return {
    automatic: true,
    strategy: "delivery-plan-best-fit",
    calculatedAt: new Date().toISOString(),
    allocations,
    lines: lineResults,
    requestedQty: round(lineResults.reduce((sum, line) => sum + line.requestedQty, 0)),
    selectedQty: round(lineResults.reduce((sum, line) => sum + line.selectedQty, 0)),
    rollCount: new Set(allocations.map((item) => item.rollId)).size,
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
      const consumedQty = Math.min(roll.remainingQty, numberValue(allocation.qty));
      roll.remainingQty = round(Math.max(0, roll.remainingQty - consumedQty));
      if (consumedQty > EPSILON && roll.remainingQty > EPSILON) roll.opened = true;
    }
    return;
  }
  allocateLines(inventory, document.lines ?? [], { defaultMode: "flexible" });
}

export function buildDepotRollInventory(db, options = {}) {
  const excludeDocumentId = String(options.excludeDocumentId ?? "");
  const account = String(options.account ?? "").trim();
  const inventory = new Map();
  const documents = (db.documents ?? [])
    .filter((document) => document.posted !== false && String(document.id ?? "") !== excludeDocumentId)
    .slice()
    .sort((a, b) => effectiveAt(a).localeCompare(effectiveAt(b)) || String(a.createdAt ?? "").localeCompare(String(b.createdAt ?? "")));

  for (const document of documents) {
    const destination = document.bondedStock?.destination ?? document.account;
    if (document.type === "purchase" && !isBondedStore(db, destination) && matchesAccount(db, destination, account)) {
      for (const roll of purchaseRolls(document)) addInboundRoll(inventory, roll, document);
      continue;
    }
    if (document.type === "movement" && !isBondedStore(db, document.toAccount) && matchesAccount(db, document.toAccount, account)) {
      for (const roll of selectedRolls(document)) addInboundRoll(inventory, roll, document);
      continue;
    }
    if (document.type === "sale" && document.saleMode !== "export" && !document.exportMode && matchesAccount(db, document.account, account)) {
      applyMeasurementAdjustments(inventory, document.rollMeasurements);
      applySavedSale(inventory, document);
    }
  }
  return Array.from(inventory.values()).sort(compareOldest);
}

export function createAutomaticSaleRollSelection(db, body = {}) {
  const inventoryRows = buildDepotRollInventory(db, {
    excludeDocumentId: body.currentDocumentId,
    account: body.account,
  });
  const inventory = new Map(inventoryRows.map((roll) => [roll.rollId, { ...roll }]));
  const measurements = applyMeasurementAdjustments(inventory, body.rollMeasurements);
  const lines = (Array.isArray(body.lines) ? body.lines : [])
    .map((line) => ({
      productId: Number(line.productId),
      name: String(line.name ?? ""),
      qty: numberValue(line.qty),
      deliveryMode: line.deliveryMode,
      cutLengths: line.cutLengths,
    }))
    .filter((line) => line.productId && line.qty > EPSILON);
  return { ...allocateLines(inventory, lines), measurements };
}

export function validateAutomaticSaleRollSelection(db, document) {
  const trackedLines = (document.lines ?? []).filter((line) => {
    const product = (db.products ?? []).find((item) => Number(item.id) === Number(line.productId));
    return product && product.type !== "service";
  });
  const expected = createAutomaticSaleRollSelection(db, {
    currentDocumentId: document.id,
    account: document.account,
    lines: trackedLines,
    rollMeasurements: document.rollMeasurements,
  });
  if (expected.incomplete) {
    const line = expected.lines.find((item) => !item.complete);
    return { ok: false, error: line?.planError || `${line?.name || "Məhsul"} üçün uyğun rulo stoku çatmır: ${line?.shortageQty ?? 0}` };
  }
  return { ok: true, selection: expected, measurements: expected.measurements };
}
