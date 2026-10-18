import test from "node:test";
import assert from "node:assert/strict";
import { importExternalPayments, manuallyMatchExternalPayment } from "./externalPayments.js";

const makeDb = () => ({
  counterparties: [
    { id: 1, kind: "customer", name: "A Müşterisi", cariCode: "120.01.001", taxId: "1234567890", email: "a@example.com", balance: 1000 },
    { id: 2, kind: "customer", name: "B Müşterisi", cariCode: "120.01.002", taxId: "11111111111", balance: 500 },
  ],
  documents: [{ id: "SAT-44", documentNumber: "S-44", counterpartyId: 2, counterpartyName: "B Müşterisi" }],
  externalPayments: [],
});

test("imports a settled provider payment once and reduces the matched customer balance", () => {
  const db = makeDb();
  const input = { providerId: "tahsilapp", providerName: "TahsilApp", payments: [{ transactionId: "TX-1", amount: 250, status: "paid", vkn: "1234567890" }] };
  const first = importExternalPayments(db, input);
  const second = importExternalPayments(db, input);
  assert.equal(first.created.length, 1);
  assert.equal(second.duplicates.length, 1);
  assert.equal(db.counterparties[0].balance, 750);
  assert.equal(db.documents.filter((item) => item.externalPaymentId).length, 1);
});

test("keeps an ambiguous payment unmatched until a customer is selected", () => {
  const db = makeDb();
  const result = importExternalPayments(db, { providerId: "oduyo", providerName: "Ödüyo", payments: [{ transactionId: "TX-2", amount: 100, status: "paid" }] });
  assert.equal(result.unmatched.length, 1);
  assert.equal(db.documents.length, 1);
  manuallyMatchExternalPayment(db, result.created[0].id, 2);
  assert.equal(db.counterparties[1].balance, 400);
  assert.equal(db.externalPayments[0].processingStatus, "posted");
});

test("does not match a customer whose phone fields are empty", () => {
  const db = makeDb();
  db.counterparties = [{ id: 9, kind: "customer", name: "Telefonu olmayan", phone: "", balance: 0 }];
  const result = importExternalPayments(db, { providerId: "oduyo", providerName: "Ödüyo", payments: [{ transactionId: "TX-PHONE", amount: 50, status: "paid", phone: "+90 555 000 00 00" }] });
  assert.equal(result.unmatched.length, 1);
  assert.equal(db.documents.filter((item) => item.externalPaymentId).length, 0);
});

test("links a refund to the original payment and restores the balance", () => {
  const db = makeDb();
  importExternalPayments(db, { providerId: "netahsilat", providerName: "Netahsilat", payments: [{ transactionId: "TX-3", amount: 300, status: "paid", cariCode: "120.01.001" }] });
  importExternalPayments(db, { providerId: "netahsilat", providerName: "Netahsilat", payments: [{ transactionId: "RF-3", originalTransactionId: "TX-3", amount: 300, status: "refunded", type: "refund" }] });
  assert.equal(db.counterparties[0].balance, 1000);
  assert.equal(db.documents.filter((item) => item.externalPaymentId).length, 2);
});
