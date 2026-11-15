import assert from "node:assert/strict";
import { after, test } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const outputPath = join(tmpdir(), `arix-qaime-parser-${process.pid}.mjs`);
await build({
  entryPoints: ["daily-app/src/qaimeParser.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: outputPath,
  external: ["tesseract.js"],
  logLevel: "silent",
});

const {
  cleanCustomerCandidate,
  extractProductNameCandidates,
  extractProductNamesFromTsv,
  extractProductRowCandidates,
  extractProductRowsFromTsv,
  matchKnownCustomer,
  mergeProductNameCandidates,
  mergeProductRowCandidates,
  normalizeWarehouseName,
  parseCloudShopInvoiceText,
  reconcileSalesRowNumbers,
} = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);

after(async () => {
  await rm(outputPath, { force: true });
});

function compactRow(quantity, price, total, referencePrices = []) {
  const row = reconcileSalesRowNumbers(quantity, price, "0", total, referencePrices, true);
  return row ? { quantity: row.quantity, price: row.price, total: row.total } : null;
}

test("recovers a missing decimal separator from price without shrinking quantity", () => {
  assert.deepEqual(compactRow("5", "1400", "70,00", [13]), {
    quantity: 5,
    price: 14,
    total: 70,
  });
});

test("recovers decimal separators when OCR joins both price and row total", () => {
  assert.deepEqual(compactRow("5", "1400", "7000", [13]), {
    quantity: 5,
    price: 14,
    total: 70,
  });
});

test("does not divide high-value products like Kleiberit (380.00 AZN) when price already has decimals", () => {
  assert.deepEqual(compactRow("1", "380,00", "380,00", [12, 14, 16]), {
    quantity: 1,
    price: 380,
    total: 380,
  });
  assert.deepEqual(compactRow("1", "380.00", "380.00", [14]), {
    quantity: 1,
    price: 380,
    total: 380,
  });
});

test("keeps established quantity decimal recovery", () => {
  assert.deepEqual(compactRow("61", "12", "73,20"), {
    quantity: 6.1,
    price: 12,
    total: 73.2,
  });
  assert.deepEqual(compactRow("305", "12", "36,60"), {
    quantity: 3.05,
    price: 12,
    total: 36.6,
  });
});

test("recovers a single OCR digit error from a consistent price and row total", () => {
  assert.deepEqual(compactRow("6", "14,00", "70,00", [13]), {
    quantity: 5,
    price: 14,
    total: 70,
  });
});

test("normalizes safe OCR variants for customer and warehouse names", () => {
  assert.equal(normalizeWarehouseName("«Amana5»"), "ANAnas");
  assert.equal(
    cleanCustomerCandidate("Azər Zabrat, т.: +994 50 525 25 38"),
    "Azər Zabrat",
  );
  assert.equal(
    cleanCustomerCandidate("Rəşad Mebel, tel: +994 55 123 45 67"),
    "Rəşad Mebel",
  );
  assert.equal(
    matchKnownCustomer("Elgin Biləcəri", "", ["Elçin Biləcəri", "Elçin Xırdalan"]),
    "Elçin Biləcəri",
  );
  assert.equal(
    matchKnownCustomer("Güven Kapak, T.: +994 50 799 95 88", "", ["Güven Kapak"]),
    "Güven Kapak",
  );
  assert.equal(
    matchKnownCustomer("Azər Zabrat, т.: +994 50 525 25 38", "", ["Azər Zabrat", "Elçin Biləcəri"]),
    "Azər Zabrat",
  );
  assert.equal(
    matchKnownCustomer("Azer Zabrat, т.: +994 50 525 25 38", "", ["Azər Zabrat", "Elçin Biləcəri"]),
    "Azər Zabrat",
  );
  assert.equal(
    matchKnownCustomer("Yeni Müştəri, mob: 050 999 88 77", "", ["Azər Zabrat"]),
    "Yeni Müştəri",
  );
});

test("parses the reported invoice with the correct rows, customer and warehouse", () => {
  const source = `Расходная накладная №32626 от 02.11.2026
Поставщик: AzArt Membran Автор: Arif Mahmud
Покупатель: Güven Kapak, T.: +994 50 799 95 88
Склад: «Amana5»
№ Наименование Арт. Ед. изм. Кол-во Цена Сумма
1 Oak Endgrain Cognac ES 2702 metr 3 13,00 39,00
2 Sandy Foggi Grey ES 00250 metr 5 1400 70,00
ИТОГО: 109,00`;
  const parsed = parseCloudShopInvoiceText(source, ["Güven Kapak", "Elçin Biləcəri"]);

  assert.equal(parsed.matchedCustomer, "Güven Kapak");
  assert.equal(parsed.warehouse, "ANAnas");
  assert.equal(parsed.salesAmount, 109);
  assert.equal(parsed.verified, true);
  assert.deepEqual(
    parsed.items.map(({ name, quantity, price, total }) => ({ name, quantity, price, total })),
    [
      { name: "Oak Endgrain Cognac", quantity: 3, price: 13, total: 39 },
      { name: "Sandy Foggi Grey", quantity: 5, price: 14, total: 70 },
    ],
  );
  assert.match(parsed.verificationNote, /onluq işarəsi 1 məhsul sətrində/);
});

test("parses the alternate single-column OCR spelling", () => {
  const source = `Расходная накладная №32626 от 02.11.2026
Поставщик: AzArt Membran Автор: Arif Mahmud
Tlokynarenb: Güven Kapak, T.: +994 50 799 95 88
Склад: «ANAnas»
1 | Oak Endgrain Cognac ES 2702 metr 3) 13,00 39,00
2 | Sandy Foggi Grey ES00250 | тег 6) 14,00 70,00
итого: 109,00`;
  const parsed = parseCloudShopInvoiceText(source, ["Güven Kapak"]);

  assert.equal(parsed.matchedCustomer, "Güven Kapak");
  assert.equal(parsed.salesAmount, 109);
  assert.equal(parsed.verified, true);
  assert.deepEqual(
    parsed.items.map(({ name, code, quantity, price, total }) => ({ name, code, quantity, price, total })),
    [
      { name: "Oak Endgrain Cognac", code: "ES 2702", quantity: 3, price: 13, total: 39 },
      { name: "Sandy Foggi Grey", code: "ES 00250", quantity: 5, price: 14, total: 70 },
    ],
  );
});

test("removes OCR quotes and row numbers while keeping article codes separate", () => {
  const source = `Расходная накладная №32626 от 02.11.2026
Покупатель: Güven Kapak, T.: +994 50 799 95 88
Склад: «ANAnas»
'1 'Oak Endgrain Cognac ' ES 2702 \`\` metr 3 13,00 39,00
"2 Sandy Foggi Grey "ES00250 mew ' 5 14,00 70,00
ИТОГО: 109,00`;
  const parsed = parseCloudShopInvoiceText(source, ["Güven Kapak"]);

  assert.deepEqual(
    parsed.items.map(({ name, code, quantity, price, total }) => ({ name, code, quantity, price, total })),
    [
      { name: "Oak Endgrain Cognac", code: "ES 2702", quantity: 3, price: 13, total: 39 },
      { name: "Sandy Foggi Grey", code: "ES 00250", quantity: 5, price: 14, total: 70 },
    ],
  );
});

test("recovers product names from sparse table OCR coordinates", () => {
  const tsv = `1\t1\t0\t0\t0\t0\t0\t0\t700\t300\t-1\t
5\t1\t1\t1\t1\t1\t20\t120\t10\t8\t90\t№
5\t1\t1\t1\t1\t2\t50\t120\t100\t8\t90\tНаименование
5\t1\t2\t1\t1\t1\t20\t145\t5\t8\t90\t1
5\t1\t2\t1\t1\t2\t48\t145\t25\t8\t90\t[Ook
5\t1\t2\t1\t1\t3\t78\t145\t55\t8\t90\tEndgran
5\t1\t2\t1\t1\t4\t138\t145\t45\t8\t90\tCognac.
5\t1\t2\t1\t1\t5\t565\t145\t25\t8\t90\t1300
5\t1\t2\t1\t1\t6\t620\t145\t25\t8\t90\t3900
5\t1\t3\t1\t1\t1\t20\t165\t5\t8\t90\t2
5\t1\t3\t1\t1\t2\t48\t165\t35\t8\t90\tSandy
5\t1\t3\t1\t1\t3\t88\t165\t30\t8\t90\tFogg
5\t1\t3\t1\t1\t4\t123\t165\t28\t8\t90\tGrey
5\t1\t3\t1\t1\t5\t565\t165\t25\t8\t90\t1400
5\t1\t3\t1\t1\t6\t620\t165\t25\t8\t90\t7000`;

  const names = extractProductNamesFromTsv(tsv);
  assert.deepEqual(names, ["Ook Endgran Cognac", "Sandy Fogg Grey"]);
  const markedText = names.map((name) => `ARIX_PRODUCT_NAME: ${name}`).join("\n");
  assert.deepEqual(extractProductNameCandidates(markedText), names);

  const items = [
    { no: 1, name: "Məhsul 1", code: "ES 2702", unit: "metr", quantity: 3, price: 13, discount: 0, total: 39 },
    { no: 2, name: "Məhsul 2", code: "ES 00250", unit: "metr", quantity: 5, price: 14, discount: 0, total: 70 },
  ];
  assert.deepEqual(
    mergeProductNameCandidates(items, names, ["Oak Endgrain Cognac", "Sandy Foggi Grey"]).map((item) => item.name),
    ["Oak Endgrain Cognac", "Sandy Foggi Grey"],
  );
});

test("keeps product names and article codes paired by their table row", () => {
  const tsv = `1\t1\t0\t0\t0\t0\t0\t0\t1200\t500\t-1\t
5\t1\t1\t1\t1\t1\t35\t120\t20\t10\t90\t№
5\t1\t1\t1\t1\t2\t85\t120\t200\t10\t90\tНаименование
5\t1\t1\t1\t1\t3\t650\t120\t50\t10\t90\tАрт.
5\t1\t2\t1\t1\t1\t40\t150\t10\t10\t90\t1
5\t1\t2\t1\t1\t2\t90\t150\t55\t10\t90\tFolyolu
5\t1\t2\t1\t1\t3\t150\t150\t45\t10\t90\tSaten
5\t1\t2\t1\t1\t4\t200\t150\t45\t10\t90\tVizon
5\t1\t2\t1\t1\t5\t250\t150\t30\t10\t90\tBej
5\t1\t2\t1\t1\t6\t650\t150\t20\t10\t90\tES
5\t1\t2\t1\t1\t7\t675\t150\t18\t10\t90\tFL
5\t1\t2\t1\t1\t8\t698\t150\t45\t10\t90\t014-1
5\t1\t2\t1\t1\t9\t930\t150\t20\t10\t90\t3.1
5\t1\t2\t1\t1\t10\t1000\t150\t30\t10\t90\t12,00
5\t1\t2\t1\t1\t11\t1100\t150\t35\t10\t90\t37,20`;

  assert.deepEqual(extractProductRowsFromTsv(tsv), [
    { name: "Folyolu Saten Vizon Bej", code: "ES FL 014-1" },
  ]);
  const marked = `ARIX_PRODUCT_ROW: ${JSON.stringify({ name: "Folyolu Saten Vizon Bej", code: "ES FL 014-1" })}`;
  assert.deepEqual(extractProductRowCandidates(marked), [
    { name: "Folyolu Saten Vizon Bej", code: "ES FL 014-1" },
  ]);

  const original = [{ no: 1, name: "Folyolu Saten Vizon Bej ` E", code: "SFL0014", unit: "metr", quantity: 3.1, price: 12, discount: 0, total: 37.2 }];
  assert.deepEqual(mergeProductRowCandidates(original, extractProductRowsFromTsv(tsv))[0], {
    ...original[0],
    name: "Folyolu Saten Vizon Bej",
    code: "ES FL 014-1",
  });
});

test("parses the 14-row invoice without changing any quantity, price or amount", () => {
  const source = `Расходная накладная №32632 от 02.11.2026
Поставщик: AzArt Membran Автор: Arif Mahmud
Покупатель: Kapakçı MMC (Fuad)
Склад: «ANAnas»
№ Наименование Арт. Ед. изм. Кол-во Цена Сумма
1 Süper Mat Metalik Mavi ES SM 0263 metr 1 16,00 16,00
2 Soft Touch Krem ERSA 501 metr 13.8 16,00 220,80
3 Oak Endgrain Cognac ES 2702 metr 16.5 13,00 214,50
4 Folyolu Saten Vizon Bej ES FL 014-1 metr 3.1 12,00 37,20
5 Bute Beyaz ES 10111 metr 3.1 11,00 34,10
6 Folyolu Sandy Marin Yeşili ES FL 00280 metr 6.2 15,00 93,00
7 Süper Mat Mavi ES SM 0264 metr 9.9 16,00 158,40
8 Folyolu Saten Aytaşı ES FL 013-1 metr 15.5 12,00 186,00
9 Soft Fildişi Folyolu* C1863 metr 10.6 15,00 159,00
10 Folyolu Sandy Green ES FL 00230 metr 9.9 15,00 148,50
11 Folyolu Saten Koyu Yeşil ES FL 031-1 metr 2.2 12,00 26,40
12 3D Beyaz ES 20000 metr 1.8 11,00 19,80
13 Soft Vizon Folyolu* C1856 metr 1.1 15,00 16,50
14 HG Galaxy Krem ES HG 302 metr 4.3 16,00 68,80
ИТОГО: 1 399,00`;
  const parsed = parseCloudShopInvoiceText(source, ["Kapakçı MMC (Fuad)"]);

  assert.equal(parsed.verified, true);
  assert.equal(parsed.salesAmount, 1399);
  assert.equal(parsed.items.length, 14);
  assert.deepEqual(parsed.items.map(({ name, code }) => ({ name, code })), [
    { name: "Süper Mat Metalik Mavi", code: "ES SM 0263" },
    { name: "Soft Touch Krem", code: "ERSA 501" },
    { name: "Oak Endgrain Cognac", code: "ES 2702" },
    { name: "Folyolu Saten Vizon Bej", code: "ES FL 014-1" },
    { name: "Bute Beyaz", code: "ES 10111" },
    { name: "Folyolu Sandy Marin Yeşili", code: "ES FL 00280" },
    { name: "Süper Mat Mavi", code: "ES SM 0264" },
    { name: "Folyolu Saten Aytaşı", code: "ES FL 013-1" },
    { name: "Soft Fildişi Folyolu*", code: "C1863" },
    { name: "Folyolu Sandy Green", code: "ES FL 00230" },
    { name: "Folyolu Saten Koyu Yeşil", code: "ES FL 031-1" },
    { name: "3D Beyaz", code: "ES 20000" },
    { name: "Soft Vizon Folyolu*", code: "C1856" },
    { name: "HG Galaxy Krem", code: "ES HG 302" },
  ]);
  assert.deepEqual(parsed.items.map(({ quantity, price, total }) => ({ quantity, price, total })), [
    { quantity: 1, price: 16, total: 16 },
    { quantity: 13.8, price: 16, total: 220.8 },
    { quantity: 16.5, price: 13, total: 214.5 },
    { quantity: 3.1, price: 12, total: 37.2 },
    { quantity: 3.1, price: 11, total: 34.1 },
    { quantity: 6.2, price: 15, total: 93 },
    { quantity: 9.9, price: 16, total: 158.4 },
    { quantity: 15.5, price: 12, total: 186 },
    { quantity: 10.6, price: 15, total: 159 },
    { quantity: 9.9, price: 15, total: 148.5 },
    { quantity: 2.2, price: 12, total: 26.4 },
    { quantity: 1.8, price: 11, total: 19.8 },
    { quantity: 1.1, price: 15, total: 16.5 },
    { quantity: 4.3, price: 16, total: 68.8 },
  ]);
});

const HEAD = `Расходная накладная №1 от 02.11.2026\nПокупатель: Güven Kapak\n`;
const rows = (parsed) => parsed.items.map(({ quantity, price, total }) => ({ quantity, price, total }));

test("reads space-separated thousands in row and footer totals", () => {
  const parsed = parseCloudShopInvoiceText(
    HEAD + `1 Oak Cognac ES 2702 metr 100 13,00 1 300,00\n2 Sandy Grey ES 250 metr 5 14,00 70,00\nИТОГО: 1 370,00`,
    ["Güven Kapak"],
  );
  assert.deepEqual(rows(parsed), [
    { quantity: 100, price: 13, total: 1300 },
    { quantity: 5, price: 14, total: 70 },
  ]);
  assert.equal(parsed.salesAmount, 1370);
  assert.equal(parsed.verified, true);
});

test("reads dot-separated thousands", () => {
  const parsed = parseCloudShopInvoiceText(
    HEAD + `1 Oak Cognac ES 2702 metr 100 13,00 1.300,00\nИТОГО: 1.300,00`,
    ["Güven Kapak"],
  );
  assert.deepEqual(rows(parsed), [{ quantity: 100, price: 13, total: 1300 }]);
  assert.equal(parsed.salesAmount, 1300);
  assert.equal(parsed.verified, true);
});

test("does not glue the quantity total onto the footer amount", () => {
  const parsed = parseCloudShopInvoiceText(
    HEAD + `1 Oak Cognac ES 2702 metr 3 13,00 39,00\n2 Sandy Grey ES 250 metr 5 14,00 70,00\nИТОГО: 8 109,00`,
    ["Güven Kapak"],
  );
  assert.equal(parsed.salesAmount, 109);
  assert.equal(parsed.verified, true);
});

test("never marks a document verified without a footer total", () => {
  const twoRows = parseCloudShopInvoiceText(
    HEAD + `1 Oak Cognac ES 2702 metr 3 13,00 39,00\n2 Sandy Grey ES 250 metr 5 14,00 70,00`,
    ["Güven Kapak"],
  );
  assert.equal(twoRows.salesAmount, 109);
  assert.equal(twoRows.verified, false);

  const oneRow = parseCloudShopInvoiceText(HEAD + `1 Oak Cognac ES 2702 metr 3 13,00 39,00`, ["Güven Kapak"]);
  assert.equal(oneRow.verified, false);
});

test("digit recovery never invents fractional-qəpik prices", () => {
  const row = compactRow("13", "100", "300,00");
  assert.ok(row);
  assert.equal(Math.round(row.price * 100), row.price * 100);
  assert.notEqual(row.price, 23.0769);
});

test("detects correct units for Tac (ədəd), Dişbudak (metr), and liquids (litr)", () => {
  const text = HEAD + `4 Dişbudak ES 00810 metr 3.1 12,00 37,20\n5 Dişbudak 2 ES EC 00810 metr 12.4 12,00 148,80\n6 Tac T0959 ədəd 2 10,00 20,00\nИТОГО 206,00`;
  const parsed = parseCloudShopInvoiceText(text, ["Güven Kapak"]);
  assert.equal(parsed.items.length, 3);
  assert.equal(parsed.items[0].name, "Dişbudak");
  assert.equal(parsed.items[0].unit, "metr");
  assert.equal(parsed.items[1].name, "Dişbudak 2");
  assert.equal(parsed.items[1].unit, "metr");
  assert.equal(parsed.items[2].name, "Tac");
  assert.equal(parsed.items[2].code, "T0959");
  assert.equal(parsed.items[2].unit, "ədəd");
  assert.equal(parsed.items[2].quantity, 2);
  assert.equal(parsed.verified, true);
});

test("parses Oak Endgrain Cognac ES 2702 and Bute Beyaz ES 10111 without column/code shift", () => {
  const text = HEAD + `1 Oak Endgrain Cognac ES 2702 metr 5.05 13,00 65,65\n2 Bute Beyaz ES 10111 metr 4.35 11,00 47,85\nИТОГО 113,50`;
  const parsed = parseCloudShopInvoiceText(text, ["Güven Kapak"]);
  assert.equal(parsed.items.length, 2);

  const item1 = parsed.items[0];
  assert.equal(item1.name, "Oak Endgrain Cognac");
  assert.equal(item1.code, "ES 2702");
  assert.equal(item1.unit, "metr");
  assert.equal(item1.quantity, 5.05);
  assert.equal(item1.price, 13);
  assert.equal(item1.total, 65.65);

  const item2 = parsed.items[1];
  assert.equal(item2.name, "Bute Beyaz");
  assert.equal(item2.code, "ES 10111");
  assert.equal(item2.unit, "metr");
  assert.equal(item2.quantity, 4.35);
  assert.equal(item2.price, 11);
  assert.equal(item2.total, 47.85);

  assert.equal(parsed.salesAmount, 113.5);
  assert.equal(parsed.verified, true);
});

test("parses pure numeric and dotted codes like Kleiberit 432.6, 432.7 and Kley 7021", () => {
  const text = HEAD + `1 Kleiberit (Göy) 432.6 kq 2 45,00 90,00\n2 Kleiberit 432.7 kq 1 380,00 380,00\n3 Kley 7021 ədəd 3 15,00 45,00\nИТОГО 515,00`;
  const parsed = parseCloudShopInvoiceText(text, ["Güven Kapak"]);
  assert.equal(parsed.items.length, 3);

  const k1 = parsed.items[0];
  assert.equal(k1.name, "Kleiberit (Göy)");
  assert.equal(k1.code, "432.6");
  assert.equal(k1.unit, "kq");
  assert.equal(k1.quantity, 2);
  assert.equal(k1.total, 90);

  const k2 = parsed.items[1];
  assert.equal(k2.name, "Kleiberit");
  assert.equal(k2.code, "432.7");
  assert.equal(k2.unit, "kq");
  assert.equal(k2.quantity, 1);
  assert.equal(k2.total, 380);

  const k3 = parsed.items[2];
  assert.equal(k3.name, "Kley");
  assert.equal(k3.code, "7021");
  assert.equal(k3.unit, "ədəd");
  assert.equal(k3.quantity, 3);
  assert.equal(k3.total, 45);

  assert.equal(parsed.salesAmount, 515);
  assert.equal(parsed.verified, true);
});
