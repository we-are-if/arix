import test from "node:test";
import assert from "node:assert/strict";
import { matchOrderLine, parseOrderText } from "./orderMatching.js";
import { defaultOrderCatalog } from "./orderCatalog.js";

const products = [
  { id: 1, name: "Soft Touch Bej", code: "00258", sku: "ERSA 528", type: "product", active: true },
  { id: 2, name: "HG Beyaz Mat", code: "TEST-002", sku: "ARIX-002", type: "product", active: true },
];

test("matches an order by SKU and extracts leading meters", () => {
  const result = matchOrderLine("30 mt ERSA 528", products);
  assert.equal(result.productId, 1);
  assert.equal(result.quantity, 30);
  assert.equal(result.needsReview, false);
});

test("matches tolerant product names and trailing meters", () => {
  const result = matchOrderLine("soft tac bej 21m", products);
  assert.equal(result.productId, 1);
  assert.equal(result.quantity, 21);
});

test("keeps unknown or incomplete lines for manual review", () => {
  const [unknown, missingMeters] = parseOrderText("32 bilinmeyen urun\nHG Beyaz Mat", products);
  assert.equal(unknown.productId, null);
  assert.equal(unknown.needsReview, true);
  assert.equal(missingMeters.quantity, null);
  assert.equal(missingMeters.needsReview, true);
});

test("official order catalog contains the supplied 108 products", () => {
  assert.equal(defaultOrderCatalog.length, 108);
  assert.deepEqual(defaultOrderCatalog.find((item) => item.code === "ERSA 528"), {
    id: 82, name: "Soft Touch Bej", code: "ERSA 528", sku: "ERSA 528", unit: "mt", type: "product", active: true,
  });
});
