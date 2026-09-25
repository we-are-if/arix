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

function actorName(document) {
  const actor = document.createdByName ?? document.employeeName ?? document.employee ?? document.createdBy;
  if (actor && typeof actor === "object") return String(actor.name ?? actor.fullName ?? "Sistem");
  return String(actor ?? "Arif Mahmud");
}

function documentKind(document) {
  if (document.type === "sale" && (document.saleMode === "export" || document.exportMode)) return ["export", "İxrac"];
  const kinds = {
    purchase: ["purchase", "Alış"],
    sale: ["sale", "Satış"],
    movement: ["movement", "Yerdəyişmə"],
    saleReturn: ["saleReturn", "Satış qaytarması"],
    purchaseReturn: ["purchaseReturn", "Alış qaytarması"],
    openingBalance: ["openingBalance", "Əvvələ qalıq"],
    writeOff: ["writeOff", "Silinmə"],
    inventory: ["inventory", "İnventarlaşdırma"],
  };
  return kinds[document.type] ?? [String(document.type ?? "document"), "Sənəd"];
}

function documentCode(document) {
  const code = document.number ?? document.documentNumber ?? document.serialNumber ?? document.fiscalNumber;
  return code ? String(code) : String(document.id ?? "").slice(0, 8);
}

function stockEffect(type, qty) {
  if (["purchase", "saleReturn", "openingBalance"].includes(type)) return { delta: qty, inQty: qty, outQty: 0 };
  if (["sale", "purchaseReturn", "writeOff"].includes(type)) return { delta: -qty, inQty: 0, outQty: qty };
  if (type === "movement") return { delta: 0, inQty: qty, outQty: qty };
  return { delta: 0, inQty: 0, outQty: 0 };
}

function accountLabel(document, line) {
  if (document.type === "movement") {
    return `${document.fromAccount ?? document.account ?? "Antrepo"} → ${document.toAccount ?? "Depo"}`;
  }
  if (document.type === "sale" && line.costSource === "bonded-lot") return "Antrepo";
  if (document.type === "purchase" && document.bondedStock?.containers?.length) return "Antrepo";
  return String(document.account ?? document.fromAccount ?? document.toAccount ?? "—");
}

function groupCostEvents(db, productId) {
  const groups = new Map();
  for (const event of db.lotCostEvents ?? []) {
    if (Number(event.productId) !== Number(productId)) continue;
    const key = String(event.sourceDocumentId);
    const group = groups.get(key) ?? { events: [], sourceDocumentId: key };
    group.events.push(event);
    groups.set(key, group);
  }
  return groups;
}

export function buildProductLedger(db, productId) {
  const id = Number(productId);
  const product = (db.products ?? []).find((item) => Number(item.id) === id);
  if (!product) return { entries: [], summary: { currentBalance: 0, openingBalance: 0, inQty: 0, outQty: 0 } };

  const rows = [];
  const documentsById = new Map((db.documents ?? []).map((document) => [String(document.id), document]));
  for (const document of db.documents ?? []) {
    if (document.posted === false) continue;
    for (const [lineIndex, line] of (document.lines ?? []).entries()) {
      if (Number(line.productId) !== id) continue;
      const qty = Math.max(0, numberValue(line.qty));
      const effect = stockEffect(String(document.type ?? ""), qty);
      const [kind, label] = documentKind(document);
      rows.push({
        id: `${document.id}:${lineIndex}`,
        documentId: String(document.id ?? ""),
        documentCode: documentCode(document),
        kind,
        label,
        effectiveAt: effectiveAt(document),
        account: accountLabel(document, line),
        fromAccount: document.fromAccount ?? null,
        toAccount: document.toAccount ?? null,
        counterparty: String(document.counterpartyName ?? ""),
        employee: actorName(document),
        qty: round(qty),
        inQty: round(effect.inQty),
        outQty: round(effect.outQty),
        delta: round(effect.delta),
        unitCost: line.unitCost == null ? null : round(line.unitCost, 6),
        price: line.price == null ? null : round(line.price, 6),
        total: line.total == null ? null : round(line.total),
        costTotal: line.costTotal == null ? null : round(line.costTotal),
        grossProfit: line.grossProfit == null ? null : round(line.grossProfit),
        description: String(document.comment ?? ""),
        priority: 1,
      });
    }
  }

  for (const group of groupCostEvents(db, id).values()) {
    const sourceDocument = documentsById.get(group.sourceDocumentId) ?? {};
    const totalBalance = group.events.reduce((sum, event) => sum + numberValue(event.balanceQty), 0);
    const weightedCost = totalBalance > EPSILON
      ? group.events.reduce((sum, event) => sum + numberValue(event.unitCostAfter) * numberValue(event.balanceQty), 0) / totalBalance
      : null;
    const isDepot = group.events.every((event) => event.type === "depotCost");
    rows.push({
      id: `cost:${group.sourceDocumentId}`,
      documentId: group.sourceDocumentId,
      documentCode: documentCode(sourceDocument),
      kind: isDepot ? "depotCost" : "bondedCost",
      label: isDepot ? "Depoya düşüm xərci" : "Antrepo xərci",
      effectiveAt: effectiveAt(sourceDocument),
      account: isDepot ? "Depo" : "Antrepo",
      fromAccount: null,
      toAccount: null,
      counterparty: String(sourceDocument.counterpartyName ?? ""),
      employee: actorName(sourceDocument),
      qty: 0,
      inQty: 0,
      outQty: 0,
      delta: 0,
      unitCost: weightedCost == null ? null : round(weightedCost, 6),
      price: null,
      total: round(group.events.reduce((sum, event) => sum + numberValue(event.amount), 0)),
      costTotal: null,
      grossProfit: null,
      description: group.events.map((event) => event.label).filter(Boolean).join(", "),
      priority: 2,
    });
  }

  rows.sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt) || a.priority - b.priority || a.id.localeCompare(b.id));
  const warehouseValues = product.warehouses && typeof product.warehouses === "object"
    ? Object.values(product.warehouses)
    : null;
  const currentBalance = warehouseValues
    ? warehouseValues.reduce((sum, value) => sum + numberValue(value), 0)
    : numberValue(product.antrepo) + numberValue(product.depo);
  const totalDelta = rows.reduce((sum, row) => sum + row.delta, 0);
  const openingBalance = round(currentBalance - totalDelta);
  let balance = openingBalance;
  for (const row of rows) {
    balance = round(balance + row.delta);
    row.balance = balance;
    delete row.priority;
  }

  return {
    entries: rows.reverse(),
    summary: {
      currentBalance: round(currentBalance),
      openingBalance,
      inQty: round(rows.reduce((sum, row) => sum + row.inQty, 0)),
      outQty: round(rows.reduce((sum, row) => sum + row.outQty, 0)),
    },
  };
}
