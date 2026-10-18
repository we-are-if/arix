import test from "node:test";
import assert from "node:assert/strict";
import { importExternalPayments } from "./externalPayments.js";
import {
  bankTransactionSuggestions,
  createCompanyCard,
  createFinancialAccount,
  createRoutingRule,
  financialAccountDetails,
  importCardTransactions,
  importBankTransactions,
  manuallyMatchBankTransaction,
  manuallyMatchSettlement,
  normalizeReconciliationStore,
} from "./paymentReconciliation.js";

const makeDb = () => {
  const db = {
    counterparties: [
      { id: 1, kind: "customer", name: "ABC Mobilya", taxId: "1234567890", balance: 10000, bankAccounts: [{ iban: "TR110000000000000000000001" }] },
      { id: 2, kind: "supplier", name: "XYZ Tedarikçi", taxId: "9876543210", balance: 8000, bankAccounts: [{ iban: "TR220000000000000000000002" }] },
    ],
    documents: [],
    externalPayments: [],
  };
  normalizeReconciliationStore(db);
  return db;
};

test("routes a provider payment to the configured real company account", () => {
  const db = makeDb();
  const account = createFinancialAccount(db, { name: "Garanti TL", bankName: "Garanti BBVA", iban: "TR330000000000000000000003", currency: "TRY" });
  createRoutingRule(db, { providerId: "netahsilat", merchantId: "MER-1", terminalId: "POS-1", currency: "TRY", financialAccountId: account.id });
  const result = importExternalPayments(db, {
    providerId: "netahsilat",
    providerName: "NetTahsilat",
    payments: [{ transactionId: "NT-1", amount: 1000, commission: 20, netAmount: 980, status: "paid", vkn: "1234567890", merchantId: "MER-1", terminalId: "POS-1", batchId: "BATCH-1" }],
  });
  assert.equal(result.created[0].financialAccountId, account.id);
  assert.equal(result.created[0].settlementStatus, "expected");
  assert.equal(db.paymentSettlements[0].netAmount, 980);
  assert.equal(db.counterparties[0].balance, 9000);
});

test("matches the net POS settlement to a bank movement without charging the customer twice", () => {
  const db = makeDb();
  const account = createFinancialAccount(db, { name: "Garanti TL", iban: "TR330000000000000000000003", currency: "TRY" });
  createRoutingRule(db, { providerId: "netahsilat", terminalId: "POS-1", currency: "TRY", financialAccountId: account.id });
  importExternalPayments(db, {
    providerId: "netahsilat",
    providerName: "NetTahsilat",
    payments: [{ transactionId: "NT-2", amount: 1000, commission: 20, netAmount: 980, status: "paid", vkn: "1234567890", terminalId: "POS-1", batchId: "BATCH-2", settlementDate: "2026-10-16" }],
  });
  const documentCount = db.documents.length;
  const result = importBankTransactions(db, {
    financialAccountId: account.id,
    transactions: [{ transactionId: "GAR-1", amount: 980, date: "2026-10-16", settlementBatchId: "BATCH-2", description: "POS HAKEDIS" }],
  });
  assert.equal(result.settlements.length, 1);
  assert.equal(db.paymentSettlements[0].status, "settled");
  assert.equal(db.documents.length, documentCount + 1);
  assert.equal(db.documents[0].category, "POS komisyonu");
  assert.equal(db.counterparties[0].balance, 9000);
  assert.equal(account.currentBalance, 980);
});

test("assigns an unmatched POS settlement to a real account and remembers the terminal", () => {
  const db = makeDb();
  const account = createFinancialAccount(db, { name: "Garanti TL", iban: "TR330000000000000000000003" });
  importExternalPayments(db, {
    providerId: "netahsilat",
    providerName: "NetTahsilat",
    payments: [{ transactionId: "NT-NO-ROUTE", amount: 500, status: "paid", vkn: "1234567890", merchantId: "MER-9", terminalId: "POS-9" }],
  });
  assert.equal(db.paymentSettlements[0].status, "account_unmatched");
  manuallyMatchSettlement(db, db.paymentSettlements[0].id, { financialAccountId: account.id, remember: true });
  assert.equal(db.paymentSettlements[0].financialAccountId, account.id);
  assert.equal(db.paymentRoutingRules[0].terminalId, "POS-9");
  assert.equal(db.documents[0].account, "Garanti TL");
});

test("matches an incoming transfer to a customer by sender IBAN", () => {
  const db = makeDb();
  const account = createFinancialAccount(db, { name: "Garanti TL", iban: "TR330000000000000000000003" });
  const result = importBankTransactions(db, {
    financialAccountId: account.id,
    transactions: [{ transactionId: "GAR-IN-1", amount: 2500, senderIban: "TR110000000000000000000001", senderName: "ABC Mobilya" }],
  });
  assert.equal(result.matched.length, 1);
  assert.equal(result.matched[0].counterpartyId, 1);
  assert.equal(db.counterparties[0].balance, 7500);
  assert.equal(db.documents[0].type, "cashIn");
});

test("suggests a purchase invoice for an outgoing supplier transfer and posts it only after approval", () => {
  const db = makeDb();
  const account = createFinancialAccount(db, { name: "Garanti TL", iban: "TR330000000000000000000003", openingBalance: 10000 });
  db.documents.push({ id: "PURCHASE-1", type: "purchase", posted: true, status: "posted", documentDate: "2026-10-15", counterpartyId: 2, counterpartyName: "XYZ Tedarikçi", total: 3000, paymentSummary: { total: 3000, paid: 0, remaining: 3000 } });
  const result = importBankTransactions(db, {
    financialAccountId: account.id,
    transactions: [{ transactionId: "GAR-OUT-1", amount: -3000, date: "2026-10-16", recipientIban: "TR220000000000000000000002", recipientName: "XYZ Tedarikçi" }],
  });
  assert.equal(result.unmatched[0].counterpartyId, 2);
  const suggestions = bankTransactionSuggestions(db, result.unmatched[0]);
  assert.equal(suggestions[0].documentId, "PURCHASE-1");
  manuallyMatchBankTransaction(db, result.unmatched[0].id, { matchType: "document", documentId: "PURCHASE-1" });
  assert.equal(db.counterparties[1].balance, 5000);
  assert.equal(db.documents[0].type, "cashOut");
  assert.equal(db.documents.find((item) => item.id === "PURCHASE-1").paymentSummary.status, "Tam ödənilib");
  assert.equal(account.currentBalance, 7000);
});

test("matches a bank movement to an already-created payment without creating a duplicate expense", () => {
  const db = makeDb();
  const account = createFinancialAccount(db, { name: "Garanti TL", iban: "TR330000000000000000000003", openingBalance: 2000 });
  db.documents.push({ id: "PAYMENT-1", type: "cashOut", posted: true, status: "posted", documentDate: "2026-10-15", financialAccountId: account.id, account: account.name, counterpartyName: "Demo Otel", amount: 750, total: 750, bankMatchStatus: "pending" });
  const result = importBankTransactions(db, { financialAccountId: account.id, transactions: [{ transactionId: "GAR-HOTEL-1", amount: -750, date: "2026-10-16", recipientName: "Demo Otel" }] });
  const suggestions = bankTransactionSuggestions(db, result.unmatched[0]);
  assert.equal(suggestions[0].documentId, "PAYMENT-1");
  manuallyMatchBankTransaction(db, result.unmatched[0].id, { matchType: "document", documentId: "PAYMENT-1" });
  assert.equal(db.documents.length, 1);
  assert.equal(db.documents[0].bankTransactionId, result.unmatched[0].id);
  assert.equal(db.documents[0].bankMatchStatus, "matched");
  assert.equal(account.currentBalance, 1250);
});

test("keeps an auditable batch summary for statement file imports", () => {
  const db = makeDb();
  const account = createFinancialAccount(db, { name: "Garanti TRY", type: "bank", currency: "TRY" });
  const result = importBankTransactions(db, {
    financialAccountId: account.id,
    sourceName: "garanti-ekim.xlsx",
    sourceType: "xlsx",
    transactions: [
      { transactionId: "G-100", amount: 1250, date: "2026-10-16", sourceRow: 4 },
      { transactionId: "G-101", amount: -300, date: "2026-10-16", sourceRow: 5 },
    ],
  });

  assert.equal(result.batch.sourceName, "garanti-ekim.xlsx");
  assert.equal(result.batch.createdCount, 2);
  assert.equal(result.batch.totalIncoming, 1250);
  assert.equal(result.batch.totalOutgoing, 300);
  assert.equal(db.bankImportBatches.length, 1);
  assert.equal(db.bankTransactions.find((item) => item.externalId === "G-100").importSourceRow, 4);

  const duplicate = importBankTransactions(db, {
    financialAccountId: account.id,
    sourceName: "garanti-ekim.xlsx",
    sourceType: "xlsx",
    transactions: [{ transactionId: "G-100", amount: 1250, date: "2026-10-16", sourceRow: 4 }],
  });
  assert.equal(duplicate.batch.createdCount, 0);
  assert.equal(duplicate.batch.duplicateCount, 1);
});

test("keeps an unknown bank movement unmatched and learns the manual IBAN rule", () => {
  const db = makeDb();
  const account = createFinancialAccount(db, { name: "Garanti TL", iban: "TR330000000000000000000003" });
  const first = importBankTransactions(db, {
    financialAccountId: account.id,
    transactions: [{ transactionId: "GAR-UNKNOWN-1", amount: 300, senderIban: "TR440000000000000000000004", senderName: "Bilinmeyen" }],
  });
  assert.equal(first.unmatched.length, 1);
  manuallyMatchBankTransaction(db, first.unmatched[0].id, { matchType: "counterparty", counterpartyId: 1, remember: true });
  const second = importBankTransactions(db, {
    financialAccountId: account.id,
    transactions: [{ transactionId: "GAR-UNKNOWN-2", amount: 400, senderIban: "TR440000000000000000000004", senderName: "Farklı Açıklama" }],
  });
  assert.equal(second.matched[0].matchType, "learned_iban");
  assert.equal(second.matched[0].counterpartyId, 1);
});

test("classifies an outgoing unmatched movement as an expense", () => {
  const db = makeDb();
  const account = createFinancialAccount(db, { name: "Garanti TL", iban: "TR330000000000000000000003", openingBalance: 1000 });
  const result = importBankTransactions(db, {
    financialAccountId: account.id,
    transactions: [{ transactionId: "FEE-1", amount: -25, recipientName: "Garanti BBVA", description: "Hesap işletim ücreti" }],
  });
  const matched = manuallyMatchBankTransaction(db, result.unmatched[0].id, { matchType: "expense", category: "Banka komisyonu" });
  assert.equal(matched.status, "matched");
  assert.equal(db.documents[0].category, "Banka komisyonu");
});

test("classifies movement between company accounts as transfer, not expense", () => {
  const db = makeDb();
  const source = createFinancialAccount(db, { name: "Garanti TL", iban: "TR330000000000000000000003", openingBalance: 1000 });
  const target = createFinancialAccount(db, { name: "Akbank TL", iban: "TR550000000000000000000005", openingBalance: 0 });
  const result = importBankTransactions(db, { financialAccountId: source.id, transactions: [{ transactionId: "OWN-1", amount: -200, recipientName: "Kendi hesabımız" }] });
  manuallyMatchBankTransaction(db, result.unmatched[0].id, { matchType: "transfer", targetAccountId: target.id });
  assert.equal(db.documents[0].type, "cashTransfer");
  assert.equal(source.currentBalance, 800);
  assert.equal(target.currentBalance, 200);
});

test("keeps company cards under the real bank account and exposes their movements", () => {
  const db = makeDb();
  const account = createFinancialAccount(db, { name: "Garanti TL", bankName: "Garanti BBVA", iban: "TR330000000000000000000003" });
  const card = createCompanyCard(db, account.id, { name: "Seyahat kartı", kind: "credit", lastFour: "4242", holderName: "Arif Mahmud", creditLimit: 100000 });
  importCardTransactions(db, card.id, [{ transactionId: "CARD-1", amount: 12000, merchantName: "Demo Otel", description: "Konaklama", date: "2026-10-15" }]);
  const details = financialAccountDetails(db, account.id);
  assert.equal(details.cards.length, 1);
  assert.equal(details.cards[0].transactions[0].merchantName, "Demo Otel");
  assert.equal(details.cards[0].transactions[0].status, "invoice_unmatched");
  assert.equal(account.currentBalance, 0);
});

test("shows routed virtual POS devices and their collections under the destination account", () => {
  const db = makeDb();
  const account = createFinancialAccount(db, { name: "Garanti TL", iban: "TR330000000000000000000003" });
  createRoutingRule(db, { providerId: "netahsilat", merchantId: "MER-1", terminalId: "VPOS-1", currency: "TRY", financialAccountId: account.id });
  importExternalPayments(db, { providerId: "netahsilat", providerName: "NetTahsilat", payments: [{ transactionId: "POS-DETAIL-1", amount: 500, status: "paid", vkn: "1234567890", merchantId: "MER-1", terminalId: "VPOS-1" }] });
  const details = financialAccountDetails(db, account.id);
  assert.equal(details.virtualPos.length, 1);
  assert.equal(details.virtualPos[0].providerName, "NetTahsilat");
  assert.equal(details.virtualPos[0].transactions[0].externalId, "POS-DETAIL-1");
});
