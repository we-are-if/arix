import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEDocumentDraft,
  credentialStatus,
  defaultEDocumentSettings,
  normalizeEDocumentSettings,
  testEDocumentConnection,
} from "./eDocuments.js";

test("normalizes provider settings and document series", () => {
  const settings = normalizeEDocumentSettings({
    provider: "unknown",
    environment: "other",
    company: { taxNumber: "TR 123 456 7890", country: "fi" },
    series: { eInvoice: " ihr " },
    automation: { syncIntervalMinutes: 2 },
  });

  assert.equal(settings.provider, "mock");
  assert.equal(settings.environment, "test");
  assert.equal(settings.company.taxNumber, "1234567890");
  assert.equal(settings.company.country, "FI");
  assert.equal(settings.series.eInvoice, "IHR");
  assert.equal(settings.automation.syncIntervalMinutes, 5);
});

test("never persists provider credentials in settings", () => {
  const settings = normalizeEDocumentSettings({
    ...defaultEDocumentSettings,
    provider: "izibiz",
    username: "should-not-survive",
    password: "should-not-survive",
  });

  assert.equal("username" in settings, false);
  assert.equal("password" in settings, false);
  assert.equal(credentialStatus(settings, {}).configured, false);
});

test("mock connection is ready without external credentials", () => {
  const result = testEDocumentConnection(defaultEDocumentSettings, {});
  assert.equal(result.ok, true);
  assert.equal(result.code, "MOCK_READY");
});

test("builds an immutable e-document snapshot from a sale", () => {
  const source = {
    id: "sale-1",
    createdAt: "2026-10-08T10:00:00.000Z",
    counterpartyName: "Test Müştəri",
    currency: "TRY",
    total: 120,
    lines: [{ productId: 7, name: "Folyo", qty: 10, unit: "mt", price: 12 }],
  };
  const draft = buildEDocumentDraft({ id: "edoc-1", sourceDocument: source, documentType: "eInvoice" });

  source.lines[0].qty = 99;
  assert.equal(draft.status, "draft");
  assert.equal(draft.sourceDocumentId, "sale-1");
  assert.equal(draft.snapshot.lines[0].quantity, 10);
  assert.equal(draft.snapshot.total, 120);
});
