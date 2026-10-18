export type StatementCell = string | number | boolean | Date | null | undefined;
export type StatementMatrix = StatementCell[][];

export type StatementField =
  | "date"
  | "valueDate"
  | "transactionId"
  | "amount"
  | "debit"
  | "credit"
  | "direction"
  | "description"
  | "counterpartyName"
  | "counterpartyIban"
  | "reference"
  | "currency";

export type StatementMapping = Record<StatementField, number | null>;

export type ParsedStatementRow = {
  sourceRow: number;
  transactionId: string;
  amount: number;
  currency: string;
  date: string;
  valueDate?: string;
  counterpartyName: string;
  counterpartyIban: string;
  description: string;
  bankReference: string;
};

export type StatementRowPreview = {
  sourceRow: number;
  valid: boolean;
  error: string;
  transaction?: ParsedStatementRow;
};

export const statementFields: Array<{ key: StatementField; label: string }> = [
  { key: "date", label: "İşlem tarihi" },
  { key: "valueDate", label: "Valör tarihi" },
  { key: "transactionId", label: "İşlem / sıra no" },
  { key: "amount", label: "İmzalı tutar" },
  { key: "debit", label: "Borç / giden" },
  { key: "credit", label: "Alacak / gelen" },
  { key: "direction", label: "İşlem yönü" },
  { key: "description", label: "Açıklama" },
  { key: "counterpartyName", label: "Karşı taraf" },
  { key: "counterpartyIban", label: "Karşı taraf IBAN" },
  { key: "reference", label: "Banka referansı" },
  { key: "currency", label: "Para birimi" },
];

const aliases: Record<StatementField, string[]> = {
  date: ["tarih", "islem tarihi", "islem tarih saat", "transaction date", "book date", "kayit tarihi"],
  valueDate: ["valor", "valor tarihi", "value date", "valuta"],
  transactionId: ["islem no", "islem numarasi", "hareket no", "sira no", "transaction id", "dekont no"],
  amount: ["tutar", "islem tutari", "meblag", "amount", "hareket tutari"],
  debit: ["borc", "giden", "cikis", "cekilen", "debit", "borc tutari"],
  credit: ["alacak", "gelen", "giris", "yatirilan", "credit", "alacak tutari"],
  direction: ["yon", "islem yonu", "hareket tipi", "islem tipi", "direction"],
  description: ["aciklama", "islem aciklamasi", "detay", "description", "islem detayi"],
  counterpartyName: ["karsi taraf", "gonderen alici", "gonderen", "alici", "unvan", "isim", "musteri adi"],
  counterpartyIban: ["iban", "karsi iban", "gonderen iban", "alici iban", "counterparty iban"],
  reference: ["referans", "referans no", "banka referansi", "reference", "fis no"],
  currency: ["para birimi", "doviz cinsi", "doviz", "currency", "kur"],
};

const normalize = (value: StatementCell) => String(value ?? "")
  .toLocaleLowerCase("tr-TR")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/ı/g, "i")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

export const statementCellText = (value: StatementCell) => {
  if (value instanceof Date) return value.toISOString();
  return String(value ?? "").trim();
};

const parseCsvLine = (line: string, delimiter: string) => {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
};

export const parseStatementCsv = (content: string): StatementMatrix => {
  const cleanContent = content.replace(/^\uFEFF/, "");
  const sample = cleanContent.split(/\r?\n/).slice(0, 8).join("\n");
  const delimiters = [";", ",", "\t"];
  const delimiter = delimiters
    .map((candidate) => ({ candidate, count: sample.split(candidate).length - 1 }))
    .sort((left, right) => right.count - left.count)[0]?.candidate ?? ";";
  return cleanContent.split(/\r?\n/).filter((line) => line.trim()).map((line) => parseCsvLine(line, delimiter));
};

export const detectStatementHeader = (rows: StatementMatrix) => {
  let bestIndex = 0;
  let bestScore = -1;
  rows.slice(0, 20).forEach((row, index) => {
    const headers = row.map(normalize);
    const score = Object.values(aliases).reduce((total, fieldAliases) => total + (fieldAliases.some((alias) => headers.some((header) => header === alias || header.includes(alias))) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });
  return bestIndex;
};

export const suggestStatementMapping = (headers: StatementCell[]): StatementMapping => {
  const normalizedHeaders = headers.map(normalize);
  return Object.fromEntries(statementFields.map(({ key }) => {
    const exactIndex = normalizedHeaders.findIndex((header) => aliases[key].includes(header));
    const partialIndex = normalizedHeaders.findIndex((header) => aliases[key].some((alias) => header.includes(alias) || alias.includes(header)));
    return [key, exactIndex >= 0 ? exactIndex : partialIndex >= 0 ? partialIndex : null];
  })) as StatementMapping;
};

export const parseStatementNumber = (value: StatementCell) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  let text = String(value ?? "").trim();
  if (!text) return 0;
  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  text = text.replace(/[()\s₺$€£₼]/g, "").replace(/[^0-9,.-]/g, "");
  const comma = text.lastIndexOf(",");
  const dot = text.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const thousands = decimal === "," ? /\./g : /,/g;
    text = text.replace(thousands, "").replace(decimal, ".");
  } else if (comma >= 0) {
    text = text.replace(/\./g, "").replace(",", ".");
  } else if ((text.match(/\./g) ?? []).length > 1 || (/\.\d{3}$/.test(text) && !/\.\d{1,2}$/.test(text))) {
    text = text.replace(/\./g, "");
  }
  const number = Math.abs(Number(text)) || 0;
  return negative ? -number : number;
};

export const parseStatementDate = (value: StatementCell) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === "number" && value > 20_000 && value < 100_000) {
    return new Date(Date.UTC(1899, 11, 30) + value * 86_400_000).toISOString();
  }
  const text = String(value ?? "").trim();
  if (!text) return "";
  const localized = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (localized) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = localized;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second));
    return Number.isNaN(date.getTime()) ? "" : date.toISOString();
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
};

const mappedCell = (row: StatementCell[], index: number | null) => index == null ? undefined : row[index];
const isOutgoing = (value: StatementCell) => /giden|cikis|borc|debit|odeme|withdraw|out/i.test(normalize(value));

export const buildStatementPreview = ({
  rows,
  headerRow,
  mapping,
  sourceName,
  defaultCurrency,
}: {
  rows: StatementMatrix;
  headerRow: number;
  mapping: StatementMapping;
  sourceName: string;
  defaultCurrency: string;
}): StatementRowPreview[] => rows.slice(headerRow + 1).filter((row) => row.some((cell) => statementCellText(cell))).map((row, offset) => {
  const sourceRow = headerRow + offset + 2;
  const date = parseStatementDate(mappedCell(row, mapping.date));
  const debit = Math.abs(parseStatementNumber(mappedCell(row, mapping.debit)));
  const credit = Math.abs(parseStatementNumber(mappedCell(row, mapping.credit)));
  let amount = parseStatementNumber(mappedCell(row, mapping.amount));
  if (credit || debit) amount = credit || -debit;
  else if (amount > 0 && isOutgoing(mappedCell(row, mapping.direction))) amount *= -1;
  if (!date) return { sourceRow, valid: false, error: "İşlem tarihi okunamadı." };
  if (!amount) return { sourceRow, valid: false, error: "Tutar boş veya sıfır." };
  const explicitId = statementCellText(mappedCell(row, mapping.transactionId)) || statementCellText(mappedCell(row, mapping.reference));
  const dateKey = date.slice(0, 10).replace(/-/g, "");
  const fileKey = normalize(sourceName).replace(/\s+/g, "-").slice(0, 48) || "ekstre";
  const transactionId = explicitId || `FILE-${fileKey}-${sourceRow}-${dateKey}-${Math.round(Math.abs(amount) * 100)}`;
  return {
    sourceRow,
    valid: true,
    error: "",
    transaction: {
      sourceRow,
      transactionId,
      amount,
      currency: statementCellText(mappedCell(row, mapping.currency)).toUpperCase().slice(0, 3) || defaultCurrency,
      date,
      valueDate: parseStatementDate(mappedCell(row, mapping.valueDate)) || undefined,
      counterpartyName: statementCellText(mappedCell(row, mapping.counterpartyName)),
      counterpartyIban: statementCellText(mappedCell(row, mapping.counterpartyIban)).replace(/\s/g, "").toUpperCase(),
      description: statementCellText(mappedCell(row, mapping.description)),
      bankReference: statementCellText(mappedCell(row, mapping.reference)),
    },
  };
});

