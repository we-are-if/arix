import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import fs from 'node:fs';

async function test() {
  let parserCode = fs.readFileSync('daily-app/src/qaimeParser.ts', 'utf-8');

  // Let's modify: In nakladnaya format or in general, if 3 tokens yield an uncorrected match, prefer it!
  const target = `      if (!matchedRow && numTokens.length >= 4) {
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

  // Try 3-token uncorrected FIRST (or always first for nakladnaya where discount column never exists)
  const replacement = `      // If the document is nakladnaya (no discount column) or 3 tokens match uncorrected, try 3 tokens first
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

  const modified = parserCode.replace(target, replacement);
  const outPath = join(tmpdir(), 'test-parser-mod.ts');
  fs.writeFileSync(outPath, modified, 'utf-8');

  const bundlePath = join(tmpdir(), 'test-bundle.mjs');
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
  const line = '1 Oak Endgrain Cognac ES 2702 metr 5.05 13,00 65,65';
  const res = parser.parseCloudShopInvoiceText(line, []);
  console.log('Result for ES 2702:', res.items);

  const line2 = '2 Bute Beyaz ES 10111 metr 4.35 11,00 47,85';
  const res2 = parser.parseCloudShopInvoiceText(line2, []);
  console.log('Result for ES 10111:', res2.items);
}

test();
