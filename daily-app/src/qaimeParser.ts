export type ParsedSalesItem = {
  no: number;
  name: string;
  code: string;
  unit: string;
  quantity: number;
  price: number;
  discount: number;
  total: number;
};

export type ParsedSalesDoc = {
  invoiceNo: string;
  date: string;
  customerRaw: string;
  matchedCustomer: string;
  warehouse: string;
  seller: string;
  salesAmount: number;
  itemsSum: number;
  verified: boolean;
  verificationNote: string;
  items: ParsedSalesItem[];
  sourceFormat: "cloudshop-web" | "nakladnaya" | "generic";
  rawText: string;
};

export type InvoiceRecord = {
  id: string;
  invoiceNo: string;
  date: string;
  createdAt: string;
  customer: string;
  seller?: string;
  warehouse?: string;
  note?: string;
  previousDebtSnapshot: number;
  previousPastMonthSnapshot: number;
  salesAmount: number;
  returnAmount: number;
  purchaseAmount: number;
  paymentDeducted: number;
  currentMonthDeducted: number;
  pastMonthDeducted: number;
  finalDebt: number;
  linkedEntryIds: string[];
  linkedEntriesSummary: Array<{ id: string; date: string; amount: number; channel: string }>;
  items: ParsedSalesItem[];
  screenshotDataUrl?: string;
  status: "draft" | "active" | "cancelled";
  approvedBy?: string;
  approvedAt?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  rejectionReason?: string;
  printedAt?: string;
};

const AZ_MONTHS: Record<string, string> = {
  yanvar: "01",
  fevral: "02",
  mart: "03",
  aprel: "04",
  may: "05",
  iyun: "06",
  iyul: "07",
  avqust: "08",
  sentyabr: "09",
  oktyabr: "10",
  noyabr: "11",
  dekabr: "12",
};

const EXCLUDED_NAMES = new Set([
  "azart membran",
  "arif mahmud",
  "ananas",
  "«ananas»",
  "sənəd",
  "sened",
  "məhsullar",
  "mehsullar",
  "ödəniş",
  "odenis",
]);

/**
 * Singleton pre-warmed Tesseract worker so Ctrl+V recognition runs in ~0.5-1s
 * without reloading WASM + language models on every paste.
 */
let cachedWorkerPromise: Promise<import("tesseract.js").Worker> | null = null;

export function preloadOcrWorker(): Promise<import("tesseract.js").Worker> {
  if (!cachedWorkerPromise) {
    cachedWorkerPromise = (async () => {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker(["tur", "rus", "eng"]);
      return worker;
    })().catch((err) => {
      cachedWorkerPromise = null;
      throw err;
    });
  }
  return cachedWorkerPromise;
}

export async function recognizeImageFast(
  imageBlob: Blob | File
): Promise<string> {
  const worker = await preloadOcrWorker();
  const res = await worker.recognize(imageBlob);
  return String(res.data.text || "");
}

/**
 * Fast (<15ms) canvas preprocessor:
 * 1. Keeps optimal resolution (~1200-1400px width) for maximum OCR speed & accuracy.
 * 2. Erases solid black horizontal & vertical table grid lines so boxed cells
 *    (like "872,70" in Расходная накладная) are never dropped by Tesseract.
 */
export async function preprocessImageForOcr(file: File | Blob): Promise<Blob> {
  if (typeof document === "undefined") return file;
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      try {
        const scale = img.width < 900 ? 1.6 : img.width < 1200 ? 1.25 : 1;
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(file);
          return;
        }
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const imgData = ctx.getImageData(0, 0, w, h);
        const data = imgData.data;
        const totalPx = w * h;

        const gray = new Uint8Array(totalPx);
        for (let i = 0; i < totalPx; i++) {
          const idx = i << 2;
          gray[i] = (data[idx] * 77 + data[idx + 1] * 150 + data[idx + 2] * 29) >> 8;
        }

        const toWhiten = new Uint8Array(totalPx);

        // 1. Erase long horizontal table borders
        const minHorizRun = Math.max(70, Math.round(w * 0.08));
        for (let y = 2; y < h - 2; y++) {
          const rowOff = y * w;
          let runStart = -1;
          for (let x = 0; x < w; x++) {
            if (gray[rowOff + x] < 165) {
              if (runStart === -1) runStart = x;
            } else {
              if (runStart !== -1 && x - runStart >= minHorizRun) {
                for (let rx = runStart; rx < x; rx++) {
                  const hasAbove = gray[(y - 2) * w + rx] < 165 && gray[(y - 3 > 0 ? y - 3 : 0) * w + rx] < 165;
                  const hasBelow = gray[(y + 2) * w + rx] < 165 && gray[(y + 3 < h ? y + 3 : h - 1) * w + rx] < 165;
                  if (!hasAbove && !hasBelow) {
                    toWhiten[rowOff + rx] = 1;
                    toWhiten[(y - 1) * w + rx] = 1;
                    toWhiten[(y + 1) * w + rx] = 1;
                  }
                }
              }
              runStart = -1;
            }
          }
        }

        // 2. Erase long vertical table borders
        const minVertRun = Math.round(24 * scale);
        for (let x = 2; x < w - 2; x++) {
          let runStart = -1;
          for (let y = 0; y < h; y++) {
            if (gray[y * w + x] < 165) {
              if (runStart === -1) runStart = y;
            } else {
              if (runStart !== -1 && y - runStart >= minVertRun) {
                for (let ry = runStart; ry < y; ry++) {
                  const rOff = ry * w;
                  const hasLeft = gray[rOff + x - 2] < 165 && gray[rOff + (x - 3 > 0 ? x - 3 : 0)] < 165;
                  const hasRight = gray[rOff + x + 2] < 165 && gray[rOff + (x + 3 < w ? x + 3 : w - 1)] < 165;
                  if (!hasLeft && !hasRight) {
                    toWhiten[rOff + x] = 1;
                    toWhiten[rOff + x - 1] = 1;
                    toWhiten[rOff + x + 1] = 1;
                  }
                }
              }
              runStart = -1;
            }
          }
        }

        for (let i = 0; i < totalPx; i++) {
          const idx = i << 2;
          let v = gray[i];
          if (toWhiten[i]) {
            v = 255;
          } else {
            v = v < 185 ? Math.max(0, Math.round((v - 35) * 0.85)) : 255;
          }
          data[idx] = v;
          data[idx + 1] = v;
          data[idx + 2] = v;
          data[idx + 3] = 255;
        }

        ctx.putImageData(imgData, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob((blob) => resolve(blob || file), "image/png");
      } catch {
        URL.revokeObjectURL(url);
        resolve(file);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file);
    };
    img.src = url;
  });
}

export function normalizeForMatch(value: string): string {
  return value
    .toLocaleLowerCase("az-AZ")
    .replace(/[«»"'`().,\-_/\\]/g, " ")
    .replace(/ə/g, "e")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ç/g, "c")
    .replace(/ğ/g, "g")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseFlexibleNumber(raw: string): number {
  if (!raw) return 0;
  let cleaned = raw
    .replace(/[₼$€₺a-zA-Zа-яА-ЯəıöüşçğƏİÖÜŞÇĞ|[\]]/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      cleaned = cleaned.replace(/\./g, "").replace(",", ".");
    } else {
      cleaned = cleaned.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    cleaned = cleaned.replace(",", ".");
  }

  const num = Number(cleaned);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
}

export function matchKnownCustomer(rawCandidate: string, fullText: string, knownCustomers: string[]): string {
  const validCustomers = knownCustomers
    .map((c) => c.trim())
    .filter((c) => c.length >= 2 && !EXCLUDED_NAMES.has(c.toLocaleLowerCase("az-AZ")));

  const sortedByLength = [...validCustomers].sort((a, b) => b.length - a.length);

  if (rawCandidate.trim()) {
    const normCand = normalizeForMatch(rawCandidate);
    if (normCand && !EXCLUDED_NAMES.has(rawCandidate.trim().toLocaleLowerCase("az-AZ"))) {
      const exact = sortedByLength.find((c) => normalizeForMatch(c) === normCand);
      if (exact) return exact;

      const partial = sortedByLength.find((c) => {
        const nc = normalizeForMatch(c);
        return nc.length >= 4 && (normCand.includes(nc) || nc.includes(normCand));
      });
      if (partial) return partial;
    }
  }

  const normFull = normalizeForMatch(fullText);
  for (const cust of sortedByLength) {
    const nc = normalizeForMatch(cust);
    if (nc.length >= 4 && !EXCLUDED_NAMES.has(cust.toLocaleLowerCase("az-AZ"))) {
      const escaped = nc.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(^|\\s)${escaped}(?=\\s|$)`, "i");
      if (regex.test(normFull)) {
        return cust;
      }
    }
  }

  return rawCandidate.trim();
}

export function parseCloudShopInvoiceText(rawText: string, knownCustomers: string[]): ParsedSalesDoc {
  // Normalize spaces around decimal commas/dots produced by OCR (e.g. "872, 70" -> "872,70")
  const normalizedText = rawText
    .replace(/(\d)\s*([.,])\s*(\d{2})(?!\d)/g, "$1$2$3")
    .replace(/[|¦]/g, " ");

  const lines = normalizedText
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let sourceFormat: ParsedSalesDoc["sourceFormat"] = "generic";
  if (/Расходная|накладная|Покупатель|ИТОГО|MTOTO|ITOGO|metr/i.test(normalizedText)) {
    sourceFormat = "nakladnaya";
  } else if (/Satış\s*#|Satis\s*#|MƏHSULLAR|Ümumi\s+nəticə|Yararlı/i.test(normalizedText)) {
    sourceFormat = "cloudshop-web";
  }

  // 1. Extract Invoice Number
  let invoiceNo = "";
  const naklNoMatch =
    normalizedText.match(/(?:накладная|hakladnaya|Satış|Satis|Sənəd|QAİMƏ|Qaimə)\s*[#№N]*\s*(\d{3,8})/i) ||
    normalizedText.match(/[#№]\s*(\d{3,8})/);
  if (naklNoMatch) {
    invoiceNo = naklNoMatch[1];
  }

  // 2. Extract Date
  let docDate = "";
  const dotDateMatch = normalizedText.match(/(\d{2})\.(\d{2})\.(\d{4})/);
  if (dotDateMatch) {
    docDate = `${dotDateMatch[1]}.${dotDateMatch[2]}.${dotDateMatch[3]}`;
  } else {
    const azDateMatch = normalizedText.match(
      /(\d{1,2})\s+(yanvar|fevral|mart|aprel|may|iyun|iyul|avqust|sentyabr|oktyabr|noyabr|dekabr)\s+(\d{4})/i
    );
    if (azDateMatch) {
      const dd = String(azDateMatch[1]).padStart(2, "0");
      const mm = AZ_MONTHS[azDateMatch[2].toLowerCase()] || "10";
      docDate = `${dd}.${mm}.${azDateMatch[3]}`;
    }
  }

  // 3. Extract Customer Name
  let customerRaw = "";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const pokupMatch = line.match(
      /(?:Покупатель|Nokynatenb|Pokupatel|Müştəri|Musteri|Müsteri|Kimə|Kime)\s*[:\-]?\s*(.+)$/i
    );
    if (pokupMatch) {
      const cand = pokupMatch[1]
        .replace(/\b(?:Məbləğ|Mebleg|Endirim|Ödənilənlər|Odenilenler|Автор|Avtor)\b.*$/i, "")
        .trim();
      if (cand && cand.length >= 2) {
        customerRaw = cand;
        break;
      } else if (i + 1 < lines.length) {
        customerRaw = lines[i + 1].trim();
        break;
      }
    }
  }

  const matchedCustomer = matchKnownCustomer(customerRaw, normalizedText, knownCustomers);

  // 4. Extract Warehouse & Seller
  let warehouse = "";
  const whMatch = normalizedText.match(
    /(?:Склад|Cknag|Sklad|Hesab)\s*[:\-]?\s*[«"]?([A-Za-zА-Яа-я0-9_.\s]+?)[»"]?(?:\s+Endirim|\n|$)/i
  );
  if (whMatch) warehouse = whMatch[1].trim();

  let seller = "";
  const sellerMatch = normalizedText.match(
    /(?:Автор|Abtop|Avtor|Satıcı|Satici)\s*[:\-]?\s*([A-Za-zА-Яа-яƏəİıÖöÜüŞşÇçĞğ\s]+?)(?:\s+Ödənilənlər|\n|$)/i
  );
  if (sellerMatch) seller = sellerMatch[1].trim();

  // 5. Extract Product Rows where qty * price ≈ total
  // Also handles cases where OCR missed the tiny decimal dot in qty (e.g. read "6.1" as "61" or "3.05" as "305")
  const items: ParsedSalesItem[] = [];
  for (const line of lines) {
    if (
      /^(?:№|Ad\s+Bar-kod|Ümumi\s+nəticə|ИТОГО|MTOTO|ITOGO|Поставщик|Покупатель|Склад|Hesab|Müştəri|Satıcı)/i.test(
        line
      )
    ) {
      continue;
    }

    const numTokens = Array.from(line.matchAll(/\d+(?:[.,]\d+)?/g)).map((m) => ({
      raw: m[0],
      val: parseFlexibleNumber(m[0]),
      index: m.index ?? 0,
    }));

    if (numTokens.length >= 3) {
      const last = numTokens[numTokens.length - 1];
      let matchedRow: { qty: number; price: number; discount: number; total: number; cutIdx: number } | null = null;

      const tryMatchQtyPrice = (rawQtyVal: number, priceVal: number, discVal: number, totalVal: number) => {
        for (const divisor of [1, 10, 100]) {
          const candidateQty = Math.round((rawQtyVal / divisor) * 1000) / 1000;
          if (candidateQty <= 0 || priceVal <= 0 || totalVal <= 0) continue;
          const expected = Math.round((candidateQty * priceVal - discVal) * 100) / 100;
          if (Math.abs(expected - totalVal) <= 0.06) {
            return candidateQty;
          }
        }
        return null;
      };

      if (numTokens.length >= 4) {
        const nQty = numTokens[numTokens.length - 4];
        const nPrice = numTokens[numTokens.length - 3];
        const nDisc = numTokens[numTokens.length - 2];
        const validQty = tryMatchQtyPrice(nQty.val, nPrice.val, nDisc.val, last.val);
        if (validQty !== null) {
          matchedRow = { qty: validQty, price: nPrice.val, discount: nDisc.val, total: last.val, cutIdx: nQty.index };
        }
      }

      if (!matchedRow && numTokens.length >= 3) {
        const nQty = numTokens[numTokens.length - 3];
        const nPrice = numTokens[numTokens.length - 2];
        const validQty = tryMatchQtyPrice(nQty.val, nPrice.val, 0, last.val);
        if (validQty !== null) {
          matchedRow = { qty: validQty, price: nPrice.val, discount: 0, total: last.val, cutIdx: nQty.index };
        }
      }

      if (matchedRow) {
        const leftPart = line.slice(0, matchedRow.cutIdx).replace(/^\d+\s+/, "").trim();
        if (leftPart && !/Ümumi|ИТОГО|MTOTO|ITOGO|ANAnas|Membran\s+Group/i.test(leftPart)) {
          const cleanedLeft = leftPart.replace(/\bmetr\b/i, "").trim();
          let prodName = cleanedLeft;
          let prodCode = "";
          const codeMatch = cleanedLeft.match(
            /^(.*?)\s+(?:G\d+(?:_\d+)?\s+)?((?:ES\s+(?:HG|SM)\s+\d+|ES\s+\d+|ERSA\s+\d+|[A-Z]{1,4}\s?\d{3,6}))$/i
          );
          if (codeMatch && codeMatch[1].trim()) {
            prodName = codeMatch[1].trim();
            prodCode = codeMatch[2].trim();
          }
          items.push({
            no: items.length + 1,
            name: prodName || `Məhsul ${items.length + 1}`,
            code: prodCode,
            unit: "metr",
            quantity: matchedRow.qty,
            price: matchedRow.price,
            discount: matchedRow.discount,
            total: matchedRow.total,
          });
        }
      }
    }
  }

  const itemsSum = Math.round(items.reduce((acc, item) => acc + item.total, 0) * 100) / 100;

  // 6. Extract Header / Footer Total Sales Amount
  const candidateTotals: number[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Match ИТОГО in Cyrillic or Latin OCR lookalikes (MTOTO, ITOGO, HTOFO, VTOTO, UTORO, ТОГО, TOGO)
    if (/(?:ИТОГО|Итого|MTOTO|ITOGO|HTOFO|VTOTO|UTORO|MTOrO|ТОГО|TOGO|Ümumi\s+nəticə|Umumi\s+netice)/i.test(line)) {
      const decimalsInLine = Array.from(line.matchAll(/(\d[\d\s]*[.,]\d{2})/g)).map((m) =>
        parseFlexibleNumber(m[1])
      );
      if (decimalsInLine.length > 0) {
        candidateTotals.push(decimalsInLine[decimalsInLine.length - 1]);
      } else if (i + 1 < lines.length) {
        const nextDecimals = Array.from(lines[i + 1].matchAll(/(\d[\d\s]*[.,]\d{2})/g)).map((m) =>
          parseFlexibleNumber(m[1])
        );
        if (nextDecimals.length > 0) {
          candidateTotals.push(nextDecimals[nextDecimals.length - 1]);
        }
      }
    }
    // Check Məbləğ 872.70 ₼
    if (/\b(?:Məbləğ|Mebleg)\b/i.test(line) && !/Vergi/i.test(line)) {
      const m = line.match(/(?:Məbləğ|Mebleg)\s*[:\-]?\s*(\d[\d\s]*[.,]\d{2})/i);
      if (m) candidateTotals.push(parseFlexibleNumber(m[1]));
    }
  }

  let salesAmount = 0;
  let verified = false;
  let verificationNote = "";

  // Also check if any decimal in the last 3 lines matches itemsSum (in case OCR garbled the word "ИТОГО:")
  if (itemsSum > 0 && candidateTotals.length === 0) {
    const tailText = lines.slice(-3).join(" ");
    const tailDecimals = Array.from(tailText.matchAll(/(\d[\d\s]*[.,]\d{2})/g)).map((m) =>
      parseFlexibleNumber(m[1])
    );
    const tailMatch = tailDecimals.find((d) => Math.abs(d - itemsSum) <= 0.1);
    if (tailMatch !== undefined) {
      candidateTotals.push(tailMatch);
    }
  }

  // OPTION A: Strict Mathematical Self-Verification (Row-by-row Qty*Price=Total AND Sum(Rows)==Total)
  if (itemsSum > 0) {
    const matchingCandidate = candidateTotals.find((c) => Math.abs(c - itemsSum) <= 0.1);
    if (matchingCandidate !== undefined) {
      salesAmount = matchingCandidate;
      verified = true;
      verificationNote = `✓ 100% Riyazi Təsdiq: ${items.length} məhsul sətrinin cəmi (${itemsSum.toFixed(2)} ₼) və yekun məbləğ (${salesAmount.toFixed(2)} ₼) qəpik-qəpiyinə üst-üstə düşür.`;
    } else if (candidateTotals.length > 0) {
      // Mismatch between extracted rows sum and footer total -> DO NOT auto-commit silently!
      const maxCand = Math.max(...candidateTotals);
      salesAmount = Math.max(maxCand, itemsSum);
      verified = false;
      verificationNote = `⚠️ Riyazi fərq: Oxunan ${items.length} sətrin cəmi (${itemsSum.toFixed(2)} ₼) ilə yekun rəqəm (${maxCand.toFixed(2)} ₼) fərqlidir! Səhv etməmək üçün borca avtomatik yazılmadı — yoxlayıb «Qaiməni qeydə al» düyməsinə basın.`;
    } else if (items.length >= 2) {
      // Every item passed (Qty * Price == RowTotal) and we have multiple verified rows
      salesAmount = itemsSum;
      verified = true;
      verificationNote = `✓ Riyazi Təsdiq: ${items.length} məhsul sətrinin hər biri (Miqdar × Qiymət = Cəm) yoxlanıldı, dəqiq cəm: ${itemsSum.toFixed(2)} ₼.`;
    } else {
      salesAmount = itemsSum;
      verified = false;
      verificationNote = `⚠️ Yalnız 1 sətir oxundu (${itemsSum.toFixed(2)} ₼). Səhv etməmək üçün rəqəmi yoxlayıb «Qaiməni qeydə al» düyməsinə basın.`;
    }
  } else if (candidateTotals.length > 0) {
    salesAmount = Math.max(...candidateTotals);
    verified = false;
    verificationNote = `⚠️ Məhsul sətirləri oxunmadı (yalnız yekun ${salesAmount.toFixed(2)} ₼ tapıldı). Səhv etməmək üçün rəqəmi yoxlayıb «Qaiməni qeydə al» düyməsinə basın.`;
  } else {
    const allDecimals = Array.from(normalizedText.matchAll(/\b(\d{1,6}[.,]\d{2})\b/g))
      .map((m) => parseFlexibleNumber(m[1]))
      .filter((n) => n > 0 && n < 1000000);
    if (allDecimals.length > 0) {
      salesAmount = Math.max(...allDecimals);
      verified = false;
      verificationNote = `⚠️ Şəkildə cədvəl tam oxunmadı (ən böyük rəqəm: ${salesAmount.toFixed(2)} ₼). Səhv etməmək üçün rəqəmi yoxlayıb «Qaiməni qeydə al» düyməsinə basın.`;
    }
  }

  return {
    invoiceNo,
    date: docDate,
    customerRaw,
    matchedCustomer,
    warehouse,
    seller,
    salesAmount,
    itemsSum,
    verified,
    verificationNote,
    items,
    sourceFormat,
    rawText: normalizedText,
  };
}
