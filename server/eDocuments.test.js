import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEDocumentDraft,
  buildGibComplianceReport,
  buildGibDocumentModel,
  buildGibQrPayload,
  buildUblTrXml,
  credentialStatus,
  defaultEDocumentSettings,
  normalizeEDocumentSettings,
  resolveEDocumentPlan,
  testEDocumentConnection,
  validateEDocumentForSending,
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

test("chooses export documents from sale mode and regular documents from customer status", () => {
  const exportPlan = resolveEDocumentPlan({ id: "sale-export", type: "sale", saleMode: "export" });
  assert.equal(exportPlan.recommendedType, "exportInvoice");
  assert.deepEqual(exportPlan.availableTypes, ["exportInvoice", "eDespatch"]);

  const invoicePlan = resolveEDocumentPlan(
    { id: "sale-local", type: "sale", saleMode: "regular" },
    { eInvoiceRegistered: true },
  );
  assert.equal(invoicePlan.recommendedType, "eInvoice");
});

test("blocks sending until company and recipient requirements are complete", () => {
  const source = {
    id: "sale-2",
    type: "sale",
    counterpartyName: "Test Alıcı",
    counterpartyTaxNumber: "1234567890",
    lines: [{ productId: 7, name: "Folyo", qty: 10, unit: "mt", price: 12 }],
  };
  const draft = buildEDocumentDraft({ id: "edoc-2", sourceDocument: source, documentType: "eInvoice" });
  const blocked = validateEDocumentForSending(draft, defaultEDocumentSettings, {});
  assert.equal(blocked.ready, false);
  assert.ok(blocked.issues.some((issue) => issue.includes("aktiv")));

  const ready = validateEDocumentForSending(draft, {
    ...defaultEDocumentSettings,
    enabled: true,
    company: { ...defaultEDocumentSettings.company, title: "AriX Ltd.", taxNumber: "1234567890", address: "İstanbul", city: "İstanbul" },
  }, {});
  assert.equal(ready.ready, false);
  draft.number = "EAR2026000000001";
  draft.uuid = "04e26a62-7c00-46d0-878c-6f7c60834525";
  assert.equal(validateEDocumentForSending(draft, {
    ...defaultEDocumentSettings,
    enabled: true,
    company: { ...defaultEDocumentSettings.company, title: "AriX Ltd.", taxNumber: "1234567890", address: "İstanbul", city: "İstanbul" },
  }, {}).ready, true);
});

test("builds GIB QR fields and UBL-TR invoice from the same snapshot", () => {
  const draft = buildEDocumentDraft({
    id: "edoc-gib",
    documentType: "eInvoice",
    sourceDocument: {
      id: "sale-gib",
      counterpartyName: "Alıcı AŞ",
      counterpartyTaxNumber: "1111111111",
      currency: "TRY",
      documentDate: "2026-10-09T09:30:00.000Z",
      lines: [{ name: "Folyo", code: "ERSA 010", qty: 10, unit: "mt", price: 12, taxRate: 20 }],
      eDocumentSupplier: { title: "AriX Ltd.", taxNumber: "1234567890", taxOffice: "İstanbul", country: "TR", address: "Adres", city: "İstanbul" },
    },
  });
  draft.number = "EAR2026000000001";
  draft.uuid = "04e26a62-7c00-46d0-878c-6f7c60834525";

  const model = buildGibDocumentModel(draft);
  const qr = buildGibQrPayload(draft);
  const xml = buildUblTrXml(draft);
  assert.equal(model.profileId, "TEMELFATURA");
  assert.equal(qr.no, draft.number);
  assert.equal(qr.ettn, draft.uuid);
  assert.equal(qr["kdvmatrah(20)"], "120.00");
  assert.match(xml, /<cbc:CustomizationID>TR1\.2<\/cbc:CustomizationID>/);
  assert.match(xml, /<cbc:ID>EAR2026000000001<\/cbc:ID>/);
  assert.match(xml, /<cbc:InvoicedQuantity unitCode="MTR">10<\/cbc:InvoicedQuantity>/);
});

test("builds e-İrsaliye QR shipment fields", () => {
  const draft = buildEDocumentDraft({
    id: "edoc-irs",
    documentType: "eDespatch",
    sourceDocument: {
      id: "sale-irs",
      saleMode: "export",
      counterpartyName: "Alıcı AŞ",
      counterpartyTaxNumber: "1111111111",
      shipment: { actualDespatchDate: "2026-10-09", actualDespatchTime: "15:30:00", carrierTaxNumber: "2222222222", carrierName: "Test Lojistik", plate: "34 abc 123", driverFirstName: "Ali", driverLastName: "Yılmaz", driverNationalId: "12345678901" },
      lines: [{ name: "Folyo", qty: 1, unit: "rulo" }],
    },
  });
  draft.number = "IRS2026000000001";
  draft.uuid = "04e26a62-7c00-46d0-878c-6f7c60834525";
  const qr = buildGibQrPayload(draft);
  assert.equal(qr.senaryo, "TEMELIRSALIYE");
  assert.equal(qr.avkntckn, "2222222222");
  assert.equal(qr.sevktarihi, "2026-10-09");
  assert.equal(qr.sevkzamani, "15:30:00");
  assert.equal(qr.plaka, "34ABC123");
  const model = buildGibDocumentModel(draft);
  const xml = buildUblTrXml(draft);
  assert.equal(model.customizationId, "TR1.2.1");
  assert.match(xml, /<cbc:CustomizationID>TR1\.2\.1<\/cbc:CustomizationID>/);
  assert.match(xml, /<cbc:LicensePlateID schemeID="PLAKA">34ABC123<\/cbc:LicensePlateID>/);
  assert.match(xml, /<cbc:NationalityID>12345678901<\/cbc:NationalityID>/);
  assert.match(xml, /<cbc:DocumentTypeCode>XSLT<\/cbc:DocumentTypeCode>/);
});

test("builds a customs export invoice with the official GIB scenario fields", () => {
  const draft = buildEDocumentDraft({
    id: "edoc-export",
    documentType: "exportInvoice",
    sourceDocument: {
      id: "sale-export",
      type: "sale",
      saleMode: "export",
      counterpartyName: "DOORKA LLC",
      counterpartyAddress: "Baku",
      counterpartyCountryCode: "AZ",
      counterpartyCountryName: "Azerbaijan",
      counterpartyCompanyId: "AZ-998877",
      currency: "USD",
      exchangeRate: 41.25,
      exportDetails: {
        incoterm: "FCA",
        transportModeCode: "3",
        packageTypeCode: "PX",
        packageId: "PALLET-1",
        packageQuantity: 2,
        deliveryAddress: "Baku / Azerbaijan",
        countryCode: "AZ",
        countryName: "Azerbaijan",
        city: "Baku",
        gtips: { 1: "391990809000" },
      },
      lines: [{ name: "Folyo", code: "ERSA 010", qty: 100, unit: "mt", price: 3.2, taxRate: 20, gtip: "391990809000" }],
      eDocumentSupplier: { title: "AriX Ltd.", taxNumber: "1234567890", taxOffice: "İstanbul", country: "TR", address: "Adres", city: "İstanbul" },
    },
  });
  draft.number = "IHR2026000000001";
  draft.uuid = "14e26a62-7c00-46d0-878c-6f7c60834525";

  const model = buildGibDocumentModel(draft);
  const qr = buildGibQrPayload(draft);
  const xml = buildUblTrXml(draft);
  const compliance = buildGibComplianceReport(draft);
  assert.equal(model.profileId, "IHRACAT");
  assert.equal(model.typeCode, "ISTISNA");
  assert.equal(model.totals.taxTotal, 0);
  assert.equal(qr.avkntckn, "1460415308");
  assert.match(xml, /<cbc:InvoiceTypeCode>ISTISNA<\/cbc:InvoiceTypeCode>/);
  assert.match(xml, /<cbc:TaxExemptionReasonCode>301<\/cbc:TaxExemptionReasonCode>/);
  assert.match(xml, /schemeID="PARTYTYPE">EXPORT/);
  assert.match(xml, /<cbc:RequiredCustomsID>391990809000<\/cbc:RequiredCustomsID>/);
  assert.match(xml, /schemeID="INCOTERMS">FCA/);
  assert.match(xml, /<cbc:CalculationRate>41\.25<\/cbc:CalculationRate>/);
  assert.equal(compliance.readyForSigning, true);
});
