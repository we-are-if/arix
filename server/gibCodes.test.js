import test from "node:test";
import assert from "node:assert/strict";
import { findTaxExemption, findWithholding, gibCodeCatalog } from "./gibCodes.js";

test("exposes the official UBL-TR code catalog used by document forms", () => {
  const catalog = gibCodeCatalog();
  assert.match(catalog.version, /v1\.43/);
  assert.match(findTaxExemption("242").name, /ardiye/);
  assert.equal(findWithholding("624").rate, 20);
  assert.ok(catalog.packageTypes.some((item) => item.code === "CN"));
  assert.ok(catalog.transportModes.some((item) => item.code === "3"));
});
