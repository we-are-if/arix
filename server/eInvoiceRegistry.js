import { XMLParser } from "fast-xml-parser";

const digits = (value) => String(value ?? "").replace(/\D/g, "");
const clean = (value) => String(value ?? "").trim();
const keyOf = (value) => String(value).replace(/[^a-z0-9]/gi, "").toLowerCase();

function valueFor(record, names) {
  const wanted = new Set(names.map(keyOf));
  for (const [key, value] of Object.entries(record ?? {})) {
    if (wanted.has(keyOf(key)) && typeof value !== "object") return clean(value);
  }
  return "";
}

function parseCsvRows(content) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const delimiter = (content.split(/\r?\n/, 1)[0].match(/;/g) ?? []).length >= (content.split(/\r?\n/, 1)[0].match(/,/g) ?? []).length ? ";" : ",";
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    if (char === '"' && quoted && content[index + 1] === '"') {
      field += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) {
      row.push(field);
      field = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && content[index + 1] === "\n") index += 1;
      row.push(field);
      if (row.some((value) => clean(value))) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((value) => clean(value))) rows.push(row);
  }
  if (rows.length < 2) return [];
  const headers = rows[0].map(clean);
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

function collectXmlRecords(value, records = []) {
  if (Array.isArray(value)) {
    value.forEach((item) => collectXmlRecords(item, records));
    return records;
  }
  if (!value || typeof value !== "object") return records;
  const keys = Object.keys(value).map(keyOf);
  if (keys.some((key) => ["identifier", "vkntckn", "vkn", "tckn", "verginumarasi"].includes(key))) records.push(value);
  Object.values(value).forEach((item) => collectXmlRecords(item, records));
  return records;
}

function normalizeRecord(record) {
  const taxNumber = digits(valueFor(record, ["Identifier", "VKN_TCKN", "VKN", "TCKN", "Vergi Numarası", "VergiNo"]));
  if (![10, 11].includes(taxNumber.length)) return null;
  return {
    taxNumber,
    alias: valueFor(record, ["Alias", "Etiket", "PostaKutusuEtiketi", "PKAlias", "GBEtiketi"]),
    title: valueFor(record, ["Title", "Unvan", "Ünvan", "Ad Soyad", "Name"]),
    type: valueFor(record, ["Type", "Tip"]),
    registeredAt: valueFor(record, ["FirstCreationTime", "Kayıt Zamanı", "KayitZamani", "RegisteredAt"]),
  };
}

export function parseEDocumentRegistry(content, format) {
  const source = String(content ?? "").replace(/^\uFEFF/, "");
  const normalizedFormat = String(format ?? "").toLowerCase() === "csv" ? "csv" : "xml";
  const records = normalizedFormat === "csv"
    ? parseCsvRows(source)
    : collectXmlRecords(new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", trimValues: true }).parse(source));
  const byTaxNumber = new Map();
  for (const sourceRecord of records) {
    const record = normalizeRecord(sourceRecord);
    if (!record) continue;
    const existing = byTaxNumber.get(record.taxNumber) ?? { ...record, aliases: [] };
    if (record.alias && !existing.aliases.includes(record.alias)) existing.aliases.push(record.alias);
    if (!existing.title && record.title) existing.title = record.title;
    if (!existing.type && record.type) existing.type = record.type;
    if (!existing.registeredAt && record.registeredAt) existing.registeredAt = record.registeredAt;
    delete existing.alias;
    byTaxNumber.set(record.taxNumber, existing);
  }
  return [...byTaxNumber.values()].sort((a, b) => a.taxNumber.localeCompare(b.taxNumber));
}

export function registryOverview(registry = {}) {
  return {
    count: Array.isArray(registry.entries) ? registry.entries.length : 0,
    importedAt: registry.importedAt ?? null,
    sourceName: registry.sourceName ?? "",
    format: registry.format ?? "",
  };
}

export function lookupEDocumentRegistry(registry, taxNumber) {
  const normalized = digits(taxNumber);
  if (![10, 11].includes(normalized.length) || !Array.isArray(registry?.entries) || registry.entries.length === 0) {
    return { checked: false, registered: null, entry: null };
  }
  const entry = registry.entries.find((item) => item.taxNumber === normalized) ?? null;
  return { checked: true, registered: Boolean(entry), entry };
}

export function applyRegistryToCounterparties(counterparties, registry) {
  return (counterparties ?? []).map((counterparty) => {
    if (counterparty.kind !== "customer") return counterparty;
    const result = lookupEDocumentRegistry(registry, counterparty.taxId);
    if (!result.checked) return counterparty;
    return {
      ...counterparty,
      eDocumentPreference: "auto",
      eInvoiceRegistered: result.registered,
      eInvoiceAliases: result.entry?.aliases ?? [],
      eInvoiceTitle: result.entry?.title ?? "",
      eInvoiceRegistryCheckedAt: registry.importedAt,
    };
  });
}
