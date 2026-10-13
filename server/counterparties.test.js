import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCounterparty, validateCounterparty } from "./counterparties.js";

test("normalizes a Turkish current account card for accounting and e-documents", () => {
  const card = normalizeCounterparty({
    kind: "customer",
    name: "  Test Mobilya  ",
    taxId: "123 456 7890",
    countryCode: "tr",
    currency: "TRY",
    paymentTermDays: "30",
    eDocumentPreference: "eInvoice",
  });

  assert.equal(card.name, "Test Mobilya");
  assert.equal(card.taxId, "1234567890");
  assert.equal(card.countryCode, "TR");
  assert.equal(card.paymentTermDays, 30);
  assert.equal(card.eDocumentPreference, "auto");
  assert.equal(validateCounterparty(card), "");
});

test("keeps foreign tax identifiers and validates Turkish identity lengths", () => {
  const foreign = normalizeCounterparty({ kind: "supplier", name: "Global", countryCode: "CN", taxId: "CN-A12-9" });
  assert.equal(foreign.taxId, "CN-A12-9");
  assert.equal(validateCounterparty(foreign), "");

  const invalid = normalizeCounterparty({ name: "Eksik", countryCode: "TR", taxId: "123" });
  assert.match(validateCounterparty(invalid), /10.*11/);
});
