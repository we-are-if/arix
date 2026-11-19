import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import fs from 'node:fs';

async function testAll() {
  let parserCode = fs.readFileSync('daily-app/src/qaimeParser.ts', 'utf-8');

  // 1. Code Pattern in normalizeArticleCode
  const oldNormMatch = `  const match = cleaned.match(
    /(?:ES\\s*(?:(?:HG|HC|SM|FL)\\s*)?\\d+(?:\\s*-\\s*\\d+)?|SFL\\s*\\d+(?:\\s*-\\s*\\d+)?|ERSA\\s*\\d+(?:\\s*-\\s*\\d+)?|C\\s*\\d{4}|[A-Z]{1,4}\\s*\\d{3,6}(?:\\s*-\\s*\\d+)?)/i,
  );`;

  const newNormMatch = `  const match = cleaned.match(
    /(?:ES\\s*(?:(?:HG|HC|SM|FL|EC|M)\\s*)?\\d+(?:\\s*-\\s*\\d+)?|SFL\\s*\\d+(?:\\s*-\\s*\\d+)?|\\bER(?:SA)?\\s*\\d+(?:\\s*-\\s*\\d+)?|C\\s*[A-Z0-9_-]+|[A-Z]{1,4}\\s*\\d{2,6}(?:\\s*-\\s*\\d+)?|\\b\\d{3,4}\\.\\d\\b|\\b(?:7021|7031|8013)\\b|\\b(?:LG|LMD|HH)\\b)/i,
  );`;

  // 2. Code Pattern in parseProductIdentity
  const oldCodePattern = `  const codePattern = /(?:G\\d+(?:_\\d+)?\\s+)?(?:ES\\s*(?:(?:HG|HC|SM|FL)\\s*)?\\d+(?:\\s*-\\s*\\d+)?|SFL\\s*\\d+(?:\\s*-\\s*\\d+)?|ERSA\\s*\\d+(?:\\s*-\\s*\\d+)?|C\\s*[1I8HB]\\d{3}|[A-Z]{1,4}\\s*\\d{3,6}(?:\\s*-\\s*\\d+)?)/gi;`;

  const newCodePattern = `  const codePattern = /(?:G\\d+(?:_\\d+)?\\s+)?(?:ES\\s*(?:(?:HG|HC|SM|FL|EC|M)\\s*)?\\d+(?:\\s*-\\s*\\d+)?|SFL\\s*\\d+(?:\\s*-\\s*\\d+)?|\\bER(?:SA)?\\s*\\d+(?:\\s*-\\s*\\d+)?|C\\s*[1I8HB\\d]\\d{1,3}(?:-[A-Z0-9]+)?|[A-Z]{1,4}\\s*\\d{2,6}(?:\\s*-\\s*\\d+)?|\\b\\d{3,4}\\.\\d\\b|\\b(?:7021|7031|8013)\\b|\\b(?:LG|LMD|HH)\\b)/gi;`;

  // 3. Priority for 3-token match in nakladnaya (no discount)
  const oldReconcile = `      if (!matchedRow && numTokens.length >= 4) {
        const nQty = numTokens[numTokens.length - 4];
        const nPrice = numTokens[numTokens.length - 3];
        const nDisc = numTokens[numTokens.length - 2];
        const reconciled = reconcileSalesRowNumbers(
          nQty.raw,
          nPrice.raw,
          nDisc.raw,
          last.raw,
          items.map((item) => item.price),
        );
        if (reconciled) {
          matchedRow = {
            qty: reconciled.quantity,
            price: reconciled.price,
            discount: reconciled.discount,
            total: reconciled.total,
            cutIdx: nQty.index,
          };
          if (reconciled.corrected) decimalCorrectionCount += 1;
        }
      }`;

  const newReconcile = `      // For nakladnaya format (which has no discount column), prefer 3 tokens (qty, price, total) first:
      if (!matchedRow && numTokens.length >= 3 && (sourceFormat === "nakladnaya" || !/endirim|скидк/i.test(normalizedText))) {
        const nQty = numTokens[numTokens.length - 3];
        const nPrice = numTokens[numTokens.length - 2];
        const reconciled = reconcileSalesRowNumbers(
          nQty.raw,
          nPrice.raw,
          "0",
          last.raw,
          items.map((item) => item.price),
          /^\\d{1,3}\\s+(?=\\D)/.test(line),
        );
        if (reconciled) {
          matchedRow = {
            qty: reconciled.quantity,
            price: reconciled.price,
            discount: 0,
            total: reconciled.total,
            cutIdx: nQty.index,
          };
          if (reconciled.corrected) decimalCorrectionCount += 1;
        }
      }

      if (!matchedRow && numTokens.length >= 4) {
        const nQty = numTokens[numTokens.length - 4];
        const nPrice = numTokens[numTokens.length - 3];
        const nDisc = numTokens[numTokens.length - 2];
        const reconciled = reconcileSalesRowNumbers(
          nQty.raw,
          nPrice.raw,
          nDisc.raw,
          last.raw,
          items.map((item) => item.price),
        );
        if (reconciled) {
          matchedRow = {
            qty: reconciled.quantity,
            price: reconciled.price,
            discount: reconciled.discount,
            total: reconciled.total,
            cutIdx: nQty.index,
          };
          if (reconciled.corrected) decimalCorrectionCount += 1;
        }
      }`;

  let modified = parserCode.replace(oldNormMatch, newNormMatch);
  modified = modified.replace(oldCodePattern, newCodePattern);
  modified = modified.replace(oldReconcile, newReconcile);

  const outPath = join(tmpdir(), 'test-parser-final.ts');
  fs.writeFileSync(outPath, modified, 'utf-8');

  const bundlePath = join(tmpdir(), 'test-bundle-final.mjs');
  await build({
    entryPoints: [outPath],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outfile: bundlePath,
    external: ['tesseract.js'],
    logLevel: 'silent',
  });

  const parser = await import(pathToFileURL(bundlePath).href);

  const testCases = [
    { line: '1 Oak Endgrain Cognac ES 2702 metr 5.05 13,00 65,65', expName: 'Oak Endgrain Cognac', expCode: 'ES 2702', expQty: 5.05, expPrice: 13 },
    { line: '2 Bute Beyaz ES 10111 metr 4.35 11,00 47,85', expName: 'Bute Beyaz', expCode: 'ES 10111', expQty: 4.35, expPrice: 11 },
    { line: '3 Kleiberit (Göy) 432.6 ədəd 1 380,00 380,00', expName: 'Kleiberit (Göy)', expCode: '432.6', expQty: 1, expPrice: 380 },
    { line: '4 Kleiberit 432.7 ədəd 2 380,00 760,00', expName: 'Kleiberit', expCode: '432.7', expQty: 2, expPrice: 380 },
    { line: '5 3D Patine Pembe ER 1802 metr 10 12,00 120,00', expName: '3D Patine Pembe', expCode: 'ER 1802', expQty: 10, expPrice: 12 },
    { line: '6 Kley 7021 7021 kq 5 6,00 30,00', expName: 'Kley 7021', expCode: '7021', expQty: 5, expPrice: 6 },
    { line: '7 Alman Antrasit Folyolu C1440-F4 metr 15 10,00 150,00', expName: 'Alman Antrasit Folyolu', expCode: 'C1440-F4', expQty: 15, expPrice: 10 },
  ];

  let allPass = true;
  for (const tc of testCases) {
    const res = parser.parseCloudShopInvoiceText(tc.line, []).items[0];
    const okName = res?.name === tc.expName;
    const okCode = res?.code === tc.expCode;
    const okQty = res?.quantity === tc.expQty;
    const okPrice = res?.price === tc.expPrice;
    const pass = okName && okCode && okQty && okPrice;
    if (!pass) allPass = false;
    console.log(`[${pass ? 'PASS' : 'FAIL'}] "${tc.line}" -> Name: "${res?.name}", Code: "${res?.code}", Qty: ${res?.quantity}, Price: ${res?.price}`);
  }

  if (allPass) {
    console.log('ALL TEST CASES PASSED PERFECTLY!');
  } else {
    throw new Error('Some test cases failed!');
  }
}

testAll();
