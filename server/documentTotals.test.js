import test from "node:test";
import assert from "node:assert/strict";
import { calculateDocumentTotals, normalizeDocumentFinancials, validateDocumentFinancials } from "./documentTotals.js";

test("calculates discount, KDV and withholding without capitalizing tax", () => {
  const totals = calculateDocumentTotals({
    type: "purchase",
    lines: [{ productId: 1, qty: 10, price: 100, discount: 100, taxRate: 20, withholdingRate: 50, withholdingCode: "601" }],
  });

  assert.equal(totals.subtotal, 1000);
  assert.equal(totals.discountTotal, 100);
  assert.equal(totals.taxExclusiveTotal, 900);
  assert.equal(totals.taxTotal, 180);
  assert.equal(totals.withholdingTotal, 90);
  assert.equal(totals.payableTotal, 990);
  assert.equal(totals.lines[0].total, 900);
});

test("forces export sales to zero KDV", () => {
  const totals = calculateDocumentTotals({
    type: "sale",
    saleMode: "export",
    lines: [{ qty: 5, price: 20, taxRate: 20 }],
  });

  assert.equal(totals.taxExclusiveTotal, 100);
  assert.equal(totals.taxTotal, 0);
  assert.equal(totals.payableTotal, 100);
});

test("normalizes payment summary and validates withholding code", () => {
  const document = {
    type: "sale",
    lines: [{ qty: 1, price: 120, taxRate: 20, withholdingRate: 50 }],
    paymentSummary: { paid: 50 },
  };
  normalizeDocumentFinancials({ products: [] }, document);

  assert.equal(document.total, 132);
  assert.equal(document.paymentSummary.remaining, 82);
  assert.match(validateDocumentFinancials(document), /3 rəqəmli GİB kodu/);
  document.lines[0].withholdingCode = "601";
  assert.equal(validateDocumentFinancials(document), "");
});
