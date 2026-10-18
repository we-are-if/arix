import { randomUUID } from "node:crypto";

const clean = (value, max = 240) => String(value ?? "").trim().slice(0, max);
const folded = (value) => clean(value).toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
const digits = (value) => clean(value, 80).replace(/\D/g, "");
const amountValue = (value) => Math.round((Math.abs(Number(value) || 0) + Number.EPSILON) * 100) / 100;
const ibanValue = (value) => clean(value, 64).replace(/\s/g, "").toUpperCase();

export function normalizeReconciliationStore(db) {
  db.financialAccounts = Array.isArray(db.financialAccounts) ? db.financialAccounts : [];
  db.companyCards = Array.isArray(db.companyCards) ? db.companyCards : [];
  db.cardTransactions = Array.isArray(db.cardTransactions) ? db.cardTransactions : [];
  db.paymentRoutingRules = Array.isArray(db.paymentRoutingRules) ? db.paymentRoutingRules : [];
  db.paymentSettlements = Array.isArray(db.paymentSettlements) ? db.paymentSettlements : [];
  db.bankTransactions = Array.isArray(db.bankTransactions) ? db.bankTransactions : [];
  db.bankImportBatches = Array.isArray(db.bankImportBatches) ? db.bankImportBatches : [];
  db.bankMatchRules = Array.isArray(db.bankMatchRules) ? db.bankMatchRules : [];
  return db;
}

export function createCompanyCard(db, financialAccountId, source = {}) {
  normalizeReconciliationStore(db);
  const account = db.financialAccounts.find((item) => item.id === clean(financialAccountId) && item.status !== "inactive");
  if (!account || account.type !== "bank") throw new Error("Kart yalnızca aktif bir banka hesabına bağlanabilir.");
  const name = clean(source.name, 120);
  const lastFour = digits(source.lastFour).slice(-4);
  if (!name) throw new Error("Kart adı zorunludur.");
  if (lastFour.length !== 4) throw new Error("Kartın son dört hanesi zorunludur.");
  const duplicate = db.companyCards.some((item) => item.financialAccountId === account.id && item.lastFour === lastFour && item.status !== "inactive");
  if (duplicate) throw new Error("Bu hesabın altında aynı son dört haneye sahip aktif kart bulunuyor.");
  const now = new Date().toISOString();
  const card = {
    id: randomUUID(),
    financialAccountId: account.id,
    financialAccountName: account.name,
    name,
    kind: ["credit", "debit", "prepaid", "virtual"].includes(source.kind) ? source.kind : "credit",
    lastFour,
    holderName: clean(source.holderName, 140),
    network: clean(source.network, 40),
    currency: clean(source.currency || account.currency, 3).toUpperCase(),
    creditLimit: amountValue(source.creditLimit),
    statementDay: Math.min(31, Math.max(0, Number(source.statementDay) || 0)),
    paymentDay: Math.min(31, Math.max(0, Number(source.paymentDay) || 0)),
    status: source.status === "inactive" ? "inactive" : "active",
    createdAt: now,
    updatedAt: now,
  };
  db.companyCards.unshift(card);
  return card;
}

function normalizeCardTransaction(card, source = {}) {
  const externalId = clean(source.externalId || source.transactionId || source.id, 160);
  if (!externalId) throw new Error("Kart işlem numarası zorunludur.");
  const signedAmount = Number(source.amount || source.total) || 0;
  const direction = source.direction === "refund" || signedAmount < 0 ? "refund" : "expense";
  const amount = amountValue(signedAmount);
  if (amount <= 0) throw new Error(`${externalId} kart hareketinin tutarı geçersiz.`);
  const transactionAt = new Date(source.transactionAt || source.date || Date.now()).toISOString();
  return {
    externalId,
    uniqueKey: `${card.id}:${externalId}`,
    cardId: card.id,
    financialAccountId: card.financialAccountId,
    direction,
    amount,
    currency: clean(source.currency || card.currency, 3).toUpperCase(),
    transactionAt,
    postedAt: source.postedAt ? new Date(source.postedAt).toISOString() : transactionAt,
    merchantName: clean(source.merchantName || source.counterpartyName, 200),
    merchantTaxId: digits(source.merchantTaxId || source.taxId || source.vkn),
    description: clean(source.description || source.explanation, 500),
    installmentCount: Math.max(1, Number(source.installmentCount) || 1),
    statementReference: clean(source.statementReference, 160),
  };
}

export function importCardTransactions(db, cardId, transactions = []) {
  normalizeReconciliationStore(db);
  const card = db.companyCards.find((item) => item.id === clean(cardId) && item.status !== "inactive");
  if (!card) throw new Error("Şirket kartı bulunamadı.");
  if (!Array.isArray(transactions) || !transactions.length) throw new Error("İçe aktarılacak kart hareketi bulunamadı.");
  const result = { created: [], duplicates: [] };
  for (const source of transactions) {
    const incoming = normalizeCardTransaction(card, source);
    const duplicate = db.cardTransactions.find((item) => item.uniqueKey === incoming.uniqueKey);
    if (duplicate) {
      result.duplicates.push(duplicate);
      continue;
    }
    const now = new Date().toISOString();
    const transaction = {
      id: randomUUID(),
      ...incoming,
      status: "invoice_unmatched",
      invoiceId: null,
      createdAt: now,
      updatedAt: now,
    };
    db.cardTransactions.unshift(transaction);
    result.created.push(transaction);
  }
  return result;
}

export function financialAccountDetails(db, financialAccountId) {
  normalizeReconciliationStore(db);
  const account = db.financialAccounts.find((item) => item.id === clean(financialAccountId));
  if (!account) throw new Error("Şirket hesabı bulunamadı.");
  const cards = db.companyCards
    .filter((item) => item.financialAccountId === account.id)
    .map((card) => ({
      ...card,
      transactions: db.cardTransactions.filter((transaction) => transaction.cardId === card.id),
    }));
  const virtualPos = db.paymentRoutingRules
    .filter((rule) => rule.financialAccountId === account.id)
    .map((rule) => {
      const connection = db.onlineCollections?.providerConnections?.find((item) => item.id === rule.connectionId);
      const settlements = db.paymentSettlements.filter((settlement) => settlement.financialAccountId === account.id
        && settlement.providerId === rule.providerId
        && (!rule.connectionId || settlement.connectionId === rule.connectionId)
        && (!rule.merchantId || settlement.merchantId === rule.merchantId)
        && (!rule.terminalId || settlement.terminalId === rule.terminalId));
      const paymentIds = new Set(settlements.flatMap((settlement) => settlement.paymentIds));
      return {
        ...rule,
        providerName: connection?.providerName || settlements[0]?.providerName || rule.providerId,
        connectionLabel: connection?.label || "",
        settlements,
        transactions: (db.externalPayments ?? []).filter((payment) => paymentIds.has(payment.id)),
      };
    });
  return {
    account,
    bankTransactions: db.bankTransactions
      .filter((transaction) => transaction.financialAccountId === account.id)
      .map((transaction) => ({ ...transaction, suggestions: bankTransactionSuggestions(db, transaction) })),
    moneyDocuments: (db.documents ?? []).filter((document) => document.financialAccountId === account.id && ["cashIn", "cashOut", "cashTransfer"].includes(document.type)),
    cards,
    virtualPos,
  };
}

export function createFinancialAccount(db, source = {}) {
  normalizeReconciliationStore(db);
  const name = clean(source.name, 120);
  const type = ["bank", "cash", "store"].includes(source.type) ? source.type : "bank";
  const iban = ibanValue(source.iban);
  const currency = clean(source.currency || "TRY", 3).toUpperCase();
  if (!name) throw new Error("Hesap adı zorunludur.");
  if (type === "bank" && iban && !/^TR\d{24}$/.test(iban)) throw new Error("Türkiye IBAN'ı TR ile başlayan 26 karakter olmalıdır.");
  if (iban && db.financialAccounts.some((account) => account.iban === iban)) throw new Error("Bu IBAN daha önce tanımlanmış.");
  const now = new Date().toISOString();
  const account = {
    id: randomUUID(),
    name,
    type,
    bankName: clean(source.bankName, 100),
    branchName: clean(source.branchName, 100),
    iban,
    accountNumber: clean(source.accountNumber, 60),
    currency,
    accountingCode: clean(source.accountingCode, 40),
    openingBalance: Number(source.openingBalance) || 0,
    currentBalance: Number(source.openingBalance) || 0,
    integrationMode: ["api", "open_banking", "file", "manual"].includes(source.integrationMode) ? source.integrationMode : "manual",
    status: source.status === "inactive" ? "inactive" : "active",
    createdAt: now,
    updatedAt: now,
  };
  db.financialAccounts.unshift(account);
  return account;
}

export function createRoutingRule(db, source = {}) {
  normalizeReconciliationStore(db);
  const financialAccount = db.financialAccounts.find((account) => account.id === clean(source.financialAccountId));
  if (!financialAccount) throw new Error("Hedef şirket hesabı bulunamadı.");
  const providerId = clean(source.providerId, 100);
  const merchantId = clean(source.merchantId, 120);
  const terminalId = clean(source.terminalId, 120);
  if (!providerId) throw new Error("Tahsilat sağlayıcısı zorunludur.");
  if (!merchantId && !terminalId) throw new Error("Üye işyeri veya terminal numarası zorunludur.");
  const now = new Date().toISOString();
  const rule = {
    id: randomUUID(),
    providerId,
    connectionId: clean(source.connectionId, 100),
    merchantId,
    terminalId,
    currency: clean(source.currency || financialAccount.currency, 3).toUpperCase(),
    financialAccountId: financialAccount.id,
    financialAccountName: financialAccount.name,
    active: source.active !== false,
    createdAt: now,
    updatedAt: now,
  };
  db.paymentRoutingRules.unshift(rule);
  return rule;
}

export function resolvePaymentDestination(db, payment = {}) {
  normalizeReconciliationStore(db);
  const destinationIban = ibanValue(payment.destinationIban);
  if (destinationIban) {
    const account = db.financialAccounts.find((item) => item.status !== "inactive" && item.iban === destinationIban);
    if (account) return { account, method: "destination_iban", confidence: "exact" };
  }
  const providerId = clean(payment.providerId);
  const connectionId = clean(payment.connectionId);
  const merchantId = clean(payment.merchantId);
  const terminalId = clean(payment.terminalId);
  const currency = clean(payment.currency || "TRY", 3).toUpperCase();
  const candidates = db.paymentRoutingRules.filter((rule) => {
    if (!rule.active || rule.providerId !== providerId || rule.currency !== currency) return false;
    if (rule.connectionId && connectionId && rule.connectionId !== connectionId) return false;
    if (rule.merchantId && rule.merchantId !== merchantId) return false;
    if (rule.terminalId && rule.terminalId !== terminalId) return false;
    return true;
  });
  if (candidates.length !== 1) return { account: null, method: candidates.length ? "ambiguous_route" : "unmatched_route", confidence: "none" };
  const account = db.financialAccounts.find((item) => item.id === candidates[0].financialAccountId && item.status !== "inactive");
  return account
    ? { account, method: "terminal_rule", confidence: "exact", rule: candidates[0] }
    : { account: null, method: "unmatched_route", confidence: "none" };
}

export function syncPaymentSettlement(db, payment) {
  normalizeReconciliationStore(db);
  if (payment.kind !== "payment" || payment.status !== "settled") return null;
  const batchReference = clean(payment.settlementBatchId || payment.externalId, 160);
  const uniqueKey = `${payment.providerId}:${batchReference}`;
  let settlement = db.paymentSettlements.find((item) => item.uniqueKey === uniqueKey);
  const now = new Date().toISOString();
  if (!settlement) {
    settlement = {
      id: randomUUID(),
      uniqueKey,
      providerId: payment.providerId,
      providerName: payment.providerName,
      connectionId: payment.connectionId,
      batchReference,
      merchantId: payment.merchantId,
      terminalId: payment.terminalId,
      currency: payment.currency,
      paymentIds: [],
      grossAmount: 0,
      commissionAmount: 0,
      netAmount: 0,
      expectedSettlementAt: payment.expectedSettlementAt || payment.paidAt,
      financialAccountId: payment.financialAccountId || null,
      financialAccountName: payment.financialAccountName || "",
      status: payment.financialAccountId ? "expected" : "account_unmatched",
      bankTransactionId: null,
      createdAt: now,
      updatedAt: now,
    };
    db.paymentSettlements.unshift(settlement);
  }
  settlement.paymentIds = [...new Set([...settlement.paymentIds, payment.id])];
  const linked = (db.externalPayments ?? []).filter((item) => settlement.paymentIds.includes(item.id));
  settlement.grossAmount = amountValue(linked.reduce((sum, item) => sum + amountValue(item.amount), 0));
  settlement.commissionAmount = amountValue(linked.reduce((sum, item) => sum + amountValue(item.commissionAmount), 0));
  settlement.netAmount = amountValue(linked.reduce((sum, item) => sum + amountValue(item.netAmount || (item.amount - item.commissionAmount)), 0));
  if (!settlement.financialAccountId && payment.financialAccountId) {
    settlement.financialAccountId = payment.financialAccountId;
    settlement.financialAccountName = payment.financialAccountName;
    settlement.status = "expected";
  }
  settlement.updatedAt = now;
  payment.settlementId = settlement.id;
  payment.settlementStatus = settlement.status;
  return settlement;
}

function counterpartyIbans(counterparty) {
  const explicit = Array.isArray(counterparty.bankAccounts) ? counterparty.bankAccounts.map((item) => ibanValue(item.iban)) : [];
  return [...explicit, ibanValue(counterparty.iban)].filter(Boolean);
}

function resolveBankCounterparty(db, transaction) {
  const expectedKind = transaction.direction === "in" ? "customer" : "supplier";
  const candidates = (db.counterparties ?? []).filter((item) => item.kind === expectedKind);
  const learned = db.bankMatchRules.find((rule) => rule.active !== false
    && rule.direction === transaction.direction
    && rule.counterpartyIban === transaction.counterpartyIban);
  if (learned) {
    const counterparty = candidates.find((item) => String(item.id) === String(learned.counterpartyId));
    if (counterparty) return { counterparty, method: "learned_iban", confidence: "exact" };
  }
  if (transaction.counterpartyIban) {
    const matches = candidates.filter((item) => counterpartyIbans(item).includes(transaction.counterpartyIban));
    if (matches.length === 1) return { counterparty: matches[0], method: "iban", confidence: "exact" };
  }
  if (transaction.taxId) {
    const matches = candidates.filter((item) => digits(item.taxId) === transaction.taxId);
    if (matches.length === 1) return { counterparty: matches[0], method: "tax_id", confidence: "exact" };
  }
  if (transaction.counterpartyName) {
    const name = folded(transaction.counterpartyName);
    const matches = candidates.filter((item) => folded(item.name) === name);
    if (matches.length === 1) return { counterparty: matches[0], method: "name", confidence: "high" };
  }
  return { counterparty: null, method: "unmatched", confidence: "none" };
}

function remainingDocumentAmount(document) {
  const total = amountValue(document.paymentSummary?.total ?? document.total ?? document.amount);
  const paid = amountValue(document.paymentSummary?.paid ?? (document.payments ?? []).reduce((sum, payment) => sum + Math.abs(Number(payment.amount) || 0), 0));
  return Math.max(0, Math.round((total - paid + Number.EPSILON) * 100) / 100);
}

function bankDocumentTitle(document) {
  const names = {
    purchase: "Alış faturası",
    sale: "Satış faturası",
    saleReturn: "Satış iadesi",
    purchaseReturn: "Alış iadesi",
    cashOut: "Məxaric",
    cashIn: "Mədaxil",
  };
  return `${names[document.type] || "Belge"} #${String(document.id ?? "").slice(0, 8)}`;
}

export function bankTransactionSuggestions(db, transaction) {
  normalizeReconciliationStore(db);
  if (!transaction || transaction.status !== "unmatched") return [];
  const allowed = transaction.direction === "out"
    ? new Set(["purchase", "saleReturn", "cashOut"])
    : new Set(["sale", "purchaseReturn", "cashIn"]);
  const transactionTime = new Date(transaction.valueDate || transaction.bookedAt).getTime();
  return (db.documents ?? [])
    .filter((document) => allowed.has(document.type) && !document.bankTransactionId && document.posted !== false && document.status !== "cancelled")
    .map((document) => {
      const isMoneyDocument = ["cashIn", "cashOut"].includes(document.type);
      if (isMoneyDocument && document.financialAccountId && document.financialAccountId !== transaction.financialAccountId) return null;
      const candidateAmount = isMoneyDocument ? amountValue(document.amount ?? document.total) : remainingDocumentAmount(document);
      const difference = Math.abs(candidateAmount - transaction.amount);
      if (difference > Math.max(1, transaction.amount * 0.03)) return null;
      const documentTime = new Date(document.documentDate || document.createdAt).getTime();
      const dayDistance = Number.isFinite(transactionTime) && Number.isFinite(documentTime) ? Math.abs(transactionTime - documentTime) / 86400000 : 999;
      if (dayDistance > 45) return null;
      const sameCounterpartyId = transaction.counterpartyId && String(transaction.counterpartyId) === String(document.counterpartyId);
      const transactionName = folded(transaction.counterpartyName);
      const documentName = folded(document.counterpartyName);
      const sameName = transactionName && documentName && (transactionName === documentName || transactionName.includes(documentName) || documentName.includes(transactionName));
      let score = difference < 0.01 ? 60 : Math.max(25, 55 - (difference / Math.max(1, transaction.amount)) * 100);
      if (sameCounterpartyId) score += 25;
      else if (sameName) score += 18;
      if (dayDistance <= 3) score += 15;
      else if (dayDistance <= 10) score += 10;
      else if (dayDistance <= 30) score += 5;
      if (isMoneyDocument) score += 8;
      return {
        documentId: document.id,
        documentType: document.type,
        title: bankDocumentTitle(document),
        counterpartyName: document.counterpartyName || "",
        amount: candidateAmount,
        documentDate: document.documentDate || document.createdAt,
        confidence: score >= 90 ? "very_high" : score >= 75 ? "high" : "possible",
        score: Math.round(score),
        reason: `${difference < 0.01 ? "Tutar aynı" : "Tutar yakın"}${sameCounterpartyId || sameName ? " · karşı taraf eşleşti" : ""}${dayDistance <= 10 ? " · tarih yakın" : ""}`,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function settlementDateDistance(settlement, transaction) {
  const expected = new Date(settlement.expectedSettlementAt).getTime();
  const actual = new Date(transaction.valueDate || transaction.bookedAt).getTime();
  return Number.isFinite(expected) && Number.isFinite(actual) ? Math.abs(actual - expected) / 86400000 : 999;
}

function resolveSettlement(db, transaction, source) {
  if (transaction.direction !== "in") return null;
  const explicit = clean(source.settlementBatchId || source.batchReference);
  if (explicit) {
    const match = db.paymentSettlements.find((item) => item.batchReference === explicit && ["expected", "account_unmatched"].includes(item.status));
    if (match) return match;
  }
  const candidates = db.paymentSettlements.filter((item) => item.status === "expected"
    && item.financialAccountId === transaction.financialAccountId
    && item.currency === transaction.currency
    && Math.abs(item.netAmount - transaction.amount) < 0.01
    && settlementDateDistance(item, transaction) <= 7);
  return candidates.length === 1 ? candidates[0] : null;
}

function createBankDocument(db, transaction, counterparty, category) {
  if (transaction.documentId) return db.documents.find((item) => item.id === transaction.documentId) ?? null;
  const document = {
    id: `BANK-${randomUUID()}`,
    type: transaction.direction === "in" ? "cashIn" : "cashOut",
    status: "posted",
    posted: true,
    documentDate: transaction.bookedAt,
    createdAt: new Date().toISOString(),
    account: transaction.financialAccountName,
    financialAccountId: transaction.financialAccountId,
    counterpartyId: counterparty?.id ?? null,
    counterpartyName: counterparty?.name ?? transaction.counterpartyName,
    category,
    method: "Banka hareketi",
    amount: transaction.amount,
    total: transaction.amount,
    author: "Sistem",
    comment: transaction.description,
    relationshipType: counterparty ? "debtPayment" : undefined,
    bankTransactionId: transaction.id,
  };
  db.documents ??= [];
  db.documents.unshift(document);
  transaction.documentId = document.id;
  if (counterparty) {
    const direction = transaction.direction === "in" ? -1 : -1;
    counterparty.balance = Number(counterparty.balance || 0) + direction * transaction.amount;
  }
  return document;
}

function settleWithBankTransaction(db, settlement, transaction) {
  settlement.status = "settled";
  settlement.bankTransactionId = transaction.id;
  settlement.settledAt = transaction.valueDate || transaction.bookedAt;
  settlement.updatedAt = new Date().toISOString();
  transaction.status = "settlement_matched";
  transaction.matchType = "pos_settlement";
  transaction.settlementId = settlement.id;
  transaction.matchConfidence = "exact";
  if (settlement.commissionAmount > 0 && !settlement.commissionDocumentId) {
    const commissionDocument = {
      id: `POSFEE-${randomUUID()}`,
      type: "cashOut",
      status: "posted",
      posted: true,
      documentDate: transaction.valueDate || transaction.bookedAt,
      createdAt: new Date().toISOString(),
      account: transaction.financialAccountName,
      financialAccountId: transaction.financialAccountId,
      counterpartyName: settlement.providerName,
      category: "POS komisyonu",
      method: settlement.providerName,
      amount: settlement.commissionAmount,
      total: settlement.commissionAmount,
      author: "Sistem",
      comment: `${settlement.batchReference} hakediş komisyonu`,
      settlementId: settlement.id,
      bankTransactionId: transaction.id,
    };
    db.documents ??= [];
    db.documents.unshift(commissionDocument);
    settlement.commissionDocumentId = commissionDocument.id;
  }
  for (const paymentId of settlement.paymentIds) {
    const payment = (db.externalPayments ?? []).find((item) => item.id === paymentId);
    if (payment) payment.settlementStatus = "settled";
  }
}

function normalizeBankTransaction(account, source = {}) {
  const externalId = clean(source.externalId || source.transactionId || source.id, 160);
  if (!externalId) throw new Error("Banka işlem numarası zorunludur.");
  const signedAmount = Number(source.amount || source.total) || 0;
  const direction = source.direction === "out" || signedAmount < 0 ? "out" : "in";
  const amount = amountValue(signedAmount);
  if (amount <= 0) throw new Error(`${externalId} banka hareketinin tutarı geçersiz.`);
  const bookedAt = new Date(source.bookedAt || source.transactionDate || source.date || Date.now()).toISOString();
  return {
    externalId,
    uniqueKey: `${account.id}:${externalId}`,
    financialAccountId: account.id,
    financialAccountName: account.name,
    direction,
    amount,
    currency: clean(source.currency || account.currency, 3).toUpperCase(),
    bookedAt,
    valueDate: source.valueDate ? new Date(source.valueDate).toISOString() : bookedAt,
    counterpartyName: clean(source.counterpartyName || source.senderName || source.recipientName, 200),
    counterpartyIban: ibanValue(source.counterpartyIban || source.senderIban || source.recipientIban),
    taxId: digits(source.taxId || source.vkn || source.tckn),
    description: clean(source.description || source.explanation, 500),
    bankReference: clean(source.bankReference || source.reference, 160),
  };
}

export function importBankTransactions(db, { financialAccountId, transactions = [], sourceName = "", sourceType = "manual" }) {
  normalizeReconciliationStore(db);
  const account = db.financialAccounts.find((item) => item.id === clean(financialAccountId) && item.status !== "inactive");
  if (!account) throw new Error("Şirket hesabı bulunamadı.");
  if (!Array.isArray(transactions) || !transactions.length) throw new Error("İçe aktarılacak banka hareketi bulunamadı.");
  const now = new Date().toISOString();
  const batch = {
    id: randomUUID(),
    financialAccountId: account.id,
    financialAccountName: account.name,
    sourceName: clean(sourceName || "Manuel hareket", 200),
    sourceType: ["csv", "xlsx", "api", "manual"].includes(sourceType) ? sourceType : "manual",
    rowCount: transactions.length,
    createdCount: 0,
    duplicateCount: 0,
    matchedCount: 0,
    unmatchedCount: 0,
    totalIncoming: 0,
    totalOutgoing: 0,
    status: "processing",
    createdAt: now,
    completedAt: null,
  };
  const result = { created: [], duplicates: [], matched: [], unmatched: [], settlements: [], batch };
  for (const source of transactions) {
    const incoming = normalizeBankTransaction(account, source);
    const duplicate = db.bankTransactions.find((item) => item.uniqueKey === incoming.uniqueKey);
    if (duplicate) {
      result.duplicates.push(duplicate);
      continue;
    }
    const importedAt = new Date().toISOString();
    const record = {
      id: randomUUID(),
      ...incoming,
      importBatchId: batch.id,
      importSourceName: batch.sourceName,
      importSourceRow: Math.max(0, Number(source.sourceRow) || 0),
      status: "unmatched",
      matchType: "unmatched",
      matchConfidence: "none",
      createdAt: importedAt,
      updatedAt: importedAt,
    };
    db.bankTransactions.unshift(record);
    account.currentBalance = Number(account.currentBalance || 0) + (record.direction === "in" ? record.amount : -record.amount);
    account.updatedAt = importedAt;

    const settlement = resolveSettlement(db, record, source);
    if (settlement) {
      settleWithBankTransaction(db, settlement, record);
      result.settlements.push(record);
      result.created.push(record);
      continue;
    }
    const match = resolveBankCounterparty(db, record);
    if (match.counterparty) {
      record.counterpartyId = match.counterparty.id;
      record.counterpartyName = match.counterparty.name;
      record.matchType = match.method;
      record.matchConfidence = match.confidence;
      if (record.direction === "in") {
        record.status = "matched";
        createBankDocument(db, record, match.counterparty, "Müşteri havalesi");
        result.matched.push(record);
      } else {
        record.matchType = "supplier_suggested";
        result.unmatched.push(record);
      }
    } else {
      result.unmatched.push(record);
    }
    result.created.push(record);
  }
  batch.createdCount = result.created.length;
  batch.duplicateCount = result.duplicates.length;
  batch.matchedCount = result.matched.length + result.settlements.length;
  batch.unmatchedCount = result.unmatched.length;
  batch.totalIncoming = amountValue(result.created.filter((item) => item.direction === "in").reduce((sum, item) => sum + item.amount, 0));
  batch.totalOutgoing = amountValue(result.created.filter((item) => item.direction === "out").reduce((sum, item) => sum + item.amount, 0));
  batch.status = "completed";
  batch.completedAt = new Date().toISOString();
  db.bankImportBatches.unshift(batch);
  return result;
}

function linkBankTransactionToDocument(db, transaction, document) {
  const isMoneyDocument = ["cashIn", "cashOut"].includes(document.type);
  const expectedMoneyType = transaction.direction === "in" ? "cashIn" : "cashOut";
  if (isMoneyDocument) {
    if (document.type !== expectedMoneyType) throw new Error("Belgenin yönü banka hareketiyle uyuşmuyor.");
    const documentAmount = amountValue(document.amount ?? document.total);
    if (Math.abs(documentAmount - transaction.amount) > 0.01) throw new Error("Banka hareketi ile ödeme belgesinin tutarı aynı olmalıdır.");
    if (document.financialAccountId && document.financialAccountId !== transaction.financialAccountId) throw new Error("Ödeme belgesi başka bir şirket hesabına bağlı.");
    document.financialAccountId = transaction.financialAccountId;
    document.account = transaction.financialAccountName;
    document.bankTransactionId = transaction.id;
    document.bankMatchStatus = "matched";
    document.bankMatchedAt = new Date().toISOString();
    document.updatedAt = new Date().toISOString();
    transaction.documentId = document.id;
  } else {
    const allowed = transaction.direction === "out" ? ["purchase", "saleReturn"] : ["sale", "purchaseReturn"];
    if (!allowed.includes(document.type)) throw new Error("Bu banka hareketi seçilen faturaya bağlanamaz.");
    const remaining = remainingDocumentAmount(document);
    if (transaction.amount > remaining + 0.0001) throw new Error(`Ödeme kalan belge tutarından büyük: ${remaining.toFixed(2)}`);
    const counterparty = (db.counterparties ?? []).find((item) => String(item.id) === String(document.counterpartyId));
    const paymentDocument = createBankDocument(db, transaction, counterparty, transaction.direction === "in" ? "Sənəd ödənişi" : "Təchizatçı ödənişi");
    if (!paymentDocument) throw new Error("Para hareketi oluşturulamadı.");
    paymentDocument.documentLink = { enabled: true, type: "debtPayment", documentId: document.id, title: bankDocumentTitle(document) };
    paymentDocument.linkedDocumentId = document.id;
    paymentDocument.linkedDocument = bankDocumentTitle(document);
    paymentDocument.relationshipType = "debtPayment";
    paymentDocument.bankMatchStatus = "matched";
    const existingPayments = Array.isArray(document.payments) ? document.payments : [];
    document.payments = [...existingPayments, {
      account: transaction.financialAccountName,
      method: "Banka hareketi",
      amount: transaction.amount,
      date: transaction.valueDate || transaction.bookedAt,
      note: transaction.description,
      direction: transaction.direction,
      externalDocumentId: paymentDocument.id,
      bankTransactionId: transaction.id,
    }];
    const total = amountValue(document.paymentSummary?.total ?? document.total);
    const paid = amountValue(document.payments.reduce((sum, payment) => sum + Math.abs(Number(payment.amount) || 0), 0));
    document.paymentSummary = {
      total,
      paid,
      remaining: Math.max(0, amountValue(total - paid)),
      status: paid >= total ? "Tam ödənilib" : paid > 0 ? "Qismən ödənilib" : "Ödənilməyib",
    };
    document.updatedAt = new Date().toISOString();
  }
  transaction.matchType = "document";
  transaction.matchConfidence = "confirmed";
  transaction.status = "matched";
  transaction.matchedDocumentId = document.id;
  transaction.matchedDocumentTitle = bankDocumentTitle(document);
}

export function manuallyMatchBankTransaction(db, transactionId, input = {}) {
  normalizeReconciliationStore(db);
  const transaction = db.bankTransactions.find((item) => item.id === transactionId);
  if (!transaction) throw new Error("Banka hareketi bulunamadı.");
  if (transaction.status !== "unmatched") throw new Error("Bu banka hareketi daha önce işlendi.");
  const matchType = clean(input.matchType || "counterparty");
  if (matchType === "document") {
    const document = (db.documents ?? []).find((item) => String(item.id) === String(input.documentId));
    if (!document) throw new Error("Eşleştirilecek belge bulunamadı.");
    linkBankTransactionToDocument(db, transaction, document);
  } else if (matchType === "counterparty") {
    const expectedKind = transaction.direction === "in" ? "customer" : "supplier";
    const counterparty = (db.counterparties ?? []).find((item) => item.kind === expectedKind && String(item.id) === String(input.counterpartyId));
    if (!counterparty) throw new Error(transaction.direction === "in" ? "Müşteri bulunamadı." : "Tedarikçi bulunamadı.");
    transaction.counterpartyId = counterparty.id;
    transaction.counterpartyName = counterparty.name;
    transaction.matchType = "manual_counterparty";
    transaction.matchConfidence = "exact";
    transaction.status = "matched";
    createBankDocument(db, transaction, counterparty, transaction.direction === "in" ? "Müşteri havalesi" : "Tedarikçi ödemesi");
    if (input.remember && transaction.counterpartyIban) {
      db.bankMatchRules = db.bankMatchRules.filter((rule) => !(rule.direction === transaction.direction && rule.counterpartyIban === transaction.counterpartyIban));
      db.bankMatchRules.unshift({ id: randomUUID(), direction: transaction.direction, counterpartyIban: transaction.counterpartyIban, counterpartyId: counterparty.id, counterpartyName: counterparty.name, active: true, createdAt: new Date().toISOString() });
    }
  } else if (matchType === "expense") {
    if (transaction.direction !== "out") throw new Error("Gelen hareket doğrudan gider olarak işlenemez.");
    transaction.matchType = "expense";
    transaction.status = "matched";
    createBankDocument(db, transaction, null, clean(input.category || "Diğer gider", 120));
  } else if (matchType === "transfer") {
    const target = db.financialAccounts.find((item) => item.id === clean(input.targetAccountId));
    if (!target || target.id === transaction.financialAccountId) throw new Error("Transfer için diğer şirket hesabını seçin.");
    transaction.matchType = "internal_transfer";
    transaction.status = "matched";
    transaction.targetAccountId = target.id;
    transaction.targetAccountName = target.name;
    if (transaction.direction === "out") target.currentBalance = Number(target.currentBalance || 0) + transaction.amount;
    else target.currentBalance = Number(target.currentBalance || 0) - transaction.amount;
    const document = createBankDocument(db, transaction, null, "Hesaplar arası transfer");
    if (document) {
      document.type = "cashTransfer";
      document.fromAccount = transaction.direction === "out" ? transaction.financialAccountName : target.name;
      document.toAccount = transaction.direction === "out" ? target.name : transaction.financialAccountName;
      document.financialAccountId = transaction.direction === "out" ? transaction.financialAccountId : target.id;
      document.toFinancialAccountId = transaction.direction === "out" ? target.id : transaction.financialAccountId;
    }
  } else if (matchType === "ignore") {
    transaction.matchType = "ignored";
    transaction.status = "ignored";
  } else {
    throw new Error("Geçersiz eşleştirme türü.");
  }
  transaction.updatedAt = new Date().toISOString();
  return transaction;
}

export function manuallyMatchSettlement(db, settlementId, input = {}) {
  normalizeReconciliationStore(db);
  const settlement = db.paymentSettlements.find((item) => item.id === settlementId);
  if (!settlement) throw new Error("POS hakedişi bulunamadı.");
  if (settlement.status === "settled") throw new Error("Bankaya geçmiş hakedişin hesabı değiştirilemez.");
  const account = db.financialAccounts.find((item) => item.id === clean(input.financialAccountId) && item.status !== "inactive");
  if (!account) throw new Error("Hedef şirket hesabı bulunamadı.");
  settlement.financialAccountId = account.id;
  settlement.financialAccountName = account.name;
  settlement.status = "expected";
  settlement.updatedAt = new Date().toISOString();
  for (const paymentId of settlement.paymentIds) {
    const payment = (db.externalPayments ?? []).find((item) => item.id === paymentId);
    if (!payment) continue;
    payment.financialAccountId = account.id;
    payment.financialAccountName = account.name;
    payment.accountMatchMethod = "manual";
    payment.accountMatchConfidence = "exact";
    payment.settlementStatus = "expected";
    const document = (db.documents ?? []).find((item) => item.externalPaymentId === payment.id);
    if (document) {
      document.account = account.name;
      document.financialAccountId = account.id;
      document.settlementId = settlement.id;
    }
  }
  if (input.remember && (settlement.merchantId || settlement.terminalId)) {
    const exists = db.paymentRoutingRules.some((rule) => rule.providerId === settlement.providerId
      && rule.connectionId === settlement.connectionId
      && rule.merchantId === settlement.merchantId
      && rule.terminalId === settlement.terminalId
      && rule.currency === settlement.currency);
    if (!exists) createRoutingRule(db, {
      providerId: settlement.providerId,
      connectionId: settlement.connectionId,
      merchantId: settlement.merchantId,
      terminalId: settlement.terminalId,
      currency: settlement.currency,
      financialAccountId: account.id,
    });
  }
  return settlement;
}

export function reconciliationOverview(db) {
  normalizeReconciliationStore(db);
  return {
    accounts: db.financialAccounts.length,
    bankTransactions: db.bankTransactions.length,
    bankUnmatched: db.bankTransactions.filter((item) => item.status === "unmatched").length,
    settlementsExpected: db.paymentSettlements.filter((item) => item.status === "expected").length,
    settlementsAccountUnmatched: db.paymentSettlements.filter((item) => item.status === "account_unmatched").length,
    settlementsCompleted: db.paymentSettlements.filter((item) => item.status === "settled").length,
  };
}
