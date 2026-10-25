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

test("recognizes common roll quantity abbreviations without inventing meters", () => {
  for (const line of ["2 rulo Soft Touch Bej", "Soft Touch Bej 3 r", "4 top Soft Touch Bej", "Soft Touch Bej 5 rl", "6 vr Soft Touch Bej"]) {
    const result = matchOrderLine(line, products);
    assert.equal(result.productId, 1, line);
    assert.equal(result.quantity, null, line);
    assert.equal(result.unit, "rulo", line);
    assert.ok(result.orderedRollCount > 0, line);
  }
});

test("recognizes meter and roll units written before the quantity", () => {
  for (const line of ["rulo 2 Soft Touch Bej", "Soft Touch Bej top 3", "rl: 4 Soft Touch Bej"]) {
    const result = matchOrderLine(line, products);
    assert.equal(result.productId, 1, line);
    assert.equal(result.quantity, null, line);
    assert.equal(result.unit, "rulo", line);
    assert.ok(result.orderedRollCount > 0, line);
  }

  for (const line of ["mt 30 Soft Touch Bej", "Soft Touch Bej metre 21", "m: 12,5 Soft Touch Bej"]) {
    const result = matchOrderLine(line, products);
    assert.equal(result.productId, 1, line);
    assert.equal(result.unit, "mt", line);
    assert.ok(result.quantity > 0, line);
  }
});

test("keeps meter and roll quantities independently wherever they appear", () => {
  for (const line of [
    "2 rulo 30 mt Soft Touch Bej",
    "rulo 2 Soft Touch Bej mt 30",
    "30 mt Soft Touch Bej top 2",
  ]) {
    const result = matchOrderLine(line, products);
    assert.equal(result.productId, 1, line);
    assert.equal(result.quantity, 30, line);
    assert.equal(result.orderedRollCount, 2, line);
    assert.equal(result.needsReview, false, line);
  }
});

test("keeps unknown or incomplete lines for manual review", () => {
  const [unknown, missingMeters] = parseOrderText("32 bilinmeyen urun\nHG Beyaz Mat", products);
  assert.equal(unknown.productId, null);
  assert.equal(unknown.needsReview, true);
  assert.equal(missingMeters.quantity, null);
  assert.equal(missingMeters.needsReview, true);
});

test("treats -1 as a line note instead of one meter", () => {
  const result = matchOrderLine("HG Beyaz Mat -1 30m", products);
  assert.equal(result.productId, 2);
  assert.equal(result.quantity, 30);
  assert.equal(result.lineNote, "-1");
});

test("prefers a real -1 catalog variant when one exists", () => {
  const variants = [
    { id: 10, name: "HG Beyaz", code: "HG-01", type: "product", active: true },
    { id: 11, name: "HG Beyaz -1", code: "HG-01-1", type: "product", active: true },
  ];
  const result = matchOrderLine("HG Beyaz -1 20m", variants);
  assert.equal(result.productId, 11);
  assert.equal(result.lineNote, "");
});

test("custom aliases override built-in aliases", () => {
  const variants = [
    { id: 20, name: "Folyo Satin Beyaz", code: "SAT", type: "product", active: true },
    { id: 21, name: "Folyo Metalik Beyaz", code: "MET", type: "product", active: true },
  ];
  const result = matchOrderLine("fs beyaz 10m", variants, [{ trigger: "fs", replacement: "folyo metalik" }]);
  assert.equal(result.productId, 21);
});

test("matches a small spelling error but flags close alternatives", () => {
  const result = matchOrderLine("soft tac bej 21m", products);
  assert.equal(result.productId, 1);
  assert.equal(result.quantity, 21);
});

test("matches a one-letter color typo to the closest product", () => {
  const result = matchOrderLine("HG Beyas 30m", products);
  assert.equal(result.productId, 2);
  assert.equal(result.quantity, 30);
});

test("matches FS Beyaz to the normal catalog variant unless -1 is requested", () => {
  const normal = matchOrderLine("fs beyaz 10m", defaultOrderCatalog);
  const variant = matchOrderLine("fs beyaz -1 10m", defaultOrderCatalog);
  assert.equal(normal.productCode, "ERSA 010");
  assert.equal(normal.productId, 5);
  assert.equal(variant.productCode, "ERSA 010-1");
  assert.equal(variant.productId, 6);
});

test("matches joined color words against separated catalog words", () => {
  const joined = matchOrderLine("fs kumbeji 10m", defaultOrderCatalog);
  const colorOnly = matchOrderLine("kumbeji 10m", defaultOrderCatalog);
  const typo = matchOrderLine("fs kumbaji 10m", defaultOrderCatalog);
  assert.equal(joined.productCode, "ERSA 014");
  assert.equal(colorOnly.productCode, "ERSA 014");
  assert.equal(typo.productCode, "ERSA 014");
  assert.equal(joined.needsReview, false);
  assert.equal(colorOnly.needsReview, false);
});

test("splits joined abbreviations and normalizes common color compounds", () => {
  const joinedWhite = matchOrderLine("fsbeyaz 30m", defaultOrderCatalog);
  const hyphenWhite = matchOrderLine("FS-BEYAZ 30", defaultOrderCatalog);
  const joinedSand = matchOrderLine("FSKUMBEJI 25", defaultOrderCatalog);
  assert.equal(joinedWhite.productCode, "ERSA 010");
  assert.equal(hyphenWhite.productCode, "ERSA 010");
  assert.equal(joinedSand.productCode, "ERSA 014");
  assert.equal(joinedWhite.needsReview, false);
  assert.equal(joinedSand.needsReview, false);
});

test("official order catalog contains the supplied 108 products", () => {
  assert.equal(defaultOrderCatalog.length, 108);
  assert.deepEqual(defaultOrderCatalog.find((item) => item.code === "ERSA 528"), {
    id: 82, name: "Soft Touch Bej", code: "ERSA 528", sku: "ERSA 528", unit: "mt", type: "product", active: true,
  });
});
