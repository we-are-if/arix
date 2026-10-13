import test from "node:test";
import assert from "node:assert/strict";
import { applyRegistryToCounterparties, lookupEDocumentRegistry, parseEDocumentRegistry } from "./eInvoiceRegistry.js";

test("imports and groups official-style XML registry aliases", () => {
  const entries = parseEDocumentRegistry(`<?xml version="1.0"?><UserList><User><Identifier>1234567890</Identifier><Alias>urn:mail:defaultpk@test</Alias><Title>TEST A.S.</Title><Type>OZEL</Type></User><User><Identifier>1234567890</Identifier><Alias>urn:mail:sube@test</Alias></User></UserList>`, "xml");
  assert.equal(entries.length, 1);
  assert.deepEqual(entries[0].aliases, ["urn:mail:defaultpk@test", "urn:mail:sube@test"]);
  assert.equal(entries[0].title, "TEST A.S.");
});

test("imports CSV and marks matching and missing customers", () => {
  const entries = parseEDocumentRegistry("Vergi Numarası;Etiket;Unvan\n1234567890;urn:mail:pk@test;KAYITLI\n", "csv");
  const registry = { entries, importedAt: "2026-10-13T10:00:00.000Z" };
  assert.equal(lookupEDocumentRegistry(registry, "1234567890").registered, true);
  assert.equal(lookupEDocumentRegistry(registry, "1111111111").registered, false);
  const cards = applyRegistryToCounterparties([
    { id: 1, kind: "customer", taxId: "1234567890" },
    { id: 2, kind: "customer", taxId: "1111111111" },
  ], registry);
  assert.equal(cards[0].eInvoiceRegistered, true);
  assert.equal(cards[1].eInvoiceRegistered, false);
});
