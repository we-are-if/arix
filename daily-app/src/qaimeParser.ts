import { OFFICIAL_PRODUCT_CATALOG } from "./productCatalog";

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

export type ProductRowCandidate = {
  name: string;
  code: string;
  unit?: string;
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
  explicitPaymentSelection?: boolean;
  includePastPayment?: boolean;
  dailySequence?: number;
  dailySequenceDate?: string;
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
  returnItems?: ParsedSalesItem[];
  screenshotDataUrl?: string;
  returnScreenshotDataUrl?: string;
  status: "draft" | "active" | "cancelled";
  approvedBy?: string;
  approvedAt?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  rejectionReason?: string;
  restartOf?: string;
  restartedAt?: string;
  restartedBy?: string;
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
      const isBrowser = typeof window !== "undefined";
      const options = isBrowser
        ? {
            workerPath: "/tesseract/worker.min.js",
            corePath: "/tesseract",
            langPath: "/tessdata",
            gzip: true,
          }
        : {
            langPath: "./daily-app/public/tessdata",
            gzip: false,
          };
      const worker = await createWorker(["aze", "tur", "rus", "eng"], 1, options);
      return worker;
    })().catch((err) => {
      cachedWorkerPromise = null;
      throw err;
    });
  }
  return cachedWorkerPromise;
}

export async function recognizeImageFast(
  imageBlob: Blob | File,
  pageSegmentationMode: "3" | "4" | "11" = "3",
): Promise<string> {
  const worker = await preloadOcrWorker();
  await worker.setParameters({
    tessedit_pageseg_mode: pageSegmentationMode as import("tesseract.js").PSM,
    preserve_interword_spaces: "1",
  });
  const res = await worker.recognize(
    imageBlob,
    {},
    pageSegmentationMode === "11" ? { tsv: true } : {},
  );
  const text = String(res.data.text || "");
  if (pageSegmentationMode !== "11" || !res.data.tsv) return text;

  const productRows = extractProductRowsFromTsv(res.data.tsv);
  if (!productRows.length) return text;
  return `${text}\n${productRows.map((row) => `ARIX_PRODUCT_ROW: ${JSON.stringify(row)}`).join("\n")}`;
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
    .replace(/\u043D/g, "h")
    .replace(/\u0441/g, "c")
    .replace(/\u0440/g, "r")
    .replace(/\u0430/g, "a")
    .replace(/\u0435/g, "e")
    .replace(/\u043E/g, "o")
    .replace(/\u0443/g, "u")
    .replace(/\u0445/g, "x")
    .replace(/\u0432/g, "v")
    .replace(/\u043A/g, "k")
    .replace(/\u043C/g, "m")
    .replace(/\u0442/g, "t")
    .replace(/[«»"'`().,\-—–_/\\]/g, " ")
    .replace(/ə/g, "e")
    .replace(/[ıiİI]/g, "i")
    .replace(/ö/g, "o")
    .replace(/ü/g, "u")
    .replace(/[\u015F\u015E\u0219\u0218şŞ]/g, "s")
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

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array<number>(b.length + 1);
  for (let row = 1; row <= a.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= b.length; column += 1) {
      const substitutionCost = a[row - 1] === b[column - 1] ? 0 : 1;
      current[column] = Math.min(
        current[column - 1] + 1,
        previous[column] + 1,
        previous[column - 1] + substitutionCost,
      );
    }
    for (let column = 0; column <= b.length; column += 1) previous[column] = current[column];
  }
  return previous[b.length];
}

export function cleanCustomerCandidate(rawCandidate: string): string {
  if (!rawCandidate) return "";
  let cleaned = rawCandidate.trim();

  // Remove leading bullets, dashes, quotes, colons
  cleaned = cleaned.replace(/^[\s—–\-:;,."«»']+/u, "");

  // Remove inline/trailing contact prefixes (Cyrillic & Latin: т., т:, тел, tel, mob, t., ph, etc.) and phone numbers
  cleaned = cleaned.replace(
    /(?:^|[,;\s]+)(?:т(?:ел)?\.?|tel(?:efon)?\.?|mob(?:il)?\.?|t\.|ph(?:one)?\.?|w(?:hats)?app|əlaqə|elaqe|nömrə|nomre)\s*[:.]?\s*.*$/iu,
    "",
  );

  // Remove international or local phone numbers (e.g. "+994 50 123 45 67", "050 123 45 67", "050-525-25-38")
  cleaned = cleaned.replace(
    /(?:^|[,;\s]+)(?:\+?994|050|051|055|070|077|099|012|010|\+\d{1,3})[\s()-]*\d[\d\s()-]*$/iu,
    "",
  );

  // Remove any remaining raw phone pattern at the end: e.g. " 0505252538"
  cleaned = cleaned.replace(/(?:^|[,;\s]+)\+?\d{7,14}$/iu, "");

  // Remove trailing separators and quotes
  cleaned = cleaned.replace(/[\s—–\-:;,."«»']+$/u, "");

  return cleaned.trim();
}

function customerCandidateWithoutContact(rawCandidate: string): string {
  return cleanCustomerCandidate(rawCandidate);
}

function ocrComparable(value: string): string {
  return normalizeForMatch(value)
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/5/g, "s");
}

export function normalizeWarehouseName(rawWarehouse: string): string {
  const cleaned = rawWarehouse.replace(/[«»"']/g, "").trim();
  if (!cleaned) return "";

  const compact = ocrComparable(cleaned).replace(/\s+/g, "");
  const canonicalWarehouse = "ANAnas";
  const canonicalCompact = ocrComparable(canonicalWarehouse).replace(/\s+/g, "");
  if (
    compact === canonicalCompact ||
    (compact.length >= 5 && levenshteinDistance(compact, canonicalCompact) <= 2)
  ) {
    return canonicalWarehouse;
  }
  return cleaned;
}

export type ReconciledSalesRowNumbers = {
  quantity: number;
  price: number;
  discount: number;
  total: number;
  corrected: boolean;
  inferred: boolean;
  quantityDivisor: number;
  priceDivisor: number;
  totalDivisor: number;
};

function hasAtMostDecimals(value: number, decimals: number): boolean {
  const factor = 10 ** decimals;
  return Math.abs(value * factor - Math.round(value * factor)) < 0.001;
}

/** Number tokens, keeping unambiguous thousand groups (1.300,00 / 1,300.00) intact. */
const NUMBER_TOKEN_PATTERN = /\d{1,3}(?:\.\d{3})+,\d{2}(?!\d)|\d{1,3}(?:,\d{3})+\.\d{2}(?!\d)|\d+(?:[.,]\d+)?/g;

/**
 * Every plausible reading of the decimal amounts in a line. A space-separated
 * thousand group ("1 370,00") is ambiguous with a preceding column ("8 109,00"
 * where 8 is the quantity total), so both readings are returned.
 */
function extractAmountReadings(line: string): number[][] {
  const readings: number[][] = [];
  for (const match of line.matchAll(/(?:\d{1,3}(?:[ \u00a0.,]\d{3})+|\d+)[.,]\d{2}(?!\d)/g)) {
    const full = match[0];
    const values = [parseFlexibleNumber(full.replace(/[ \u00a0]/g, ""))];
    const tail = full.match(/\d+[.,]\d{2}$/)?.[0];
    if (tail && tail !== full) values.push(parseFlexibleNumber(tail));
    readings.push(values.filter((value) => value > 0));
  }
  return readings.filter((values) => values.length > 0);
}

function median(values: number[]): number {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

/**
 * OCR can drop the decimal separator from either quantity or price. A row can
 * still balance with the wrong pair (for example 0.05 x 1400 = 5 x 14), so we
 * evaluate both fields together and prefer the commercially plausible pair.
 */
export function reconcileSalesRowNumbers(
  rawQuantity: string,
  rawPrice: string,
  rawDiscount: string,
  rawTotal: string,
  referencePrices: number[] = [],
  allowDigitRecovery = false,
): ReconciledSalesRowNumbers | null {
  const quantityValue = parseFlexibleNumber(rawQuantity);
  const priceValue = parseFlexibleNumber(rawPrice);
  const discountValue = parseFlexibleNumber(rawDiscount);
  const totalValue = parseFlexibleNumber(rawTotal);
  if (quantityValue <= 0 || priceValue <= 0 || totalValue <= 0) return null;

  const referencePrice = median(referencePrices.filter((value) => value >= 0.1 && value <= 10000));
  const quantityAlreadyDecimal = /[.,]/.test(rawQuantity);
  const priceAlreadyDecimal = /[.,]/.test(rawPrice);
  const totalAlreadyDecimal = /[.,]/.test(rawTotal);
  const candidates: Array<ReconciledSalesRowNumbers & { score: number }> = [];

  const addCandidate = (
    quantity: number,
    price: number,
    total: number,
    quantityDivisor: number,
    priceDivisor: number,
    totalDivisor: number,
    inferencePenalty = 0,
  ) => {
    const expectedTotal = Math.round((quantity * price - discountValue) * 100) / 100;
    if (quantity <= 0 || price <= 0 || total <= 0 || Math.abs(expectedTotal - total) > 0.06) return;

    const isUncorrected = quantityDivisor === 1 && priceDivisor === 1 && totalDivisor === 1 && inferencePenalty === 0;

    let score = Math.log10(quantityDivisor) + Math.log10(priceDivisor) + Math.log10(totalDivisor) + inferencePenalty;
    if (quantityDivisor > 1) score += quantityAlreadyDecimal ? 30 : 2;
    if (priceDivisor > 1) score += priceAlreadyDecimal ? 30 : 2;
    if (totalDivisor > 1) score += totalAlreadyDecimal ? 30 : 2;

    if (isUncorrected) {
      // Natural uncorrected OCR match takes precedence over artificial divisors
      score -= 6;
    }

    if (quantity < 0.1) score += 12;
    else if (quantity < 0.5) score += 4;
    else if (quantity > 10000) score += 4;

    if (price < 0.5) score += 8;
    else if (price < 1) score += 5;
    else if (price < 2) score += 3;
    else if (price < 5) score += 1;
    else if (price > 1000) score += 12;
    else if (price > 500) score += 8;
    else if (price > 200) score += isUncorrected ? 3 : 5;
    else if (price > 100) score += isUncorrected ? 1 : 2;

    if (referencePrice > 0) {
      score += Math.min(12, Math.abs(Math.log10(price / referencePrice)) * (isUncorrected ? 4 : 6));
    }

    candidates.push({
      quantity,
      price,
      discount: discountValue,
      total,
      corrected: quantityDivisor > 1 || priceDivisor > 1 || totalDivisor > 1 || inferencePenalty > 0,
      inferred: inferencePenalty > 0,
      quantityDivisor,
      priceDivisor,
      totalDivisor,
      score,
    });
  };

  for (const quantityDivisor of [1, 10, 100]) {
    for (const priceDivisor of [1, 10, 100]) {
      for (const totalDivisor of [1, 10, 100]) {
        const quantity = Math.round((quantityValue / quantityDivisor) * 1000) / 1000;
        const price = Math.round((priceValue / priceDivisor) * 10000) / 10000;
        const total = Math.round((totalValue / totalDivisor) * 100) / 100;
        addCandidate(quantity, price, total, quantityDivisor, priceDivisor, totalDivisor);
      }
    }
  }

  if (!candidates.length && allowDigitRecovery) {
    for (const totalDivisor of [1, 10, 100]) {
      const total = Math.round((totalValue / totalDivisor) * 100) / 100;
      for (const priceDivisor of [1, 10, 100]) {
        const price = Math.round((priceValue / priceDivisor) * 10000) / 10000;
        if (price <= 0) continue;
        const quantity = Math.round(((total + discountValue) / price) * 1000) / 1000;
        if (!hasAtMostDecimals(quantity, 2)) continue;
        addCandidate(quantity, price, total, 1, priceDivisor, totalDivisor, 6);
      }
    }
    for (const totalDivisor of [1, 10, 100]) {
      const total = Math.round((totalValue / totalDivisor) * 100) / 100;
      for (const quantityDivisor of [1, 10, 100]) {
        const quantity = Math.round((quantityValue / quantityDivisor) * 1000) / 1000;
        if (quantity <= 0) continue;
        const price = Math.round(((total + discountValue) / quantity) * 10000) / 10000;
        // Prices are always in qəpik precision; 23.0769 is an artefact, not a price.
        if (!hasAtMostDecimals(price, 2)) continue;
        addCandidate(quantity, price, total, quantityDivisor, 1, totalDivisor, 7);
      }
    }
  }

  candidates.sort((a, b) =>
    a.score - b.score ||
    a.quantityDivisor * a.priceDivisor - b.quantityDivisor * b.priceDivisor ||
    a.price - b.price
  );
  if (!candidates.length) return null;
  const best = candidates[0];
  return {
    quantity: best.quantity,
    price: best.price,
    discount: best.discount,
    total: best.total,
    corrected: best.corrected,
    inferred: best.inferred,
    quantityDivisor: best.quantityDivisor,
    priceDivisor: best.priceDivisor,
    totalDivisor: best.totalDivisor,
  };
}

function normalizeArticleCode(rawValue: string): string {
  if (!rawValue) return "";
  let cleaned = rawValue
    // Map Cyrillic homoglyphs to Latin equivalents
    .replace(/\u041D/g, "H").replace(/\u043D/g, "h")
    .replace(/\u0421/g, "C").replace(/\u0441/g, "c")
    .replace(/\u041E/g, "O").replace(/\u043E/g, "o")
    .replace(/\u0415/g, "E").replace(/\u0435/g, "e")
    .replace(/\u0412/g, "B").replace(/\u0432/g, "b")
    .replace(/\u041C/g, "M").replace(/\u043C/g, "m")
    .replace(/\u041A/g, "K").replace(/\u043A/g, "k")
    .replace(/\u0410/g, "A").replace(/\u0430/g, "a")
    .replace(/[|¦`'"“”«»!]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Fix C1863/C1856 where 8 was read as H/B or 1 as I:
  cleaned = cleaned.replace(/\bC\s*[1I]\s*[HB8](\d{2})\b/i, "C18$1");

  // Fix ES HG where G was read as C or O:
  cleaned = cleaned.replace(/\bES\s*H[CO]\s*(\d+)\b/i, "ES HG $1");

  // Fix SFLO... or FL O... where 0 was read as O:
  cleaned = cleaned.replace(/\b(SFL|FL|ES\s*FL)\s*O(\d+)/i, (_, p1, p2) => `${p1} 0${p2.replace(/^0+/, "")}`);

  // Fix standalone FL ... -> ES FL ...
  cleaned = cleaned.replace(/\bFL\s*(\d{2,5}(?:-\d+)?)\b/i, "ES FL $1");

  const match = cleaned.match(
    /\b(?:(?:ES|ERSA|ER|SFL|FL|UNP|WP)\s*(?:(?:HG|HC|SM|FL|EC|M)\s*)?\d+(?:[\-_][A-Za-z0-9]+)?|C\s*[1I8HB\d]\d{2,4}(?:[\-_][A-Za-z0-9]+)?|G\s*\d{1,4}(?:[\-_]\d+)?|H\s*\d{4,6}(?:[\-_][A-Za-z0-9]+)?|T\s*\d{2,6}|\d{3,4}\.\d|(?:7021|7031|8013)|LG|LMD|HH)\b/i,
  );
  if (!match) return "";
  let code = match[0]
    .toUpperCase()
    .replace(/^SFL\s*/i, "ES FL ")
    .replace(/^FL\s*/i, "ES FL ")
    .replace(/^ES\s+HC\s+/i, "ES HG ")
    .replace(/\s*-\s*/g, "-")
    .replace(/^(ES|ERSA|ER|UNP|WP)\s*/i, "$1 ")
    .replace(/^(ES)\s*(HG|SM|FL|EC|M)\s*/i, "$1 $2 ")
    .replace(/\s+/g, " ")
    .trim();

  // If FL code has no dash but is 014 -> 014-1, 013 -> 013-1, 031 -> 031-1:
  code = code.replace(/\b(ES\s+FL\s+0(?:14|13|31))(?!\s*-\s*\d)\b/i, "$1-1");

  return code;
}

export function detectProductUnit(rawString: string, productName?: string): string | undefined {
  const s = (rawString || "").toLocaleLowerCase("az-AZ");
  const pName = (productName || "").toLocaleLowerCase("az-AZ");

  // 1. Explicit unit words in text
  if (/(?:\b|[\s_])(?:ədəd|eded|əded|edəd|adet|adət|əd|ed|шт|wt|pcs)(?:\b|[\s_.,]|$)/i.test(s)) {
    return "ədəd";
  }
  if (/(?:\b|[\s_])(?:kq|kg|кг|kilo|kiloqram)(?:\b|[\s_.,]|$)/i.test(s)) {
    return "kq";
  }
  if (/(?:\b|[\s_])(?:litr|litр|литр|ltr|lt)(?:\b|[\s_.,]|$)/i.test(s)) {
    return "litr";
  }
  if (/(?:\b|[\s_])(?:paçka|packa|paket|qutu|set)(?:\b|[\s_.,]|$)/i.test(s)) {
    return "paçka";
  }
  if (/(?:\b|[\s_])(?:rulo|top|rulon)(?:\b|[\s_.,]|$)/i.test(s)) {
    return "rulo";
  }
  if (/(?:\b|[\s_])(?:m2|m²|kv\.?m|kvadrat)(?:\b|[\s_.,]|$)/i.test(s)) {
    return "m²";
  }
  if (/(?:\b|[\s_])(?:metr|metp|метр|mtr|mew)(?:\b|[\s_.,]|$)/i.test(s)) {
    return "metr";
  }

  // 2. Product-type heuristics when unit is omitted by OCR:
  // "Tac", profillər, aksesuarlar adətən ədəd ilə satılır
  if (/\b(?:tac|qulp|aksesuar|birləşdirici|petlə|mexanizm)\b/i.test(pName)) {
    return "ədəd";
  }
  if (/\b(?:kley|yapışdırıcı|boya|lak|astar)\b/i.test(pName)) {
    return "litr";
  }

  return undefined;
}

const UNIT_CLEAN_REGEX = /(?:^|\s)(?:metr|metp|\u043c\u0435\u0442\u0440|\u0442\u0435\u0433|mew|mtr|ədəd|eded|əded|edəd|adet|adət|əd|ed|шт|wt|kq|kg|литр|litr|ltr|lt|paçka|paket|rulo|top|m2|m²)(?=\s|$)/gi;

function parseProductIdentity(rawValue: string): { name: string; code: string; unit?: string } {
  let value = rawValue
    .replace(/\u00a0/g, " ")
    .replace(/^[\s|:;,.[\]`'"\u2018\u2019\u201c\u201d\u00ab\u00bb\u00b4~*^°•·#№-]+/, "")
    .replace(/^(?:vw|ov|ow|oj|oy|ой|№|\d{1,3})[\s|:.)-]+/i, "")
    .replace(UNIT_CLEAN_REGEX, " ")
    .replace(/\s+/g, " ")
    .trim();

  const codePattern = /\b(?:(?:ES|ERSA|ER|SFL|FL|UNP|WP)\s*(?:(?:HG|HC|SM|FL|EC|M)\s*)?\d+(?:[\-_][A-Za-z0-9]+)?|C\s*[1I8HB\d]\d{2,4}(?:[\-_][A-Za-z0-9]+)?|G\s*\d{1,4}(?:[\-_]\d+)?|H\s*\d{4,6}(?:[\-_][A-Za-z0-9]+)?|T\s*\d{2,6}|\d{3,4}\.\d|(?:7021|7031|8013)|LG|LMD|HH)\b/gi;
  const codeMatches = Array.from(value.matchAll(codePattern));
  const codeMatch = codeMatches.at(-1);
  let code = "";

  if (codeMatch && codeMatch.index !== undefined) {
    code = normalizeArticleCode(codeMatch[0]);
    value = `${value.slice(0, codeMatch.index)} ${value.slice(codeMatch.index + codeMatch[0].length)}`;
  }

  let name = value
    .replace(UNIT_CLEAN_REGEX, " ")
    .replace(/^[\s|:;,.[\]`'"\u2018\u2019\u201c\u201d\u00ab\u00bb\u00b4~*^°•·#№-]+/, "")
    .replace(/^(?:vw|ov|ow|oj|oy|ой|№|\d{1,3})[\s|:.)-]+/i, "")
    .replace(/[\s|:;,.[\]`'"\u2018\u2019\u201c\u201d\u00ab\u00bb\u00b4~^°•·#№-]+$/, "")
    .replace(/\s+/g, " ")
    .trim();

  // Strip trailing partial code fragments left behind when OCR split the code across columns
  name = name.replace(/\s+[`'"]*\s*(?:ES|ERSA|SFL|FL|SM|HG|HC|E)\s*[-!~`'"\s]*(?:\d+[-!~`'"\s]*)?$/i, "").trim();
  name = name.replace(/[\s|:;,.[\]`'"\u2018\u2019\u201c\u201d\u00ab\u00bb\u00b4~^°•·#№-]+$/, "").trim();

  // Auto-fill code from catalog if missing and name matches
  if (!code && OFFICIAL_PRODUCT_CATALOG[name]) {
    code = OFFICIAL_PRODUCT_CATALOG[name];
  }

  const unit = detectProductUnit(rawValue, name);
  return { name, code, unit };
}

export function extractProductRowsFromTsv(tsv: string): ProductRowCandidate[] {
  type PositionedWord = {
    left: number;
    top: number;
    width: number;
    height: number;
    centerY: number;
    text: string;
  };

  let pageWidth = 0;
  const words: PositionedWord[] = [];
  for (const row of tsv.split(/\r?\n/)) {
    const fields = row.split("\t");
    if (fields.length < 12) continue;
    const level = Number(fields[0]);
    const left = Number(fields[6]);
    const top = Number(fields[7]);
    const width = Number(fields[8]);
    const height = Number(fields[9]);
    if (level === 1 && width > 0) pageWidth = width;
    if (level !== 5) continue;
    const text = fields.slice(11).join("\t").trim();
    if (!text || !Number.isFinite(left) || !Number.isFinite(top)) continue;
    words.push({ left, top, width, height, centerY: top + height / 2, text });
  }
  if (!pageWidth || !words.length) return [];

  const heights = words.map((word) => word.height).filter((height) => height > 0).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)] || 8;
  const rowTolerance = Math.max(4, medianHeight * 0.8);
  const groups: Array<{ centerY: number; words: PositionedWord[] }> = [];

  for (const word of [...words].sort((a, b) => a.centerY - b.centerY || a.left - b.left)) {
    const group = groups.find((candidate) => Math.abs(candidate.centerY - word.centerY) <= rowTolerance);
    if (group) {
      group.words.push(word);
      group.centerY = group.words.reduce((sum, item) => sum + item.centerY, 0) / group.words.length;
    } else {
      groups.push({ centerY: word.centerY, words: [word] });
    }
  }

  for (const group of groups) group.words.sort((a, b) => a.left - b.left);
  groups.sort((a, b) => a.centerY - b.centerY);
  const headerGroup = groups.find((group) => {
    const text = group.words.map((word) => word.text).join(" ");
    return /(?:№|наим|məhsul|mehsul|кол-во|qiymət|qiymet)/i.test(text);
  });
  if (!headerGroup) return [];

  const candidates: ProductRowCandidate[] = [];
  for (const group of groups) {
    if (group.centerY <= headerGroup.centerY + medianHeight * 0.45) continue;
    const hasRightSideNumber = group.words.some(
      (word) => word.left / pageWidth > 0.68 && /\d/.test(word.text),
    );
    if (!hasRightSideNumber) continue;

    const productColumn = group.words
      .filter((word) => {
        const ratio = word.left / pageWidth;
        return ratio >= 0.045 && ratio < 0.53 && !/^\d{1,3}$/.test(word.text);
      })
      .map((word) => word.text)
      .join(" ");
    const articleColumn = group.words
      .filter((word) => {
        const ratio = word.left / pageWidth;
        return ratio >= 0.53 && ratio < 0.655;
      })
      .map((word) => word.text)
      .join(" ");
    const unitColumn = group.words
      .filter((word) => {
        const ratio = word.left / pageWidth;
        return ratio >= 0.63 && ratio < 0.74;
      })
      .map((word) => word.text)
      .join(" ");
    const { name: parsedName, code: parsedCode, unit: parsedUnit } = parseProductIdentity(productColumn);
    const code = normalizeArticleCode(articleColumn) || parsedCode;
    const name = parsedName;
    const unit = detectProductUnit(unitColumn, name) || parsedUnit;
    if (
      !/[A-Za-zА-Яа-яƏəİıÖöÜüŞşÇçĞğ]/.test(name) ||
      name.length < 2 ||
      /(?:итого|cəmi|ümumi|отпусти|получил|nakladnaya|накладная|поставщик|покупатель|склад)/i.test(name)
    ) {
      continue;
    }
    const candidate: ProductRowCandidate = { name, code };
    if (unit) candidate.unit = unit;
    candidates.push(candidate);
  }
  return candidates;
}

export function extractProductNamesFromTsv(tsv: string): string[] {
  return extractProductRowsFromTsv(tsv).map((row) => row.name);
}

export function extractProductRowCandidates(rawText: string): ProductRowCandidate[] {
  return rawText
    .split(/\r?\n/)
    .map((line) => line.match(/^ARIX_PRODUCT_ROW:\s*(\{.+\})$/i)?.[1] || "")
    .filter(Boolean)
    .flatMap((payload) => {
      try {
        const parsed = JSON.parse(payload) as Partial<ProductRowCandidate>;
        const name = String(parsed.name || "").trim();
        if (!name) return [];
        const cand: ProductRowCandidate = { name, code: normalizeArticleCode(String(parsed.code || "")) };
        if (parsed.unit?.trim()) cand.unit = parsed.unit.trim();
        return [cand];
      } catch {
        return [];
      }
    });
}

export function extractProductNameCandidates(rawText: string): string[] {
  const legacy = rawText
    .split(/\r?\n/)
    .map((line) => line.match(/^ARIX_PRODUCT_NAME:\s*(.+)$/i)?.[1]?.trim() || "")
    .filter(Boolean);
  return legacy.length ? legacy : extractProductRowCandidates(rawText).map((row) => row.name);
}

function matchKnownProductName(rawName: string, knownProductNames: string[]): string {
  const candidate = normalizeForMatch(rawName);
  if (!candidate) return "";

  // Check exact or partial substring match first (for long catalog names)
  for (const name of knownProductNames) {
    const normalized = normalizeForMatch(name);
    if (normalized.length >= 6 && (candidate.includes(normalized) || normalized.includes(candidate))) {
      return name;
    }
  }

  const ranked = knownProductNames
    .map((name) => ({
      name,
      normalized: normalizeForMatch(name),
    }))
    .filter((item) => item.normalized)
    .map((item) => ({
      ...item,
      distance: levenshteinDistance(candidate, item.normalized),
    }))
    .sort((a, b) => a.distance - b.distance || a.normalized.length - b.normalized.length);
  const best = ranked[0];
  const second = ranked[1];
  if (!best) return "";
  const allowedDistance = Math.max(2, Math.min(4, Math.floor(Math.max(candidate.length, best.normalized.length) * 0.25)));
  return best.distance <= allowedDistance && (!second || best.distance < second.distance) ? best.name : "";
}

export function productNameNeedsRecovery(name: string): boolean {
  const normalized = normalizeForMatch(name);
  if (!normalized || /^mehsul\s+\d+$/.test(normalized)) return true;
  if (/^(?:es|ersa)\s*\d+$/.test(normalized)) return true;
  return (normalized.match(/[a-zəıöüşçğа-я]{2,}/gi) || []).length < 2;
}

export function mergeProductNameCandidates(
  items: ParsedSalesItem[],
  candidates: string[],
  knownProductNames: string[] = [],
): ParsedSalesItem[] {
  return mergeProductRowCandidates(
    items,
    candidates.map((name) => ({ name, code: "" })),
    knownProductNames,
  );
}

export function mergeProductRowCandidates(
  items: ParsedSalesItem[],
  candidates: ProductRowCandidate[],
  knownProductNames: string[] = [],
  knownProductCatalog?: Record<string, string>,
): ParsedSalesItem[] {
  if (!items.length || candidates.length !== items.length) return items;
  return items.map((item, index) => {
    const candidate = candidates[index];
    const candidateName = candidate?.name.trim() || "";
    const candidateWords = candidateName.match(/[A-Za-zА-Яа-яƏəİıÖöÜüŞşÇçĞğ]{2,}/g) || [];
    const knownName = matchKnownProductName(candidateName, knownProductNames) ||
      matchKnownProductName(item.name, knownProductNames);
    const candidateLooksClean = candidateWords.length >= 2 &&
      !/[|¦`'"“”«»!]/.test(candidateName) &&
      !/\b(?:ES|ERSA|SFL)\s*(?:HG|HC|SM|FL)?\s*\d/i.test(candidateName);
    const resolvedName = knownName || (candidateLooksClean ? candidateName : (candidateWords.length >= 2 ? candidateName : item.name));
    const resolvedCode = candidate?.code || item.code || (knownProductCatalog ? knownProductCatalog[resolvedName] : "") || "";
    const resolvedUnit = candidate?.unit || item.unit || detectProductUnit(item.name, resolvedName) || "metr";
    return {
      ...item,
      name: resolvedName,
      code: resolvedCode,
      unit: resolvedUnit,
    };
  });
}

export function matchKnownCustomer(rawCandidate: string, fullText: string, knownCustomers: string[]): string {
  const cleanedCandidate = cleanCustomerCandidate(rawCandidate);
  const validCustomers = knownCustomers
    .map((c) => c.trim())
    .filter((c) => c.length >= 2 && !EXCLUDED_NAMES.has(c.toLocaleLowerCase("az-AZ")));

  const sortedByLength = [...validCustomers].sort((a, b) => b.length - a.length);

  if (cleanedCandidate) {
    const matchCandidate = cleanedCandidate;
    const normCand = normalizeForMatch(matchCandidate);
    if (normCand && !EXCLUDED_NAMES.has(cleanedCandidate.toLocaleLowerCase("az-AZ"))) {
      const exact = sortedByLength.find((c) => normalizeForMatch(c) === normCand);
      if (exact) return exact;

      const partial = sortedByLength.find((c) => {
        const nc = normalizeForMatch(c);
        return nc.length >= 4 && (normCand.includes(nc) || nc.includes(normCand));
      });
      if (partial) return partial;

      const uniqueCustomers = Array.from(
        new Map(sortedByLength.map((customer) => [ocrComparable(customer), customer])).entries(),
      ).map(([normalized, customer]) => ({ normalized, customer }));
      const comparableCandidate = ocrComparable(matchCandidate);
      const ranked = uniqueCustomers
        .map(({ normalized, customer }) => ({
          customer,
          normalized,
          distance: levenshteinDistance(comparableCandidate, normalized),
        }))
        .sort((a, b) => a.distance - b.distance || a.normalized.length - b.normalized.length);
      const best = ranked[0];
      const second = ranked[1];
      const longestLength = Math.max(comparableCandidate.length, best?.normalized.length || 0);
      const allowedDistance = longestLength <= 8 ? 1 : longestLength <= 16 ? 2 : 3;
      if (
        best &&
        comparableCandidate.length >= 4 &&
        best.distance <= allowedDistance &&
        (!second || best.distance < second.distance)
      ) {
        return best.customer;
      }
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

  return cleanedCandidate || rawCandidate.trim();
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
      /(?:Покупатель|Nokynatenb|Tlokynarenb|Pokupatel|Müştəri|Musteri|Müsteri|Kimə|Kime)\s*[:-]?\s*(.+)$/i
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
    /(?:Склад|Cknag|Sklad|Hesab)\s*[:-]?\s*[«"]?([A-Za-zА-Яа-я0-9_.\s]+?)[»"]?(?:\s+Endirim|\n|$)/i
  );
  if (whMatch) warehouse = normalizeWarehouseName(whMatch[1]);

  let seller = "";
  const sellerMatch = normalizedText.match(
    /(?:Автор|Abtop|Avtor|Satıcı|Satici)\s*[:-]?\s*([A-Za-zА-Яа-яƏəİıÖöÜüŞşÇçĞğ\s]+?)(?:\s+Ödənilənlər|\n|$)/i
  );
  if (sellerMatch) seller = sellerMatch[1].trim();

  // 5. Extract Product Rows where qty * price ≈ total
  // Also handles cases where OCR missed the tiny decimal dot in qty (e.g. read "6.1" as "61" or "3.05" as "305")
  const items: ParsedSalesItem[] = [];
  let decimalCorrectionCount = 0;
  const itemLines = new Set<string>();
  for (const line of lines) {
    if (
      /^(?:№|Ad\s+Bar-kod|Ümumi\s+nəticə|ИТОГО|MTOTO|ITOGO|Поставщик|Покупатель|Склад|Hesab|Müştəri|Satıcı)/i.test(
        line
      )
    ) {
      continue;
    }

    const numTokens = Array.from(line.matchAll(NUMBER_TOKEN_PATTERN)).map((m) => ({
      raw: m[0],
      val: parseFlexibleNumber(m[0]),
      index: m.index ?? 0,
    }));

    // "1 300,00" -> one total, not "1" and "300,00". Tried first, strictly.
    const mergedThousandTokens = (() => {
      if (numTokens.length < 4) return null;
      const last = numTokens[numTokens.length - 1];
      const previous = numTokens[numTokens.length - 2];
      if (!/^\d{3}[.,]\d{2}$/.test(last.raw) || !/^\d{1,3}$/.test(previous.raw)) return null;
      const gap = line.slice(previous.index + previous.raw.length, last.index);
      if (!/^[ \u00a0]$/.test(gap)) return null;
      const raw = `${previous.raw}${last.raw}`;
      return [...numTokens.slice(0, -2), { raw, val: parseFlexibleNumber(raw), index: previous.index }];
    })();

    if (numTokens.length >= 3) {
      let matchedRow: { qty: number; price: number; discount: number; total: number; cutIdx: number } | null = null;

      if (mergedThousandTokens) {
        const [nQty, nPrice, nTotal] = mergedThousandTokens.slice(-3);
        const reconciled = reconcileSalesRowNumbers(
          nQty.raw,
          nPrice.raw,
          "0",
          nTotal.raw,
          items.map((item) => item.price),
        );
        if (reconciled && !reconciled.corrected) {
          matchedRow = {
            qty: reconciled.quantity,
            price: reconciled.price,
            discount: 0,
            total: reconciled.total,
            cutIdx: nQty.index,
          };
        }
      }

      const last = numTokens[numTokens.length - 1];
      const hasDiscountMention = /(?:endirim|скидк|скидка|discount)/i.test(normalizedText);
      const isNakladnaya = sourceFormat === "nakladnaya" || /(?:Расходная|накладная|Покупатель|ИТОГО|MTOTO|ITOGO|metr)/i.test(normalizedText);

      // Candidate 3 tokens (quantity, price, total)
      let matched3: { qty: number; price: number; discount: number; total: number; cutIdx: number; corrected: boolean } | null = null;
      if (numTokens.length >= 3) {
        const nQty = numTokens[numTokens.length - 3];
        const nPrice = numTokens[numTokens.length - 2];
        const reconciled = reconcileSalesRowNumbers(
          nQty.raw,
          nPrice.raw,
          "0",
          last.raw,
          items.map((item) => item.price),
          /^\d{1,3}\s+(?=\D)/.test(line),
        );
        if (reconciled) {
          matched3 = {
            qty: reconciled.quantity,
            price: reconciled.price,
            discount: 0,
            total: reconciled.total,
            cutIdx: nQty.index,
            corrected: Boolean(reconciled.corrected),
          };
        }
      }

      // Candidate 4 tokens (quantity, price, discount, total) - only when discount is explicitly present
      // or 3 tokens could not produce an uncorrected match
      let matched4: { qty: number; price: number; discount: number; total: number; cutIdx: number; corrected: boolean } | null = null;
      if (numTokens.length >= 4 && (hasDiscountMention || !matched3 || matched3.corrected)) {
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
          matched4 = {
            qty: reconciled.quantity,
            price: reconciled.price,
            discount: reconciled.discount,
            total: reconciled.total,
            cutIdx: nQty.index,
            corrected: Boolean(reconciled.corrected),
          };
        }
      }

      if (!matchedRow) {
        // In standard nakladnaya (or when discount is not present), prioritize 3-column row match
        // (qty * price = total) so that product codes (e.g. 2702 in ES 2702) are never consumed as quantity.
        if (matched3 && (!matched4 || !hasDiscountMention || isNakladnaya)) {
          matchedRow = matched3;
          if (matched3.corrected) decimalCorrectionCount += 1;
        } else if (matched4) {
          matchedRow = matched4;
          if (matched4.corrected) decimalCorrectionCount += 1;
        } else if (matched3) {
          matchedRow = matched3;
          if (matched3.corrected) decimalCorrectionCount += 1;
        }
      }

      if (matchedRow) {
        const leftPart = line.slice(0, matchedRow.cutIdx).trim();
        if (leftPart && !/Ümumi|ИТОГО|MTOTO|ITOGO|ANAnas|Membran\s+Group/i.test(leftPart)) {
          const { name: prodName, code: prodCode, unit: prodUnit } = parseProductIdentity(leftPart);
          const detectedUnit = prodUnit || detectProductUnit(line, prodName) || "metr";
          itemLines.add(line);
          items.push({
            no: items.length + 1,
            name: prodName || `Məhsul ${items.length + 1}`,
            code: prodCode,
            unit: detectedUnit,
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
      const readingsInLine = extractAmountReadings(line);
      if (readingsInLine.length > 0) {
        candidateTotals.push(...readingsInLine[readingsInLine.length - 1]);
      } else if (i + 1 < lines.length) {
        const nextReadings = extractAmountReadings(lines[i + 1]);
        if (nextReadings.length > 0) {
          candidateTotals.push(...nextReadings[nextReadings.length - 1]);
        }
      }
    }
    // Check Məbləğ 872.70 ₼
    if (/\b(?:Məbləğ|Mebleg)\b/i.test(line) && !/Vergi/i.test(line)) {
      const m = line.match(/(?:Məbləğ|Mebleg)\s*[:-]?\s*(\d[\d\s]*[.,]\d{2})/i);
      if (m) candidateTotals.push(...(extractAmountReadings(m[1])[0] || []));
    }
  }

  let salesAmount = 0;
  let verified = false;
  let verificationNote = "";

  // Also check if any decimal in the last 3 lines matches itemsSum (in case OCR garbled the word "ИТОГО:")
  if (itemsSum > 0 && candidateTotals.length === 0) {
    // Product rows themselves must not count as the footer total.
    const tailText = lines.slice(-3).filter((line) => !itemLines.has(line)).join(" ");
    const tailDecimals = extractAmountReadings(tailText).flat();
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
      verificationNote = `✓ Riyazi təsdiq: ${items.length} məhsul sətrinin cəmi (${itemsSum.toFixed(2)} ₼) ilə yekun məbləğ (${salesAmount.toFixed(2)} ₼) üst-üstə düşür.`;
    } else if (candidateTotals.length > 0) {
      // Mismatch between extracted rows sum and footer total -> DO NOT auto-commit silently!
      // Prefer the reading closest to the rows (e.g. 109,00 over "8 109,00").
      const maxCand = [...candidateTotals].sort(
        (a, b) => Math.abs(a - itemsSum) - Math.abs(b - itemsSum) || b - a,
      )[0];
      salesAmount = Math.max(maxCand, itemsSum);
      verified = false;
      verificationNote = `⚠️ Riyazi fərq: Oxunan ${items.length} sətrin cəmi (${itemsSum.toFixed(2)} ₼) ilə yekun rəqəm (${maxCand.toFixed(2)} ₼) fərqlidir! Səhv etməmək üçün borca avtomatik yazılmadı — yoxlayıb «Qaiməni qeydə al» düyməsinə basın.`;
    } else {
      // Without a footer total a completely missed row cannot be detected.
      salesAmount = itemsSum;
      verified = false;
      verificationNote = `⚠️ Yekun (ИТОГО) rəqəmi oxunmadı. ${items.length} sətrin cəmi ${itemsSum.toFixed(2)} ₼ — sətir buraxılmadığını yoxlayıb «Qaiməni qeydə al» düyməsinə basın.`;
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

  if (decimalCorrectionCount > 0) {
    verificationNote += ` OCR-in səhv oxuduğu rəqəm və ya itirdiyi onluq işarəsi ${decimalCorrectionCount} məhsul sətrində riyazi və qiymət uyğunluğu ilə avtomatik bərpa edildi.`;
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
