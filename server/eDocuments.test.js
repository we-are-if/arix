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
  queueMockEDocument,
  resolveEDocumentSupplier,
  resolveEDocumentPlan,
  resolveSourceDocumentLock,
  testEDocumentConnection,
  syncMockEDocumentStatuses,
  validateEDocumentForSending,
} from "./eDocuments.js";

test("moves mock documents from queued to accepted during status sync", () => {
  const document = { id: "doc-1", status: "draft" };
  queueMockEDocument(document, "2026-10-13T10:00:00.000Z");
  assert.equal(document.status, "processing");
  assert.equal(document.providerResponse.code, "MOCK_QUEUED");

  const db = { eDocuments: { documents: [document], lastSyncAt: null } };
  const updated = syncMockEDocumentStatuses(db, "2026-10-13T10:01:00.000Z");
  assert.equal(updated, 1);
  assert.equal(document.status, "completed");
  assert.equal(document.providerResponse.code, "MOCK_ACCEPTED");
  assert.equal(db.eDocuments.lastSyncAt, "2026-10-13T10:01:00.000Z");
});

test("normalizes provider settings and document series", () => {
  const settings = normalizeEDocumentSettings({
    provider: "unknown",
    environment: "other",
    company: {
      taxNumber: "TR 123 456 7890",
      country: "fi",
      fax: "+90 212 000 00 00",
      website: "https://example.com",
      bankAccounts: [{ bank: "Test Bank", currency: "usd", iban: "TR 12 345" }],
    },
    series: { eInvoice: " ihr " },
    automation: { syncIntervalMinutes: 2 },
  });

  assert.equal(settings.provider, "mock");
  assert.equal(settings.environment, "test");
  assert.equal(settings.company.taxNumber, "1234567890");
  assert.equal(settings.company.country, "FI");
  assert.equal(settings.company.fax, "+90 212 000 00 00");
  assert.equal(settings.company.website, "https://example.com");
  assert.deepEqual(settings.company.bankAccounts, [{ bank: "Test Bank", currency: "USD", iban: "TR12345" }]);
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
  const draft = buildEDocumentDraft({ id: "edoc-1", sourceDocument: source, documentType: "eInvoice", relatedEDocumentIds: ["despatch-1", "despatch-1"] });

  source.lines[0].qty = 99;
  assert.equal(draft.status, "draft");
  assert.equal(draft.sourceDocumentId, "sale-1");
  assert.deepEqual(draft.relatedEDocumentIds, ["despatch-1"]);
  assert.equal(draft.snapshot.lines[0].quantity, 10);
  assert.equal(draft.snapshot.total, 120);
});

test("locks a sale only after an official e-document is processing or completed", () => {
  const documents = [
    { id: "draft", sourceDocumentId: "sale-1", documentType: "eDespatch", status: "draft", number: "IRS1" },
    { id: "failed", sourceDocumentId: "sale-1", documentType: "eInvoice", status: "failed", number: "FAT1" },
  ];
  assert.equal(resolveSourceDocumentLock(documents, "sale-1").locked, false);

  documents.push({ id: "sent", sourceDocumentId: "sale-1", documentType: "eDespatch", status: "completed", number: "IRS2" });
  const lock = resolveSourceDocumentLock(documents, "sale-1");
  assert.equal(lock.locked, true);
  assert.equal(lock.document.id, "sent");
  assert.match(lock.reason, /IRS2/);
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
  assert.deepEqual(invoicePlan.availableTypes, ["eInvoice", "eDespatch"]);

  const archivePlan = resolveEDocumentPlan(
    { id: "sale-local-archive", type: "sale", saleMode: "regular" },
    { eInvoiceRegistered: false },
  );
  assert.equal(archivePlan.recommendedType, "eArchive");
  assert.deepEqual(archivePlan.availableTypes, ["eArchive", "eDespatch"]);

  const registryWinsOverPreference = resolveEDocumentPlan(
    { id: "sale-registry-wins", type: "sale", counterpartyEDocumentPreference: "eArchive" },
    { eInvoiceRegistered: true },
  );
  assert.equal(registryWinsOverPreference.recommendedType, "eInvoice");
  assert.deepEqual(registryWinsOverPreference.availableTypes, ["eInvoice", "eDespatch"]);

  const unknownRecipientPlan = resolveEDocumentPlan(
    { id: "sale-registry-unknown", type: "sale" },
  );
  assert.equal(unknownRecipientPlan.recommendedType, "eArchive");
  assert.equal(unknownRecipientPlan.recipientStatus, "unknown");
  assert.deepEqual(unknownRecipientPlan.availableTypes, ["eArchive", "eDespatch"]);
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
      comment: "Teslimat kontrolünden sonra ödeme.",
      lines: [{ name: "Folyo", code: "ERSA 010", qty: 10, unit: "mt", price: 12, taxRate: 20 }],
      eDocumentSupplier: {
        title: "AriX Ltd.",
        taxNumber: "1234567890",
        taxOffice: "İstanbul",
        country: "TR",
        address: "Adres",
        city: "İstanbul",
        fax: "+90 212 000 00 00",
        website: "https://arix.example",
        bankAccounts: [{ bank: "Test Bank", currency: "TRY", iban: "TR001234" }],
      },
    },
  });
  draft.number = "EAR2026000000001";
  draft.uuid = "04e26a62-7c00-46d0-878c-6f7c60834525";
  draft.relatedDocuments = [{ documentType: "eDespatch", number: "IRS2026000000001", issueDate: "2026-10-09" }];

  const model = buildGibDocumentModel(draft);
  const qr = buildGibQrPayload(draft);
  const xml = buildUblTrXml(draft);
  assert.equal(model.profileId, "TEMELFATURA");
  assert.equal(model.note, "Teslimat kontrolünden sonra ödeme.");
  assert.equal(qr.no, draft.number);
  assert.equal(qr.ettn, draft.uuid);
  assert.equal(qr["kdvmatrah(20)"], "120.00");
  assert.match(xml, /<cbc:CustomizationID>TR1\.2<\/cbc:CustomizationID>/);
  assert.match(xml, /<cbc:ID>EAR2026000000001<\/cbc:ID>/);
  assert.match(xml, /<cbc:InvoicedQuantity unitCode="MTR">10<\/cbc:InvoicedQuantity>/);
  assert.match(xml, /<cbc:Note>Teslimat kontrolünden sonra ödeme\.<\/cbc:Note>/);
  assert.match(xml, /<cbc:WebsiteURI>https:\/\/arix\.example<\/cbc:WebsiteURI>/);
  assert.match(xml, /<cbc:Telefax>\+90 212 000 00 00<\/cbc:Telefax>/);
  assert.match(xml, /<cac:DespatchDocumentReference><cbc:ID>IRS2026000000001<\/cbc:ID>/);
  assert.match(xml, /<cac:PaymentMeans><cbc:PaymentMeansCode>42<\/cbc:PaymentMeansCode>/);
  const invoiceXslt = Buffer.from(xml.match(/<cbc:EmbeddedDocumentBinaryObject[^>]*>([^<]+)<\/cbc:EmbeddedDocumentBinaryObject>/)?.[1] ?? "", "base64").toString("utf8");
  assert.match(invoiceXslt, /<title>e-Belge<\/title>/);
});

test("fills legacy draft supplier details from current company settings before sending", () => {
  const settings = normalizeEDocumentSettings({
    company: {
      title: "Current Company Ltd.",
      taxNumber: "1234567890",
      taxOffice: "Halkalı",
      address: "Current address",
      city: "İstanbul",
      phone: "+90 212 000 00 00",
      email: "info@example.com",
      website: "https://example.com",
    },
  });
  const draft = buildEDocumentDraft({
    id: "legacy-draft",
    documentType: "eInvoice",
    sourceDocument: {
      id: "sale-legacy",
      counterpartyName: "Buyer Ltd.",
      counterpartyTaxNumber: "1111111111",
      lines: [{ name: "Folyo", qty: 1, unit: "mt", price: 10 }],
      eDocumentSupplier: { title: "", phone: "" },
    },
  });

  const supplier = resolveEDocumentSupplier(draft, settings);
  const model = buildGibDocumentModel(draft, settings);
  assert.equal(supplier.title, "Current Company Ltd.");
  assert.equal(model.supplier.phone, "+90 212 000 00 00");
  assert.equal(model.supplier.website, "https://example.com");
});

test("builds TEVKIFAT invoice totals and UBL withholding nodes", () => {
  const draft = buildEDocumentDraft({
    id: "edoc-withholding",
    documentType: "eInvoice",
    sourceDocument: {
      id: "sale-withholding",
      counterpartyName: "Tevkifatlı Alıcı",
      counterpartyTaxNumber: "1111111111",
      total: 110,
      taxTotal: 20,
      withholdingTotal: 10,
      lines: [{
        name: "Hizmet",
        code: "SRV-1",
        qty: 1,
        unit: "əd",
        price: 100,
        total: 100,
        taxRate: 20,
        taxAmount: 20,
        withholdingRate: 50,
        withholdingCode: "601",
        withholdingAmount: 10,
      }],
      eDocumentSupplier: {
        title: "AriX Ltd.", taxNumber: "1234567890", taxOffice: "İstanbul", country: "TR", address: "Adres", city: "İstanbul",
      },
    },
  });
  draft.number = "EAR2026000000002";
  draft.uuid = "14e26a62-7c00-46d0-878c-6f7c60834525";

  const model = buildGibDocumentModel(draft);
  const qr = buildGibQrPayload(draft);
  const xml = buildUblTrXml(draft);
  assert.equal(model.typeCode, "TEVKIFAT");
  assert.equal(model.totals.taxTotal, 20);
  assert.equal(model.totals.withholdingTotal, 10);
  assert.equal(model.totals.payable, 110);
  assert.equal(qr.kdvtevkifat, "10.00");
  assert.match(xml, /<cbc:InvoiceTypeCode>TEVKIFAT<\/cbc:InvoiceTypeCode>/);
  assert.match(xml, /<cac:WithholdingTaxTotal>/);
  assert.match(xml, /<cbc:TaxTypeCode>601<\/cbc:TaxTypeCode>/);
});

test("writes each domestic KDV exemption reason on its own invoice line", () => {
  const draft = buildEDocumentDraft({
    id: "edoc-exemption",
    documentType: "eInvoice",
    sourceDocument: {
      id: "sale-exemption",
      counterpartyName: "İstisnalı Alıcı",
      counterpartyTaxNumber: "1111111111",
      invoiceDetails: { typeCode: "AUTO" },
      lines: [
        { name: "Ardiye", qty: 1, unit: "əd", price: 100, taxRate: 0, taxExemptionCode: "242", taxExemptionReason: "17/4-ö Gümrüklü sahalarda ardiye" },
        { name: "Normal xidmət", qty: 1, unit: "əd", price: 100, taxRate: 20 },
      ],
    },
  });
  draft.number = "EAR2026000000003";
  draft.uuid = "24e26a62-7c00-46d0-878c-6f7c60834525";

  const model = buildGibDocumentModel(draft);
  const xml = buildUblTrXml(draft);
  assert.equal(model.typeCode, "ISTISNA");
  assert.equal(model.taxBreakdown.length, 2);
  assert.equal(model.lines[0].taxExemption.code, "242");
  assert.equal(model.lines[1].taxExemption, null);
  assert.equal((xml.match(/<cbc:TaxExemptionReasonCode>242<\/cbc:TaxExemptionReasonCode>/g) ?? []).length, 2);
});

test("keeps completed document supplier snapshot immutable", () => {
  const completed = {
    status: "completed",
    snapshot: { supplier: { title: "Original Company", phone: "111" } },
  };
  const supplier = resolveEDocumentSupplier(completed, {
    ...defaultEDocumentSettings,
    company: { ...defaultEDocumentSettings.company, title: "Changed Company", phone: "222" },
  });
  assert.equal(supplier.title, "Original Company");
  assert.equal(supplier.phone, "111");
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
  const despatchXslt = Buffer.from(xml.match(/<cbc:EmbeddedDocumentBinaryObject[^>]*>([^<]+)<\/cbc:EmbeddedDocumentBinaryObject>/)?.[1] ?? "", "base64").toString("utf8");
  assert.match(despatchXslt, /<title>e-İrsaliye<\/title>/);
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
