import { randomUUID } from "node:crypto";
import { resolvePaymentDestination, syncPaymentSettlement } from "./paymentReconciliation.js";

const text = (value, max = 240) => String(value ?? "").trim().slice(0, max);
const digits = (value) => text(value, 64).replace(/\D/g, "");
const folded = (value) => text(value).toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
const numberValue = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

const settledStatuses = new Set(["paid", "settled", "completed", "successful", "success"]);
const pendingStatuses = new Set(["pending", "processing", "authorized", "waiting"]);

function normalizedStatus(value) {
  const status = folded(value);
  if (settledStatuses.has(status)) return "settled";
  if (pendingStatuses.has(status)) return "pending";
  if (["refunded", "chargeback", "reversed"].includes(status)) return "settled";
  return "failed";
}

function normalizedKind(payment) {
  const value = folded(payment.kind || payment.type || payment.status);
  if (value.includes("chargeback") || value.includes("ters ibraz")) return "chargeback";
  if (value.includes("refund") || value.includes("iade") || value.includes("reversed")) return "refund";
  return "payment";
}

function counterpartyCode(counterparty) {
  return text(counterparty.cariCode || counterparty.accountCode || counterparty.code || counterparty.currentAccountCode).toUpperCase();
}

function documentReferences(document) {
  return [document.id, document.number, document.documentNumber, document.invoiceNumber, document.orderNumber, document.reference]
    .map((value) => text(value).toUpperCase())
    .filter(Boolean);
}

export function resolveExternalPaymentMatch(db, payment) {
  const customers = (db.counterparties ?? []).filter((item) => item.kind !== "supplier");
  const explicitId = text(payment.counterpartyId || payment.customerId);
  if (explicitId) {
    const customer = customers.find((item) => String(item.id) === explicitId);
    if (customer) return { counterparty: customer, method: "counterparty_id", confidence: "exact", document: null };
  }

  const cariCode = text(payment.cariCode || payment.customerCode || payment.accountCode).toUpperCase();
  if (cariCode) {
    const customer = customers.find((item) => counterpartyCode(item) === cariCode);
    if (customer) return { counterparty: customer, method: "cari_code", confidence: "exact", document: null };
  }

  const taxId = digits(payment.taxId || payment.vkn || payment.tckn);
  if (taxId) {
    const customer = customers.find((item) => digits(item.taxId) === taxId);
    if (customer) return { counterparty: customer, method: "tax_id", confidence: "exact", document: null };
  }

  const reference = text(payment.documentNumber || payment.invoiceNumber || payment.orderNumber).toUpperCase();
  if (reference) {
    const document = (db.documents ?? []).find((item) => documentReferences(item).includes(reference));
    if (document) {
      const customer = customers.find((item) => String(item.id) === String(document.counterpartyId))
        ?? customers.find((item) => folded(item.name) === folded(document.counterpartyName));
      if (customer) return { counterparty: customer, method: "document", confidence: "exact", document };
    }
  }

  const email = folded(payment.email);
  if (email) {
    const matches = customers.filter((item) => folded(item.email) === email);
    if (matches.length === 1) return { counterparty: matches[0], method: "email", confidence: "exact", document: null };
  }

  const phone = digits(payment.phone);
  if (phone) {
    const matches = customers.filter((item) => [item.phone, item.phone2, item.mobile].some((value) => {
      const candidate = digits(value);
      return candidate && (candidate.endsWith(phone) || phone.endsWith(candidate));
    }));
    if (matches.length === 1) return { counterparty: matches[0], method: "phone", confidence: "exact", document: null };
  }

  return { counterparty: null, method: "unmatched", confidence: "none", document: null };
}

function postExternalPayment(db, record) {
  if (record.ledgerDocumentId || record.status !== "settled" || !record.counterpartyId) return record;
  const counterparty = (db.counterparties ?? []).find((item) => String(item.id) === String(record.counterpartyId));
  if (!counterparty) return record;
  const reversing = record.kind === "refund" || record.kind === "chargeback";
  const documentId = `EXT-${randomUUID()}`;
  const linkedDocument = record.documentNumber ? `Sənəd #${record.documentNumber}` : "";
  db.documents ??= [];
  db.documents.unshift({
    id: documentId,
    type: reversing ? "cashOut" : "cashIn",
    status: "posted",
    posted: true,
    documentDate: record.paidAt,
    createdAt: new Date().toISOString(),
    account: record.financialAccountName || `${record.providerName} hakediş`,
    financialAccountId: record.financialAccountId || null,
    counterpartyId: counterparty.id,
    counterpartyName: counterparty.name,
    category: reversing ? "Harici tahsilat iadesi" : record.settlementStatus === "settled" ? "Harici tahsilat" : "Harici tahsilat · hakediş bekleniyor",
    method: record.providerName,
    amount: record.amount,
    total: record.amount,
    author: "Sistem",
    comment: `${record.providerName} · ${record.externalId}`,
    linkedDocument,
    relationshipType: "debtPayment",
    externalPaymentId: record.id,
    settlementId: record.settlementId || null,
  });
  counterparty.balance = numberValue(counterparty.balance) + (reversing ? record.amount : -record.amount);
  record.ledgerDocumentId = documentId;
  record.processingStatus = "posted";
  record.postedAt = new Date().toISOString();
  return record;
}

function normalizeIncomingPayment(providerId, providerName, payment) {
  const externalId = text(payment.externalId || payment.transactionId || payment.id, 160);
  const amount = Math.abs(numberValue(payment.amount || payment.total));
  if (!externalId) throw new Error("Sağlayıcı işlem numarası zorunludur.");
  if (amount <= 0) throw new Error(`${externalId} işleminin tutarı geçersiz.`);
  const paidAtValue = payment.paidAt || payment.transactionDate || payment.date || new Date().toISOString();
  const paidAt = Number.isNaN(new Date(paidAtValue).getTime()) ? new Date().toISOString() : new Date(paidAtValue).toISOString();
  return {
    providerId,
    providerName,
    externalId,
    uniqueKey: `${providerId}:${externalId}`,
    kind: normalizedKind(payment),
    status: normalizedStatus(payment.status),
    amount,
    currency: text(payment.currency || "TRY", 3).toUpperCase(),
    paidAt,
    originalExternalId: text(payment.originalExternalId || payment.originalTransactionId, 160),
    cariCode: text(payment.cariCode || payment.customerCode || payment.accountCode, 80),
    taxId: digits(payment.taxId || payment.vkn || payment.tckn),
    email: text(payment.email, 160),
    phone: text(payment.phone, 48),
    documentNumber: text(payment.documentNumber || payment.invoiceNumber || payment.orderNumber, 120),
    rawCustomerName: text(payment.customerName || payment.name, 200),
    merchantId: text(payment.merchantId || payment.merchantNumber || payment.memberMerchantId, 120),
    terminalId: text(payment.terminalId || payment.terminalNumber || payment.posId, 120),
    settlementBatchId: text(payment.settlementBatchId || payment.batchId || payment.payoutId, 160),
    bankReference: text(payment.bankReference || payment.reference, 160),
    destinationIban: text(payment.destinationIban || payment.bankIban, 64).replace(/\s/g, "").toUpperCase(),
    commissionAmount: Math.abs(numberValue(payment.commissionAmount || payment.commission || payment.fee)),
    netAmount: Math.abs(numberValue(payment.netAmount || payment.settlementAmount || (amount - Math.abs(numberValue(payment.commissionAmount || payment.commission || payment.fee))))),
    expectedSettlementAt: (() => {
      const value = payment.expectedSettlementAt || payment.valueDate || payment.settlementDate || paidAt;
      return Number.isNaN(new Date(value).getTime()) ? paidAt : new Date(value).toISOString();
    })(),
  };
}

export function importExternalPayments(db, { providerId, providerName, connectionId = "", payments = [] }) {
  if (!text(providerId)) throw new Error("Sağlayıcı zorunludur.");
  if (!Array.isArray(payments) || payments.length === 0) throw new Error("İçe aktarılacak ödeme bulunamadı.");
  db.externalPayments ??= [];
  const result = { created: [], updated: [], duplicates: [], unmatched: [] };

  for (const source of payments) {
    const incoming = normalizeIncomingPayment(text(providerId), text(providerName || providerId), source ?? {});
    const existing = db.externalPayments.find((item) => item.uniqueKey === incoming.uniqueKey);
    if (existing) {
      const previousStatus = existing.status;
      Object.assign(existing, incoming, { connectionId: text(connectionId), updatedAt: new Date().toISOString() });
      if (!existing.counterpartyId) {
        const match = resolveExternalPaymentMatch(db, { ...source, ...incoming });
        if (match.counterparty) Object.assign(existing, { counterpartyId: match.counterparty.id, counterpartyName: match.counterparty.name, matchMethod: match.method, matchConfidence: match.confidence });
      }
      const destination = resolvePaymentDestination(db, { ...existing, connectionId: text(connectionId) });
      Object.assign(existing, {
        financialAccountId: destination.account?.id ?? existing.financialAccountId ?? null,
        financialAccountName: destination.account?.name ?? existing.financialAccountName ?? "",
        accountMatchMethod: destination.account ? destination.method : existing.accountMatchMethod ?? destination.method,
        accountMatchConfidence: destination.account ? destination.confidence : existing.accountMatchConfidence ?? "none",
      });
      syncPaymentSettlement(db, existing);
      postExternalPayment(db, existing);
      (previousStatus === existing.status && existing.ledgerDocumentId ? result.duplicates : result.updated).push(existing);
      continue;
    }

    const match = resolveExternalPaymentMatch(db, { ...source, ...incoming });
    if (!match.counterparty && incoming.originalExternalId) {
      const original = db.externalPayments.find((item) => item.providerId === incoming.providerId && item.externalId === incoming.originalExternalId);
      if (original?.counterpartyId) {
        match.counterparty = (db.counterparties ?? []).find((item) => String(item.id) === String(original.counterpartyId)) ?? null;
        match.method = "original_payment";
        match.confidence = match.counterparty ? "exact" : "none";
      }
    }
    const now = new Date().toISOString();
    const destination = resolvePaymentDestination(db, { ...incoming, connectionId: text(connectionId) });
    const record = {
      id: randomUUID(),
      ...incoming,
      connectionId: text(connectionId),
      counterpartyId: match.counterparty?.id ?? null,
      counterpartyName: match.counterparty?.name ?? "",
      matchMethod: match.method,
      matchConfidence: match.confidence,
      financialAccountId: destination.account?.id ?? null,
      financialAccountName: destination.account?.name ?? "",
      accountMatchMethod: destination.method,
      accountMatchConfidence: destination.confidence,
      processingStatus: match.counterparty ? "matched" : "unmatched",
      settlementStatus: destination.account ? "expected" : "account_unmatched",
      ledgerDocumentId: null,
      createdAt: now,
      updatedAt: now,
    };
    db.externalPayments.unshift(record);
    syncPaymentSettlement(db, record);
    postExternalPayment(db, record);
    result.created.push(record);
    if (!record.counterpartyId) result.unmatched.push(record);
  }
  return result;
}

export function manuallyMatchExternalPayment(db, paymentId, counterpartyId) {
  const payment = (db.externalPayments ?? []).find((item) => item.id === paymentId);
  if (!payment) throw new Error("Harici ödeme bulunamadı.");
  if (payment.ledgerDocumentId) throw new Error("Muhasebeleşmiş ödeme yeniden eşleştirilemez.");
  const counterparty = (db.counterparties ?? []).find((item) => item.kind !== "supplier" && String(item.id) === String(counterpartyId));
  if (!counterparty) throw new Error("Müşteri bulunamadı.");
  Object.assign(payment, {
    counterpartyId: counterparty.id,
    counterpartyName: counterparty.name,
    matchMethod: "manual",
    matchConfidence: "exact",
    processingStatus: "matched",
    updatedAt: new Date().toISOString(),
  });
  return postExternalPayment(db, payment);
}

export function externalPaymentOverview(payments = []) {
  return {
    total: payments.length,
    posted: payments.filter((item) => item.processingStatus === "posted").length,
    unmatched: payments.filter((item) => item.processingStatus === "unmatched").length,
    pending: payments.filter((item) => item.status === "pending").length,
  };
}
