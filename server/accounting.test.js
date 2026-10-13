import test from "node:test";
import assert from "node:assert/strict";
import {
  accountingOverview,
  ensureCounterpartyAccounting,
  normalizeAccountingStore,
  upsertDocumentJournal,
} from "./accounting.js";

const dbFixture = () => ({
  accounting: {},
  counterparties: [],
  products: [{ id: 1, name: "Folyo", cost: 2 }],
});

test("creates Tekduzen base accounts and counterparty subaccounts", () => {
  const db = dbFixture();
  normalizeAccountingStore(db);
  const customer = ensureCounterpartyAccounting(db, { id: 7, kind: "customer", name: "Test Alıcı" });
  const supplier = ensureCounterpartyAccounting(db, { id: 8, kind: "supplier", name: "Test Satıcı" });

  assert.equal(customer.currentCode, "MUS-00007");
  assert.equal(customer.accountingCode, "120.01.00007");
  assert.equal(supplier.accountingCode, "320.01.00008");
  assert.ok(db.accounting.accounts.some((account) => account.code === "600"));
  assert.ok(db.accounting.accounts.some((account) => account.code === customer.accountingCode));

  ensureCounterpartyAccounting(db, { ...customer, name: "Yeni Alıcı Adı", status: "Bloklu" });
  const customerAccount = db.accounting.accounts.find((account) => account.code === customer.accountingCode);
  assert.equal(customerAccount.name, "YENİ ALICI ADI");
  assert.equal(customerAccount.active, false);
});

test("posts a balanced sale journal with cost of goods sold", () => {
  const db = dbFixture();
  normalizeAccountingStore(db);
  const customer = ensureCounterpartyAccounting(db, { id: 1, kind: "customer", name: "Alıcı" });
  db.counterparties.push(customer);

  const journal = upsertDocumentJournal(db, {
    id: "sale-1",
    type: "sale",
    status: "posted",
    posted: true,
    total: 50,
    counterpartyId: 1,
    counterpartyName: "Alıcı",
    lines: [{ productId: 1, qty: 10, price: 5 }],
  });

  assert.equal(journal.debit, journal.credit);
  assert.equal(journal.debit, 70);
  assert.ok(journal.lines.some((line) => line.accountCode === "120.01.00001" && line.debit === 50));
  assert.ok(journal.lines.some((line) => line.accountCode === "621" && line.debit === 20));
  assert.equal(accountingOverview(db).journalCount, 1);
});

test("reposting the same source replaces its previous journal", () => {
  const db = dbFixture();
  normalizeAccountingStore(db);
  const document = { id: "purchase-1", type: "purchase", status: "posted", posted: true, total: 100, lines: [] };
  upsertDocumentJournal(db, document);
  upsertDocumentJournal(db, { ...document, total: 125 });

  assert.equal(db.accounting.journals.length, 1);
  assert.equal(db.accounting.journals[0].debit, 125);
});
