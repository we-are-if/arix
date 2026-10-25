import { copyFile, mkdir } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import readXlsxFile from "read-excel-file/node";
import { createSQLiteStateStore } from "../server/database.js";

const sourcePath = resolve(process.argv[2] || "");
const sourceDate = String(process.argv[3] || "").trim();
if (!sourcePath || !/^\d{4}-\d{2}-\d{2}$/.test(sourceDate)) {
  throw new Error("Kullanım: node scripts/import-stock-count.mjs <xlsx> <YYYY-MM-DD>");
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = join(root, "server", "data");
const store = createSQLiteStateStore({
  dataDir,
  jsonPath: join(dataDir, "db.json"),
  sqlitePath: join(dataDir, "arix.sqlite"),
});
await store.initialize({}, (value) => value);
const db = await store.read();
db.orderCatalog ??= [];
db.stockImportHistory ??= [];

const workbook = await readXlsxFile(sourcePath);
const sheet = Array.isArray(workbook?.[0]?.data) ? workbook[0].data : workbook;
const normalize = (value) => String(value ?? "").trim().toLocaleLowerCase("tr").replace(/\s+/g, " ");
const headerIndex = sheet.findIndex((row) => row.some((cell) => ["ürün kodu", "kod", "stok kodu", "sku"].includes(normalize(cell))));
if (headerIndex < 0) throw new Error("Ürün kodu başlığı bulunamadı.");
const headers = sheet[headerIndex].map(normalize);
const column = (...names) => headers.findIndex((header) => names.includes(header));
const codeColumn = column("kod", "kodu", "ürün kodu", "stok kodu", "sku");
const nameColumn = column("ürün adı", "ürün", "malzeme adı");
const meterColumn = column("fiziki mt", "stok mt", "metraj / mtül", "metraj / mtul", "metraj", "metre", "mt", "stok");
const rollColumn = column("rulo", "rulo sayısı", "rulo sayı", "rulon");
if (codeColumn < 0 || meterColumn < 0) throw new Error("Ürün kodu ve metraj sütunları bulunamadı.");

const rows = sheet.slice(headerIndex + 1)
  .filter((row) => row.some((cell) => cell !== null && cell !== ""))
  .map((row) => ({
    code: String(row[codeColumn] ?? "").trim(),
    name: nameColumn >= 0 ? String(row[nameColumn] ?? "").trim() : "",
    physicalQuantity: Number(row[meterColumn] ?? 0),
    rollCount: rollColumn >= 0 ? Number(row[rollColumn] ?? 0) : 0,
  }))
  .filter((row) => row.code);

const invalid = rows.filter((row) => !Number.isFinite(row.physicalQuantity) || !Number.isFinite(row.rollCount) || row.rollCount < 0);
if (invalid.length) throw new Error(`${invalid.length} geçersiz stok satırı bulundu.`);

const importedAt = new Date().toISOString();
const actor = "Arif Mahmud";
let created = 0;
for (const row of rows) {
  const normalizedCode = normalize(row.code);
  let product = db.orderCatalog.find((item) => [item.code, item.sku].some((value) => normalize(value) === normalizedCode));
  if (!product) {
    product = {
      id: db.orderCatalog.length ? Math.max(...db.orderCatalog.map((item) => Number(item.id) || 0)) + 1 : 1,
      name: row.name || row.code,
      code: row.code,
      sku: row.code,
      unit: "mt",
    };
    db.orderCatalog.push(product);
    created += 1;
  }
  product.physicalQuantity = row.physicalQuantity;
  product.rollCount = Math.trunc(row.rollCount);
  product.stockUpdatedAt = importedAt;
  product.stockUpdatedBy = actor;
  product.stockSourceDate = sourceDate;
  product.stockSourceName = basename(sourcePath);
}

const archiveDir = join(dataDir, "stock-imports");
await mkdir(archiveDir, { recursive: true });
const archivedFile = `${importedAt.replace(/[:.]/g, "-")}-${basename(sourcePath).replace(/[\\/:*?"<>|]/g, "_")}`;
await copyFile(sourcePath, join(archiveDir, archivedFile));
const history = {
  id: randomUUID(), sourceName: basename(sourcePath), sourceDate, archivedFile,
  importedAt, importedBy: actor, updated: rows.length, created,
};
db.stockImportHistory.unshift(history);
db.stockImportHistory = db.stockImportHistory.slice(0, 100);
await store.write(db);
store.close();
console.log(JSON.stringify(history));
