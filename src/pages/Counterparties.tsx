import { useEffect, useMemo, useRef, useState } from "react";
import { requestJson } from "../api";

const cx = (...s: (string | false | undefined)[]) => s.filter(Boolean).join(" ");

type CounterpartyKind = "suppliers" | "customers";
type ViewMode = "information" | "statistics";
type ContactType = "person" | "company";
type ApiCounterparty = {
  id: number;
  kind: "customer" | "supplier";
  name: string;
  type?: ContactType;
  phone?: string;
  email?: string;
  description?: string;
  address?: string;
  balance?: number;
  owner?: string;
  createdAt?: string;
  status?: "Aktiv" | "Yoxlama" | "Standart" | "Bloklu";
  loyalty?: string;
  birthday?: string;
  gender?: "" | "KiÅŸi" | "QadÄ±n";
};

type Props = {
  isDark: boolean;
  kind: CounterpartyKind;
};

type CounterpartyRow = {
  id: number;
  name: string;
  code: string;
  type: ContactType;
  phone: string;
  email: string;
  description: string;
  address: string;
  balance: number;
  added: string;
  created: string;
  status: "Aktiv" | "Yoxlama" | "Standart" | "Bloklu";
  loyalty?: string;
  birthday?: string;
  gender?: "Kişi" | "Qadın" | "";
};

type CustomerPriceRow = {
  id: string | null;
  customerId: number;
  productId: number;
  productName: string;
  code: string;
  sku: string;
  unit: string;
  store: string;
  standardPrice: number;
  customerPrice: number | null;
  effectivePrice: number;
  source: "customer" | "store";
};

type PriceImportRow = {
  sourceRow: number;
  productId: number | null;
  productName: string;
  code: string;
  sku: string;
  store: string;
  price: number | null;
  error: string;
};

type CounterpartyForm = {
  type: ContactType;
  isDefault: boolean;
  name: string;
  email: string;
  phone: string;
  taxId: string;
  address: string;
  description: string;
  discount: string;
  loyaltyCard: string;
  birthday: string;
  gender: "" | "Kişi" | "Qadın";
};

const emptyForm = (): CounterpartyForm => ({
  type: "company",
  isDefault: false,
  name: "",
  email: "",
  phone: "",
  taxId: "",
  address: "",
  description: "",
  discount: "",
  loyaltyCard: "",
  birthday: "",
  gender: "",
});

const apiKindFor = (kind: CounterpartyKind) => kind === "customers" ? "customer" : "supplier";
const codePrefixFor = (kind: CounterpartyKind) => kind === "customers" ? "CUS" : "SUP";
const formatDate = (value?: string) => {
  if (!value) return new Date().toLocaleDateString("az-Latn-AZ");
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("az-Latn-AZ");
};
const mapApiCounterparty = (item: ApiCounterparty, kind: CounterpartyKind): CounterpartyRow => ({
  id: item.id,
  code: `${codePrefixFor(kind)}-${String(item.id).padStart(3, "0")}`,
  name: item.name,
  type: item.type ?? "company",
  phone: item.phone ?? "",
  email: item.email ?? "",
  description: item.description ?? "",
  address: item.address ?? "",
  balance: Number(item.balance ?? 0),
  added: item.owner ?? "Arif Mahmud",
  created: formatDate(item.createdAt),
  status: item.status ?? "Aktiv",
  loyalty: item.loyalty ?? "",
  birthday: item.birthday,
  gender: item.gender as CounterpartyRow["gender"],
});

const sampleRows: Record<CounterpartyKind, CounterpartyRow[]> = {
  suppliers: [
    { id: 1, code: "SUP-001", name: "ERSA", type: "company", phone: "+994 12 555 10 20", email: "office@ersa.az", description: "Əsas parça təchizatçısı", address: "Bakı", balance: 12450, added: "Arif Mahmud", created: "18/11/2024", status: "Aktiv" },
    { id: 2, code: "SUP-002", name: "AriX təchizat", type: "company", phone: "+994 50 410 22 18", email: "sales@arix.az", description: "Yerli alış kanalı", address: "Sumqayıt", balance: 3180, added: "Arif Mahmud", created: "14/04/2025", status: "Aktiv" },
    { id: 3, code: "SUP-003", name: "Global Textile", type: "company", phone: "+90 212 440 19 22", email: "export@globaltextile.com", description: "İdxal müqaviləsi yoxlanılır", address: "İstanbul", balance: 0, added: "Arif Mahmud", created: "21/07/2025", status: "Yoxlama" },
    { id: 4, code: "SUP-004", name: "Shanghai Real Trading", type: "company", phone: "+86 515 8548 0800", email: "info@srt.cn", description: "Dekorativ materiallar", address: "Çin", balance: 8630, added: "Arif Mahmud", created: "06/11/2024", status: "Aktiv" },
    { id: 5, code: "SUP-005", name: "Orchard Decorative Materials", type: "company", phone: "", email: "contact@orchard.cn", description: "PVC aksesuarlar", address: "Çin", balance: 540, added: "Arif Mahmud", created: "03/12/2025", status: "Aktiv" },
    { id: 6, code: "SUP-006", name: "PLASCO", type: "company", phone: "+994 55 200 11 10", email: "", description: "Daxili bazar", address: "Gəncə", balance: 0, added: "Arif Mahmud", created: "16/12/2024", status: "Standart" },
  ],
  customers: [
    { id: 1, code: "CUS-001", name: "ABANOZ", type: "company", phone: "+994 55 710 33 12", email: "info@abanoz.az", description: "Topdan müştəri", address: "Bakı", balance: 1240, added: "Arif Mahmud", created: "07/08/2025", status: "Aktiv", loyalty: "LC-1001" },
    { id: 2, code: "CUS-002", name: "AHC MAKINA", type: "company", phone: "+90 312 440 12 90", email: "", description: "", address: "Ankara", balance: 8950, added: "Arif Mahmud", created: "25/07/2025", status: "Aktiv", loyalty: "LC-1002" },
    { id: 3, code: "CUS-003", name: "Akköz Grup", type: "company", phone: "", email: "sales@akkoz.com", description: "Regional satış", address: "Yozgat", balance: 0, added: "Arif Mahmud", created: "16/04/2025", status: "Standart", loyalty: "" },
    { id: 4, code: "CUS-004", name: "Arma Balon Kapak", type: "company", phone: "+90 216 220 44 18", email: "", description: "Bayram Aydın", address: "İstanbul", balance: 430, added: "Arif Mahmud", created: "08/11/2024", status: "Aktiv", loyalty: "LC-1004" },
    { id: 5, code: "CUS-005", name: "Asil Büro", type: "company", phone: "+994 77 300 22 44", email: "office@asil.az", description: "", address: "Bursa", balance: 0, added: "Arif Mahmud", created: "10/06/2025", status: "Aktiv", loyalty: "" },
    { id: 6, code: "CUS-006", name: "Kassa müştərisi", type: "person", phone: "", email: "", description: "Standart satış profili", address: "", balance: 0, added: "Sistem", created: "01/01/2026", status: "Standart", loyalty: "" },
  ],
};

const I = {
  Search: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="11" cy="11" r="7" /><path d="M21 21l-3.5-3.5" />
    </svg>
  ),
  Filter: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 5h18" /><path d="M7 12h10" /><path d="M10 19h4" />
    </svg>
  ),
  Plus: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Download: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3v12" /><path d="M8 11l4 4 4-4" /><path d="M21 21H3" />
    </svg>
  ),
  Upload: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 21V9" /><path d="M8 13l4-4 4 4" /><path d="M21 3H3" />
    </svg>
  ),
  Edit: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  Trash: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v5M14 11v5" />
    </svg>
  ),
  Mail: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 5h16v14H4z" /><path d="m4 7 8 6 8-6" />
    </svg>
  ),
  Phone: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6.4 6.4l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2Z" />
    </svg>
  ),
  MapPin: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" />
    </svg>
  ),
  Calendar: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M7 3v4M17 3v4M4 8h16M5 5h14v16H5z" />
    </svg>
  ),
  Receipt: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6M9 16h4" />
    </svg>
  ),
  Close: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  ArrowLeft: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  ),
  Check: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m5 12 4 4L19 6" />
    </svg>
  ),
  ChevronDown: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
};

const money = (value: number) =>
  value.toLocaleString("az-Latn-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const whole = (value: number) => value.toLocaleString("az-Latn-AZ");

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

const tableStats = (row: CounterpartyRow, kind: CounterpartyKind) => {
  const base = row.balance || row.id * 720;
  const count = kind === "customers" ? row.id * 7 + 8 : row.id * 4 + 6;
  const total = base * (kind === "customers" ? 20 + row.id : 17 + row.id);
  const paid = Math.max(total - row.balance, 0);
  const refundCount = row.id % 3 === 0 ? 1 : 0;
  const refundSum = refundCount ? total * 0.045 : 0;
  const expenses = kind === "customers" ? refundSum : total * 0.03;
  const refundDebt = refundSum ? refundSum * 0.12 : 0;

  return {
    count,
    total,
    paid,
    average: total / Math.max(count, 1),
    refundCount,
    refundSum,
    expenses,
    debt: row.balance,
    refundDebt,
    balance: row.balance - refundDebt,
  };
};

function CustomerPricesPanel({
  customerId,
  isDark,
  editing,
  saveRef,
  resetRef,
}: {
  customerId: number;
  isDark: boolean;
  editing: boolean;
  saveRef: React.MutableRefObject<((customerIdOverride?: number) => Promise<void>) | null>;
  resetRef: React.MutableRefObject<(() => void) | null>;
}) {
  const [store, setStore] = useState("ERSA DEPO");
  const [rows, setRows] = useState<CustomerPriceRow[]>([]);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [query, setQuery] = useState("");
  const [importRows, setImportRows] = useState<PriceImportRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const border = isDark ? "border-white/10" : "border-slate-200";
  const muted = isDark ? "text-slate-400" : "text-slate-500";

  const loadPrices = () => {
    setMessage("");
    requestJson<{ data: CustomerPriceRow[] }>(`/api/customer-prices?customerId=${customerId}&store=${encodeURIComponent(store)}`)
      .then((payload) => {
        setRows(payload.data ?? []);
        setDrafts(Object.fromEntries((payload.data ?? []).map((item) => [
          item.productId,
          item.customerPrice === null ? "" : String(item.customerPrice),
        ])));
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "Qiymətlər yüklənmədi."));
  };

  useEffect(() => {
    loadPrices();
  }, [customerId, store]);

  useEffect(() => {
    resetRef.current = () => {
      setDrafts(Object.fromEntries(rows.map((item) => [
        item.productId,
        item.customerPrice === null ? "" : String(item.customerPrice),
      ])));
      setImportRows([]);
      setMessage("");
    };
    saveRef.current = async (customerIdOverride?: number) => {
      const targetCustomerId = customerIdOverride ?? customerId;
      const changed = rows.filter((item) => {
        const next = drafts[item.productId]?.trim() ?? "";
        const current = item.customerPrice === null ? "" : String(item.customerPrice);
        return next !== current;
      });
      const invalid = changed.find((item) => {
        const raw = drafts[item.productId]?.trim() ?? "";
        return raw !== "" && (!Number.isFinite(Number(raw)) || Number(raw) < 0);
      });
      if (invalid) {
        setMessage(`${invalid.productName} üçün qiyməti düzgün daxil et.`);
        throw new Error("Müştəri qiymətlərində səhv var.");
      }

      const toSave = changed
        .filter((item) => (drafts[item.productId]?.trim() ?? "") !== "")
        .map((item) => ({ productId: item.productId, store, price: Number(drafts[item.productId]) }));
      const toDelete = changed.filter((item) => (drafts[item.productId]?.trim() ?? "") === "" && item.customerPrice !== null);

      if (toSave.length) {
        await requestJson("/api/customer-prices/bulk", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ customerId: targetCustomerId, entries: toSave }),
        });
      }
      await Promise.all(toDelete.map((item) => requestJson(
        `/api/customer-prices?customerId=${targetCustomerId}&productId=${item.productId}&store=${encodeURIComponent(store)}`,
        { method: "DELETE" }
      )));
      await loadPrices();
    };
    return () => {
      saveRef.current = null;
      resetRef.current = null;
    };
  }, [customerId, drafts, resetRef, rows, saveRef, store]);

  const filteredRows = rows.filter((item) =>
    [item.productName, item.code, item.sku].join(" ").toLowerCase().includes(query.toLowerCase())
  );
  const validImportRows = importRows.filter((item) => !item.error && item.productId !== null && item.price !== null);
  const effectiveDraftPrice = (item: CustomerPriceRow) => {
    const raw = drafts[item.productId]?.trim() ?? "";
    const parsed = Number(raw);
    return raw !== "" && Number.isFinite(parsed) ? parsed : item.standardPrice;
  };

  const normalizeHeader = (value: unknown) => String(value ?? "")
    .trim()
    .toLocaleLowerCase("az")
    .replace(/[ıİ]/g, "i")
    .replace(/[əƏ]/g, "e")
    .replace(/[şŞ]/g, "s")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .replace(/[^a-z0-9]/g, "");

  const downloadTemplate = async () => {
    const { default: writeXlsxFile } = await import("write-excel-file/browser");
    const header = ["Məhsul", "Kod", "Artikul", "Mağaza", "Standart qiymət", "Müştəri qiyməti"].map((value) => ({
      value,
      fontWeight: "bold" as const,
      backgroundColor: "#4F46E5",
      color: "#FFFFFF",
    }));
    const data: import("write-excel-file/browser").SheetData = [
      header,
      ...rows.map((item) => [
        { value: item.productName },
        { value: item.code },
        { value: item.sku },
        { value: store },
        { value: item.standardPrice, format: "0.00" },
        item.customerPrice === null ? null : { value: item.customerPrice, format: "0.00" },
      ]),
    ];
    await writeXlsxFile(data, {
      columns: [{ width: 32 }, { width: 18 }, { width: 20 }, { width: 20 }, { width: 18 }, { width: 20 }],
    }).toFile(`musteri-qiymetleri-${store.toLowerCase().replace(/\s+/g, "-")}.xlsx`);
  };

  const parseImportFile = async (file?: File) => {
    if (!file) return;
    setMessage("");
    try {
      const { readSheet } = await import("read-excel-file/browser");
      const sheetRows = await readSheet(file);
      const headers = (sheetRows[0] ?? []).map((value) => String(value ?? ""));
      const rawRows = sheetRows.slice(1)
        .filter((row) => row.some((value) => String(value ?? "").trim()))
        .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
      const codeMap = new Map(rows.filter((item) => item.code).map((item) => [normalizeHeader(item.code), item]));
      const skuMap = new Map(rows.filter((item) => item.sku).map((item) => [normalizeHeader(item.sku), item]));
      const seen = new Set<string>();
      const parsed = rawRows.map((raw, index): PriceImportRow => {
        const values = Object.fromEntries(Object.entries(raw).map(([key, value]) => [normalizeHeader(key), value]));
        const code = String(values.kod ?? values.code ?? "").trim();
        const sku = String(values.artikul ?? values.sku ?? values.article ?? "").trim();
        const rowStore = String(values.magaza ?? values.store ?? store).trim() || store;
        const priceRaw = values.musteriqiymeti ?? values.xususiqiymet ?? values.qiymet ?? values.price ?? "";
        const price = typeof priceRaw === "number"
          ? priceRaw
          : Number(String(priceRaw).trim().replace(/\s/g, "").replace(",", "."));
        const product = codeMap.get(normalizeHeader(code)) ?? skuMap.get(normalizeHeader(sku));
        const key = product ? `${product.productId}|${rowStore}` : "";
        let error = "";
        if (!product) error = "Kod və ya artikul üzrə məhsul tapılmadı.";
        else if (rowStore !== store) error = "Excel sətrindəki mağaza hazırda seçilmiş mağazadan fərqlidir.";
        else if (!Number.isFinite(price) || price < 0) error = "Müştəri qiyməti düzgün deyil.";
        else if (seen.has(key)) error = "Eyni məhsul və mağaza faylda təkrarlanır.";
        if (!error && key) seen.add(key);
        return {
          sourceRow: index + 2,
          productId: product?.productId ?? null,
          productName: product?.productName ?? "",
          code,
          sku,
          store: rowStore,
          price: Number.isFinite(price) ? price : null,
          error,
        };
      });
      setImportRows(parsed);
      setMessage(parsed.length ? "" : "Excel faylında məlumat sətri tapılmadı.");
    } catch (error) {
      setImportRows([]);
      setMessage(error instanceof Error ? error.message : "Excel faylı oxunmadı.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const importPrices = async () => {
    if (!validImportRows.length) {
      setMessage("İmport ediləcək düzgün sətir yoxdur.");
      return;
    }
    setImporting(true);
    setMessage("");
    try {
      setDrafts((current) => ({
        ...current,
        ...Object.fromEntries(validImportRows.map((item) => [Number(item.productId), String(item.price)])),
      }));
      setImportRows([]);
      setMessage(`${validImportRows.length} qiymət redaktəyə əlavə edildi. Yuxarıdakı Saxla ilə təsdiqlə.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Qiymətlər import edilmədi.");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 className="text-base font-semibold">Müştəri satış qiymətləri</h3>
          <p className={cx("mt-1 text-xs", muted)}>Xüsusi qiymət yoxdursa mağaza standartı tətbiq olunur.</p>
        </div>
        <div className={cx("inline-flex self-start overflow-hidden rounded-lg border p-0.5", border, isDark ? "bg-slate-950/40" : "bg-slate-50")}>
          {["ERSA DEPO", "ERSA ANTREPO"].map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setStore(item)}
              className={cx("h-8 rounded-md px-3 text-xs font-semibold transition", store === item ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200" : muted, isDark && store === item && "bg-indigo-500/20 text-indigo-200 ring-white/10")}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <I.Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Məhsul, kod və ya artikul axtar..."
            className={cx("h-11 w-full rounded-xl border bg-transparent pl-10 pr-3 text-sm outline-none", border)}
          />
        </div>
        <details className="group relative shrink-0">
          <summary className={cx("flex h-11 cursor-pointer list-none items-center gap-2 rounded-xl border px-4 text-sm font-semibold", border, isDark ? "hover:bg-white/7" : "hover:bg-slate-50")}>
            Excel
            <I.ChevronDown className="h-4 w-4 transition group-open:rotate-180" />
          </summary>
          <div className={cx("absolute right-0 z-20 mt-2 w-52 rounded-xl border p-1.5 shadow-xl", border, isDark ? "bg-slate-900" : "bg-white")}>
            <button type="button" onClick={downloadTemplate} className={cx("flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm", isDark ? "hover:bg-white/7" : "hover:bg-slate-50")}>
              <I.Download className="h-4 w-4" />
              Şablonu endir
            </button>
            <button type="button" disabled={!editing} onClick={() => fileInputRef.current?.click()} className={cx("flex h-10 w-full items-center gap-2 rounded-lg px-3 text-left text-sm", isDark ? "hover:bg-white/7" : "hover:bg-slate-50", !editing && "cursor-not-allowed opacity-40")}>
              <I.Upload className="h-4 w-4" />
              Fayldan import et
            </button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(event) => parseImportFile(event.target.files?.[0])}
          />
        </details>
      </div>

      {importRows.length > 0 && (
        <div className={cx("overflow-hidden rounded-2xl border", border, isDark ? "bg-white/5" : "bg-indigo-50/35")}>
          <div className={cx("flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between", border)}>
            <div>
              <div className="font-semibold">Excel import önizləməsi</div>
              <div className={cx("mt-0.5 text-xs", muted)}>
                {validImportRows.length} düzgün · {importRows.length - validImportRows.length} xətalı sətir
              </div>
            </div>
            <div className="flex gap-2">
              <button type="button" onClick={() => setImportRows([])} className={cx("h-9 rounded-lg border px-3 text-xs font-semibold", border)}>Ləğv et</button>
              <button type="button" onClick={importPrices} disabled={!validImportRows.length || importing} className={cx("surface-primary h-9 rounded-lg px-3 text-xs font-semibold", (!validImportRows.length || importing) && "opacity-50")}>
                {importing ? "Əlavə edilir..." : `${validImportRows.length} qiyməti əlavə et`}
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-auto">
            <table className="w-full min-w-[700px] text-xs">
              <thead className={isDark ? "bg-white/5 text-slate-400" : "bg-white/70 text-slate-500"}>
                <tr>
                  <th className="px-4 py-2 text-left">Excel sətri</th>
                  <th className="px-4 py-2 text-left">Məhsul</th>
                  <th className="px-4 py-2 text-left">Mağaza</th>
                  <th className="px-4 py-2 text-right">Qiymət</th>
                  <th className="px-4 py-2 text-left">Nəticə</th>
                </tr>
              </thead>
              <tbody>
                {importRows.map((item) => (
                  <tr key={`${item.sourceRow}-${item.code}-${item.sku}`} className={cx("border-t", border)}>
                    <td className="px-4 py-2 tabular-nums">{item.sourceRow}</td>
                    <td className="px-4 py-2">
                      <div className="font-semibold">{item.productName || "Tapılmadı"}</div>
                      <div className={muted}>{item.code || "-"} · {item.sku || "-"}</div>
                    </td>
                    <td className="px-4 py-2">{item.store}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{item.price === null ? "-" : `${money(item.price)} ₼`}</td>
                    <td className={cx("px-4 py-2", item.error ? "text-rose-600" : "text-emerald-600")}>{item.error || "İmporta hazırdır"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className={cx("overflow-hidden rounded-2xl border", border)}>
        <div className="max-h-[52vh] overflow-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className={isDark ? "bg-white/5 text-slate-400" : "bg-slate-50 text-slate-500"}>
              <tr>
                <th className="px-4 py-3 text-left">Məhsul</th>
                <th className="px-4 py-3 text-right">Mağaza standartı</th>
                <th className="px-4 py-3 text-right">Müştəri qiyməti</th>
                <th className="px-4 py-3 text-right">Tətbiq olunan</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((item) => (
                <tr key={item.productId} className={cx("border-t", border)}>
                  <td className="px-4 py-3">
                    <div className="font-semibold">{item.productName}</div>
                    <div className={cx("mt-0.5 text-xs", muted)}>{item.code} · {item.sku || "Artikulsuz"} · {item.unit}</div>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(item.standardPrice)} ₼</td>
                  <td className="px-4 py-3 text-right">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={!editing}
                      value={drafts[item.productId] ?? ""}
                      onChange={(event) => setDrafts((current) => ({ ...current, [item.productId]: event.target.value }))}
                      placeholder={item.standardPrice.toFixed(2)}
                      className={cx("h-9 w-32 rounded-lg border bg-transparent px-3 text-right tabular-nums outline-none focus:border-indigo-500", border, !editing && "cursor-not-allowed opacity-60")}
                    />
                    {editing && <div className={cx("mt-1 text-[11px]", muted)}>Boş saxla: standart qiymət</div>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="font-semibold tabular-nums">{money(effectiveDraftPrice(item))} ₼</div>
                    <div className={cx("mt-0.5 text-xs", (drafts[item.productId]?.trim() ?? "") ? "text-indigo-600" : muted)}>
                      {(drafts[item.productId]?.trim() ?? "") ? "Müştəri qiyməti" : "Mağaza standartı"}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {message && <div className={cx("text-sm", message.includes("saxlanıldı") || message.includes("qaytarıldı") ? "text-emerald-600" : "text-rose-600")}>{message}</div>}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
  isDark,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  isDark: boolean;
}) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-start gap-3 text-left">
      <span className={cx("mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition", checked ? "bg-indigo-600" : isDark ? "bg-slate-700" : "bg-slate-200")}>
        <span className={cx("h-5 w-5 rounded-full bg-white shadow transition", checked && "translate-x-5")} />
      </span>
      <span>
        <span className={cx("block text-sm font-medium", isDark ? "text-slate-100" : "text-slate-700")}>{label}</span>
        {hint && <span className={cx("block text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{hint}</span>}
      </span>
    </button>
  );
}

function CreatePanel({
  kind,
  isDark,
  onClose,
  onSave,
}: {
  kind: CounterpartyKind;
  isDark: boolean;
  onClose: () => void;
  onSave: (form: CounterpartyForm, savePrices?: (customerIdOverride?: number) => Promise<void>) => Promise<void>;
}) {
  const [form, setForm] = useState<CounterpartyForm>(() => emptyForm());
  const [view, setView] = useState<"card" | "prices">("card");
  const [saving, setSaving] = useState(false);
  const priceSaveRef = useRef<((customerIdOverride?: number) => Promise<void>) | null>(null);
  const priceResetRef = useRef<(() => void) | null>(null);
  const input = isDark
    ? "glass-control-dark border-white/10 text-slate-100 placeholder-slate-500"
    : "glass-control border-slate-200 text-slate-800 placeholder-slate-400";
  const border = isDark ? "border-white/10" : "border-slate-200/80";
  const subtle = isDark ? "text-slate-400" : "text-slate-500";
  const tile = isDark ? "glass-control-dark border-white/10" : "glass-control border-white/70";
  const field = cx("h-11 w-full rounded-xl border px-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10", input);
  const setField = <K extends keyof CounterpartyForm>(key: K, value: CounterpartyForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };
  const title = kind === "suppliers" ? "Təchizatçı yarat" : "Müştəri yarat";
  const submit = async () => {
    if (!form.name.trim() || saving) return;
    setSaving(true);
    try {
      await onSave(form, kind === "customers" ? priceSaveRef.current ?? undefined : undefined);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className={cx(
        "fixed inset-0 z-40 flex items-center justify-center px-4 py-6",
        isDark ? "bg-slate-950/55 backdrop-blur-sm" : "bg-slate-900/30 backdrop-blur-sm"
      )}
      onClick={onClose}
    >
      <div
        className={cx(
          "erp-modal-shell flex w-full max-w-5xl flex-col overflow-hidden rounded-2xl border",
          isDark ? "glass-panel-dark border-white/10 text-slate-100" : "glass-panel border-white/70 text-slate-900"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={cx("border-b", border)}>
          <div className="flex items-center justify-between gap-3 px-5 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <button type="button" onClick={onClose} aria-label="Yaratmadan çıx" className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", border, isDark ? "hover:bg-white/10" : "hover:bg-slate-50")}>
                <I.Close className="h-4 w-4" />
              </button>
              <div>
                <h2 className="text-xl font-semibold">{title}</h2>
                <p className={cx("text-sm", subtle)}>Yeni kart məlumatları</p>
              </div>
            </div>
            <button type="button" onClick={submit} disabled={!form.name.trim() || saving} className={cx("surface-primary inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold", (!form.name.trim() || saving) && "opacity-50")}>
              <I.Check className="h-4 w-4" />
              {saving ? "Saxlanır..." : "Saxla"}
            </button>
          </div>
          {kind === "customers" && (
            <div className="flex gap-2 px-5 pb-3">
              <button type="button" onClick={() => setView("card")} className={cx("relative h-10 text-sm font-medium", view === "card" ? "text-indigo-600" : subtle, view === "card" && "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-indigo-600")}>Kart</button>
              <button type="button" onClick={() => setView("prices")} className={cx("relative h-10 text-sm font-medium", view === "prices" ? "text-indigo-600" : subtle, view === "prices" && "after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full after:bg-indigo-600")}>Satış qiymətləri</button>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {kind === "customers" && (
            <div className={view === "prices" ? "block" : "hidden"}>
              <CustomerPricesPanel customerId={0} isDark={isDark} editing saveRef={priceSaveRef} resetRef={priceResetRef} />
            </div>
          )}
          <div className={cx("mx-auto w-full max-w-4xl space-y-5", view === "card" || kind === "suppliers" ? "block" : "hidden")}>
            <section className={cx("rounded-2xl border p-5", tile)}>
              <div className="mb-5"><h3 className="font-semibold">Əsas məlumatlar</h3><p className={cx("mt-1 text-xs", subtle)}>Kartın adı, növü və standart seçim parametri.</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="sm:col-span-2"><span className={cx("mb-1.5 block text-xs font-medium", subtle)}>Ad <span className="text-rose-500">*</span></span><input className={field} value={form.name} onChange={(e) => setField("name", e.target.value)} /></label>
                <label><span className={cx("mb-1.5 block text-xs font-medium", subtle)}>Kart növü</span><select className={field} value={form.type} onChange={(e) => setField("type", e.target.value as ContactType)}><option value="company">Hüquqi şəxs</option><option value="person">Fiziki şəxs</option></select></label>
                <div className="flex items-end pb-2"><Toggle checked={form.isDefault} onChange={(next) => setField("isDefault", next)} label="Standart kontragent" hint="Sənədlərdə sürətli seçim üçün." isDark={isDark} /></div>
              </div>
            </section>
            <section className={cx("rounded-2xl border p-5", tile)}>
              <div className="mb-5"><h3 className="font-semibold">Əlaqə məlumatları</h3><p className={cx("mt-1 text-xs", subtle)}>Telefon, e-poçt, VÖEN və ünvan məlumatları.</p></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label><span className={cx("mb-1.5 block text-xs font-medium", subtle)}>Telefon</span><input className={field} value={form.phone} onChange={(e) => setField("phone", e.target.value)} /></label>
                <label><span className={cx("mb-1.5 block text-xs font-medium", subtle)}>E-poçt</span><input className={field} value={form.email} onChange={(e) => setField("email", e.target.value)} /></label>
                <label><span className={cx("mb-1.5 block text-xs font-medium", subtle)}>VÖEN / kod</span><input className={field} value={form.taxId} onChange={(e) => setField("taxId", e.target.value)} /></label>
                <label><span className={cx("mb-1.5 block text-xs font-medium", subtle)}>Ünvan</span><input className={field} value={form.address} onChange={(e) => setField("address", e.target.value)} /></label>
              </div>
            </section>
            {kind === "customers" && (
              <section className={cx("rounded-2xl border p-5", tile)}>
                <div className="mb-5"><h3 className="font-semibold">Loyallıq məlumatları</h3><p className={cx("mt-1 text-xs", subtle)}>Endirim, loyallıq kartı və şəxsi məlumatlar.</p></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label><span className={cx("mb-1.5 block text-xs font-medium", subtle)}>Endirim, %</span><input className={field} value={form.discount} onChange={(e) => setField("discount", e.target.value)} /></label>
                  <label><span className={cx("mb-1.5 block text-xs font-medium", subtle)}>Loyallıq kartı</span><input className={field} value={form.loyaltyCard} onChange={(e) => setField("loyaltyCard", e.target.value)} /></label>
                  <label><span className={cx("mb-1.5 block text-xs font-medium", subtle)}>Doğum tarixi</span><input type="date" className={field} value={form.birthday} onChange={(e) => setField("birthday", e.target.value)} /></label>
                  <label><span className={cx("mb-1.5 block text-xs font-medium", subtle)}>Cins</span><select className={field} value={form.gender} onChange={(e) => setField("gender", e.target.value as CounterpartyForm["gender"])}><option value="">Seçilməyib</option><option value="Kişi">Kişi</option><option value="Qadın">Qadın</option></select></label>
                </div>
              </section>
            )}
            <section className={cx("rounded-2xl border p-5", tile)}><label><span className={cx("mb-1.5 block text-xs font-medium", subtle)}>Qeyd</span><textarea className={cx("min-h-28 w-full rounded-xl border px-3 py-2 text-sm outline-none focus:border-indigo-500", input)} value={form.description} onChange={(e) => setField("description", e.target.value)} /></label></section>
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateMenu({
  kind,
  isDark,
  onCreate,
  onClose,
}: {
  kind: CounterpartyKind;
  isDark: boolean;
  onCreate: () => void;
  onClose: () => void;
}) {
  const menuSurface = isDark ? "glass-panel-dark ring-1 ring-white/10" : "glass-panel ring-1 ring-white/55";
  const iconSurface = isDark ? "glass-control-dark ring-1 ring-white/10" : "glass-control ring-1 ring-white/70";
  const itemClass = cx(
    "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition",
    isDark ? "text-slate-200 hover:bg-white/7" : "text-slate-700 hover:bg-white/70"
  );

  const runPassive = () => {
    onClose();
  };

  return (
    <div className={cx("surface-popover absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-2xl p-2", menuSurface)} role="menu">
      <button type="button" className={itemClass} onClick={onCreate} role="menuitem">
        <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-indigo-600", iconSurface)}>
          <I.Plus className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">Yeni kart</span>
          <span className={cx("block text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
            {kind === "suppliers" ? "Təchizatçı əlavə et" : "Müştəri əlavə et"}
          </span>
        </span>
      </button>
      <button type="button" className={itemClass} onClick={runPassive} role="menuitem">
        <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-emerald-600", iconSurface)}>
          <I.Upload className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">Import</span>
          <span className={cx("block text-xs", isDark ? "text-slate-400" : "text-slate-500")}>CSV və Excel faylı</span>
        </span>
      </button>
      <button type="button" className={itemClass} onClick={runPassive} role="menuitem">
        <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500", iconSurface)}>
          <I.Download className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium">Export</span>
          <span className={cx("block text-xs", isDark ? "text-slate-400" : "text-slate-500")}>Cari siyahını çıxar</span>
        </span>
      </button>
    </div>
  );
}

function CustomerCardOverview({
  row,
  kind,
  isDark,
  onOpenPrices,
}: {
  row: CounterpartyRow;
  kind: CounterpartyKind;
  isDark: boolean;
  onOpenPrices: () => void;
}) {
  const isSupplier = kind === "suppliers";
  const [activityView, setActivityView] = useState<"products" | "money" | "bonus">("products");
  const subtle = isDark ? "text-slate-400" : "text-slate-500";
  const border = isDark ? "border-white/10" : "border-slate-200/80";
  const card = isDark ? "glass-control-dark border-white/10" : "glass-control border-white/70";
  const soft = isDark ? "bg-white/5" : "bg-slate-50/80";
  const base = row.balance || row.id * 740;
  const table = tableStats(row, kind);
  const openDocs = row.id % 4 + 1;
  const overdueDocs = row.balance > 0 ? Math.min(row.id % 3 + 1, openDocs) : 0;
  const creditLimit = Math.max(Math.ceil((row.balance + base * 4) / 1000) * 1000, 5000);
  const creditRate = Math.min(Math.round((Math.max(row.balance, 0) / creditLimit) * 100), 100);
  const store = row.id % 2 === 0 ? "ERSA ANTREPO" : "ERSA DEPO";
  const paymentTerm = row.id % 2 === 0 ? "30 gün" : "15 gün";
  const productOps = isSupplier
    ? [
        { date: "8 aprel 2026", title: `Alış sənədi #${280 + row.id}`, meta: `Mağaza ${store} · ${row.name}`, amount: -(base * 3.4 + 940), accent: "bg-violet-500" },
        { date: "2 aprel 2026", title: `Gömrük xərci #${190 + row.id}`, meta: `Maya xərci · ${row.added}`, amount: -(base * 0.6 + 220), accent: "bg-amber-500" },
      ]
    : [
        { date: "13 may 2026", title: `Satış sənədi #${2300 + row.id}`, meta: `Mağaza ${store} · ${row.name}`, amount: base * 2.8 + 1850, accent: "bg-indigo-500" },
        { date: "7 may 2026", title: `Satış sənədi #${2400 + row.id}`, meta: `Mağaza ${store} · ${row.name}`, amount: base * 1.4 + 720, accent: "bg-cyan-500" },
      ];
  const visibleOps = activityView === "products"
    ? productOps
    : activityView === "money"
      ? [{ date: "2 iyun 2026", title: isSupplier ? `Təchizatçıya ödəniş #${510 + row.id}` : `Müştəridən ödəniş #${510 + row.id}`, meta: `Hesablaşma · ${row.name}`, amount: base * 1.2 + 300, accent: "bg-emerald-500" }]
      : [{ date: "28 may 2026", title: `Bonus əməliyyatı #${120 + row.id}`, meta: `${row.loyalty || "Loyallıq kartı"} · ${row.name}`, amount: base * 0.05, accent: "bg-amber-500" }];
  const miniCards = isSupplier
    ? [
        ["Alış borcu", `${money(row.balance)} ₼`, row.balance > 0 ? "Ödəniş gözləyir" : "Borcsuz", "text-rose-500"],
        ["Alış dövriyyəsi", `${money(table.total)} ₼`, `${table.count} sənəd`, "text-indigo-600"],
        ["Açıq sənədlər", whole(openDocs), overdueDocs ? `${overdueDocs} gecikmiş` : "Gecikmə yoxdur", overdueDocs ? "text-amber-600" : "text-emerald-600"],
        ["Maya xərcləri", `${money(table.expenses)} ₼`, "Sənədə bağlı", "text-cyan-600"],
      ]
    : [
        ["Satış borcu", `${money(row.balance)} ₼`, row.balance > 0 ? "Ödəniş gözləyir" : "Borcsuz", "text-rose-500"],
        ["Satış dövriyyəsi", `${money(table.total)} ₼`, `${table.count} sənəd`, "text-indigo-600"],
        ["Orta çek", `${money(table.average)} ₼`, "Son əməliyyatlara görə", "text-cyan-600"],
        ["Açıq sənədlər", whole(openDocs), overdueDocs ? `${overdueDocs} gecikmiş` : "Gecikmə yoxdur", overdueDocs ? "text-amber-600" : "text-emerald-600"],
      ];

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      <section className={cx("rounded-2xl border p-5", card)}>
        {false && (
        <div className="hidden">
          <div>
            <div className={cx("text-xs font-medium uppercase tracking-wide", subtle)}>Kart məlumatı</div>
            <h3 className="mt-1 text-xl font-semibold">{row.name}</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className={cx("rounded-full px-3 py-1 text-xs font-medium", soft)}>{row.code}</span>
              <span className={cx("rounded-full px-3 py-1 text-xs font-medium", soft)}>{row.type === "company" ? "Şirkət" : "Fiziki şəxs"}</span>
              <span className={cx("rounded-full px-3 py-1 text-xs font-medium", row.status === "Bloklu" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700", isDark && "bg-white/10")}>{row.status}</span>
            </div>
          </div>
          {!isSupplier && (
            <button type="button" onClick={onOpenPrices} className="inline-flex h-10 items-center justify-center rounded-xl bg-indigo-50 px-4 text-sm font-semibold text-indigo-700 hover:bg-indigo-100">
              Satış qiymətləri
            </button>
          )}
        </div>
        )}

        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold">Əlaqə məlumatları</h3>
            <p className={cx("mt-1 text-xs", subtle)}>Telefon, e-poçt və ünvan məlumatları.</p>
          </div>
          <span className={cx("rounded-full px-3 py-1 text-xs font-medium", soft)}>{row.type === "company" ? "Şirkət" : "Fiziki şəxs"}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {[
            [<I.Phone className="h-4 w-4" />, "Telefon", row.phone || "Əlavə edilməyib"],
            [<I.Mail className="h-4 w-4" />, "E-poçt", row.email || "Əlavə edilməyib"],
            [<I.MapPin className="h-4 w-4" />, "Ünvan", row.address || "Əlavə edilməyib"],
          ].map(([icon, label, value]) => (
            <div key={String(label)} className={cx("rounded-xl border p-3", border, isDark ? "bg-white/[0.03]" : "bg-white/70")}>
              <div className={cx("flex items-center gap-2 text-xs font-medium", subtle)}>{icon}{label}</div>
              <div className="mt-1 truncate text-sm font-semibold">{value}</div>
            </div>
          ))}
        </div>

        {row.description && (
          <div className={cx("mt-4 rounded-xl border p-3 text-sm", border, soft)}>
            {row.description}
          </div>
        )}
      </section>

      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {miniCards.map(([label, value, helper, color]) => (
          <article key={label} className={cx("rounded-2xl border p-4", card)}>
            <div className={cx("text-xs font-medium", subtle)}>{label}</div>
            <div className={cx("mt-2 text-lg font-semibold tabular-nums", color)}>{value}</div>
            <div className={cx("mt-1 text-xs", subtle)}>{helper}</div>
          </article>
        ))}
      </section>

      <section className="grid gap-3 lg:grid-cols-[1fr_1.3fr]">
        <article className={cx("rounded-2xl border p-4", card)}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">{isSupplier ? "Alış parametrləri" : "Satış parametrləri"}</h3>
            <I.Receipt className="h-5 w-5 text-indigo-500" />
          </div>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between gap-3"><span className={subtle}>Əsas mağaza</span><span className="font-medium">{store}</span></div>
            <div className="flex justify-between gap-3"><span className={subtle}>Ödəniş müddəti</span><span className="font-medium">{paymentTerm}</span></div>
            <div className="flex justify-between gap-3"><span className={subtle}>{isSupplier ? "Ödənilən məbləğ" : "Loyallıq kartı"}</span><span className="font-medium">{isSupplier ? `${money(table.paid)} ₼` : row.loyalty || "Yoxdur"}</span></div>
            <div className="flex justify-between gap-3"><span className={subtle}>Limit istifadəsi</span><span className="font-medium">{creditRate}%</span></div>
          </div>
          <div className={cx("mt-4 h-2 overflow-hidden rounded-full", soft)}>
            <div className={cx("h-full rounded-full", creditRate > 70 ? "bg-rose-500" : creditRate > 40 ? "bg-amber-500" : "bg-emerald-500")} style={{ width: `${creditRate}%` }} />
          </div>
        </article>

        <article className={cx("rounded-2xl border p-4", card)}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-semibold">Son sənədlər</h3>
              <p className={cx("mt-1 text-xs", subtle)}>Kartla bağlı son sənəd hərəkətləri</p>
            </div>
            <div className={cx("inline-flex rounded-xl border p-1", border, soft)}>
              {[
                ["products", isSupplier ? "Alışlar" : "Satışlar"],
                ["money", "Pul fəaliyyəti"],
                ...(!isSupplier ? [["bonus", "Bonus"]] : []),
              ].map(([key, label]) => (
                <button key={key} type="button" onClick={() => setActivityView(key as typeof activityView)} className={cx("h-8 rounded-lg px-3 text-xs font-medium", activityView === key ? "bg-white text-indigo-700 shadow-sm" : subtle, isDark && activityView === key && "bg-white/10 text-indigo-200")}>{label}</button>
              ))}
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {visibleOps.map((operation) => (
              <div key={operation.title} className={cx("flex overflow-hidden rounded-xl border", border)}>
                <div className={cx("w-1 shrink-0", operation.accent)} />
                <div className="min-w-0 flex-1 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-indigo-600">{operation.title}</div>
                      <div className={cx("mt-1 truncate text-xs", subtle)}>{operation.meta}</div>
                    </div>
                    <div className={cx("shrink-0 text-sm font-semibold tabular-nums", operation.amount < 0 ? "text-rose-500" : "text-emerald-600")}>{money(operation.amount)} ₼</div>
                  </div>
                  <div className={cx("mt-3 flex items-center justify-between border-t pt-2 text-xs", border, subtle)}><span>{operation.date}</span><span>Təsdiqlənib</span></div>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

function DetailPanel({
  row,
  kind,
  isDark,
  onClose,
  onUpdated,
}: {
  row: CounterpartyRow;
  kind: CounterpartyKind;
  isDark: boolean;
  onClose: () => void;
  onUpdated: (updated: CounterpartyRow) => void;
}) {
  const isSupplier = kind === "suppliers";
  const [detailView, setDetailView] = useState<"overview" | "prices">("overview");
  const [activityView, setActivityView] = useState<"products" | "money" | "bonus">("products");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<CounterpartyRow>(() => ({ ...row }));
  const [saveMessage, setSaveMessage] = useState("");
  const priceSaveRef = useRef<((customerIdOverride?: number) => Promise<void>) | null>(null);
  const priceResetRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    setDetailView("overview");
    setActivityView("products");
    setEditing(false);
    setDraft({ ...row });
    setSaveMessage("");
  }, [row]);
  const title = isSupplier ? "Təchizatçı kartı" : "Müştəri kartı";
  const border = isDark ? "border-white/10" : "border-slate-200/80";
  const subtle = isDark ? "text-slate-400" : "text-slate-500";
  const tile = isDark ? "glass-control-dark border-white/10" : "glass-control border-white/70";
  const input = isDark
    ? "border-white/10 bg-slate-950/30 text-slate-100"
    : "border-slate-200 bg-white text-slate-800";
  const editField = cx("h-11 w-full rounded-xl border px-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10", input);
  const setDraftField = <K extends keyof CounterpartyRow>(key: K, value: CounterpartyRow[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const cancelEditing = () => {
    setDraft({ ...row });
    priceResetRef.current?.();
    setSaveMessage("");
    setEditing(false);
  };
  const saveChanges = async () => {
    if (!draft.name.trim()) {
      setSaveMessage("Ad sahəsi mütləqdir.");
      return;
    }
    setSaving(true);
    setSaveMessage("");
    try {
      const payload = await requestJson<{ data: ApiCounterparty }>(`/api/counterparties/${row.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          type: draft.type,
          phone: draft.phone,
          email: draft.email,
          description: draft.description,
          address: draft.address,
          status: draft.status,
          loyalty: draft.loyalty ?? "",
          birthday: draft.birthday ?? "",
          gender: draft.gender ?? "",
        }),
      });
      await priceSaveRef.current?.();
      const updated = mapApiCounterparty(payload.data, kind);
      setDraft(updated);
      onUpdated(updated);
      setEditing(false);
      setSaveMessage("Kart məlumatları saxlanıldı.");
      window.dispatchEvent(new CustomEvent("arix:counterparties-updated"));
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Kart məlumatları saxlanmadı.");
    } finally {
      setSaving(false);
    }
  };
  const statBase = row.balance || row.id * 740;
  const operations = isSupplier
    ? [
        { date: "8 aprel 2026", title: `Alış sifarişi #${280 + row.id}`, meta: `Anbar ERSA ANTREPO · ${row.name}`, amount: -(statBase * 3.4 + 940), accent: "bg-rose-500" },
        { date: "2 aprel 2026", title: `Ödəniş #${190 + row.id}`, meta: `Hesablaşma · ${row.added}`, amount: statBase * 1.2 + 320, accent: "bg-emerald-500" },
      ]
    : [
        { date: "13 may 2026", title: `Satış sifarişi #${2300 + row.id}`, meta: `Mağaza ERSA DEPO · ${row.name}`, amount: statBase * 2.8 + 1850, accent: "bg-indigo-500" },
        { date: "7 may 2026", title: `Satış sənədi #${2400 + row.id}`, meta: `Mağaza ERSA DEPO · ${row.name}`, amount: statBase * 1.4 + 720, accent: "bg-cyan-500" },
      ];
  const stats = isSupplier
    ? [
        ["Alış borcu", money(row.balance)],
        ["Alış sayı", whole(row.id * 4 + 9)],
        ["Alış cəmi", money(statBase * 18.2)],
        ["Geri qaytarma", money(row.id * 120)],
        ["Xərc cəmi", money(statBase * 7.4)],
        ["Balans", money(row.balance)],
      ]
    : [
        ["Satış borcu", money(row.balance)],
        ["Satış sayı", whole(row.id * 6 + 12)],
        ["Satış cəmi", money(statBase * 22.5)],
        ["Orta çek", money(Math.max(statBase / 3, 125))],
        ["Bonus kartı", row.loyalty || "Yoxdur"],
        ["Balans", money(row.balance)],
      ];
  const visibleOperations = activityView === "products"
    ? operations
    : activityView === "money"
      ? [{
          date: "2 iyun 2026",
          title: isSupplier ? `Təchizatçıya ödəniş #${510 + row.id}` : `Müştəridən ödəniş #${510 + row.id}`,
          meta: `Kassa · ${row.name}`,
          amount: statBase * 1.2 + 300,
          accent: "bg-emerald-500",
        }]
      : [{
          date: "28 may 2026",
          title: `Bonus əməliyyatı #${120 + row.id}`,
          meta: `${row.loyalty || "Loyallıq kartı"} · ${row.name}`,
          amount: statBase * 0.05,
          accent: "bg-amber-500",
        }];
  const detailLimit = Math.max(Math.ceil((row.balance + statBase * 4) / 1000) * 1000, 5000);
  const detailLimitRate = Math.min(Math.round((Math.max(row.balance, 0) / detailLimit) * 100), 100);
  const detailOpenDocs = row.id % 4 + 1;
  const detailOverdueDocs = row.balance > 0 ? Math.min(row.id % 3 + 1, detailOpenDocs) : 0;
  const detailStore = row.id % 2 === 0 ? "ERSA ANTREPO" : "ERSA DEPO";
  const detailPaymentTerm = row.id % 2 === 0 ? "30 gün" : "15 gün";

  return (
    <div
      className={cx(
        "fixed inset-0 z-50 flex justify-end backdrop-blur-[2px]",
        isDark ? "bg-slate-950/60" : "bg-slate-900/25"
      )}
      onClick={onClose}
    >
      <div
        className={cx(
          "erp-drawer-shell flex h-full w-full max-w-5xl flex-col overflow-hidden border-l shadow-2xl",
          isDark ? "glass-panel-dark border-white/10 text-slate-100" : "glass-panel border-white/70 text-slate-900"
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={cx("border-b", border)}>
          <div className="flex items-center justify-between gap-3 px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            {editing && (
              <button type="button" onClick={cancelEditing} aria-label="Redaktədən çıx" className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", border, isDark ? "hover:bg-white/10" : "hover:bg-slate-50")}>
                <I.ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className={cx("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl text-base font-bold shadow-sm ring-1", isDark ? "bg-indigo-500/15 text-indigo-200 ring-white/10" : "bg-gradient-to-br from-indigo-50 to-sky-50 text-indigo-700 ring-indigo-100")}>
              {initials(row.name)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-2xl font-semibold tracking-tight">{editing ? (isSupplier ? "Təchizatçı redaktəsi" : "Müştəri redaktəsi") : row.name}</h2>
                {!editing && <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold", row.status === "Bloklu" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-700", isDark && "bg-white/10")}>{row.status}</span>}
              </div>
              <div className={cx("mt-1 flex flex-wrap items-center gap-3 text-sm", subtle)}>
                <span>{editing ? row.name : title}</span>
                <span className={cx("rounded-md px-2 py-0.5 text-xs font-medium tabular-nums", isDark ? "bg-white/10" : "bg-slate-100 text-slate-600")}>{row.code}</span>
                <span>{row.created}</span>
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => editing ? saveChanges() : setEditing(true)}
              disabled={saving}
              className={cx("inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-sm font-medium", editing && "surface-primary border-transparent", border, isDark ? "hover:bg-white/10" : "hover:bg-white/70", saving && "opacity-60")}
            >
              {editing ? <I.Check className="h-4 w-4" /> : <I.Edit className="h-4 w-4" />}
              {saving ? "Saxlanır..." : editing ? "Saxla" : "Düzəlt"}
            </button>
            <button type="button" title="Kartı sil" aria-label="Kartı sil" className={cx("flex h-9 w-9 items-center justify-center rounded-lg text-rose-500", isDark ? "hover:bg-rose-500/10" : "hover:bg-rose-50")}>
              <I.Trash className="h-4 w-4" />
            </button>
            <button type="button" onClick={onClose} aria-label="Bağla" className={cx("flex h-9 w-9 items-center justify-center rounded-lg", isDark ? "hover:bg-white/10" : "hover:bg-slate-100")}>
              <I.Close className="h-4 w-4" />
            </button>
          </div>
          </div>
          {!isSupplier && (
            <div className="flex gap-2 px-5 pb-3">
              <button
                type="button"
                onClick={() => setDetailView("overview")}
                className={cx("h-9 rounded-xl px-4 text-sm font-medium", detailView === "overview" ? "surface-primary" : isDark ? "bg-white/5 text-slate-300 hover:bg-white/10" : "bg-slate-100 text-slate-600 hover:bg-slate-200/70")}
              >
                Kart məlumatları
              </button>
              <button
                type="button"
                onClick={() => setDetailView("prices")}
                className={cx("h-9 rounded-xl px-4 text-sm font-medium", detailView === "prices" ? "surface-primary" : isDark ? "bg-white/5 text-slate-300 hover:bg-white/10" : "bg-slate-100 text-slate-600 hover:bg-slate-200/70")}
              >
                Satış qiymətləri
              </button>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {!isSupplier && detailView === "prices" && (
            <CustomerPricesPanel customerId={row.id} isDark={isDark} editing={editing} saveRef={priceSaveRef} resetRef={priceResetRef} />
          )}
          {editing && (detailView === "overview" || isSupplier) && (
            <div className="mx-auto grid w-full max-w-4xl gap-5">
              <section className={cx("rounded-2xl border p-5", tile)}>
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">Əsas məlumatlar</h3>
                    <p className={cx("mt-1 text-xs", subtle)}>Kartın adı, növü və cari statusu.</p>
                  </div>
                  <span className={cx("rounded-lg px-2.5 py-1 text-xs font-medium", isDark ? "bg-white/10" : "bg-slate-100 text-slate-600")}>{row.code}</span>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="sm:col-span-2">
                    <span className={cx("mb-1.5 block text-xs font-medium", subtle)}>Ad <span className="text-rose-500">*</span></span>
                    <input value={draft.name} onChange={(event) => setDraftField("name", event.target.value)} className={editField} />
                  </label>
                  <label>
                    <span className={cx("mb-1.5 block text-xs font-medium", subtle)}>Kart növü</span>
                    <select value={draft.type} onChange={(event) => setDraftField("type", event.target.value as ContactType)} className={editField}>
                      <option value="company">Hüquqi şəxs</option>
                      <option value="person">Fiziki şəxs</option>
                    </select>
                  </label>
                  <label>
                    <span className={cx("mb-1.5 block text-xs font-medium", subtle)}>Status</span>
                    <select value={draft.status} onChange={(event) => setDraftField("status", event.target.value as CounterpartyRow["status"])} className={editField}>
                      {(["Aktiv", "Yoxlama", "Standart", "Bloklu"] as CounterpartyRow["status"][]).map((status) => <option key={status}>{status}</option>)}
                    </select>
                  </label>
                </div>
              </section>

              <section className={cx("rounded-2xl border p-5", tile)}>
                <div className="mb-5">
                  <h3 className="font-semibold">Əlaqə məlumatları</h3>
                  <p className={cx("mt-1 text-xs", subtle)}>Telefon, e-poçt və ünvan məlumatları.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className={cx("mb-1.5 block text-xs font-medium", subtle)}>Telefon</span>
                    <input value={draft.phone} onChange={(event) => setDraftField("phone", event.target.value)} className={editField} />
                  </label>
                  <label>
                    <span className={cx("mb-1.5 block text-xs font-medium", subtle)}>E-poçt</span>
                    <input value={draft.email} onChange={(event) => setDraftField("email", event.target.value)} className={editField} />
                  </label>
                  <label className="sm:col-span-2">
                    <span className={cx("mb-1.5 block text-xs font-medium", subtle)}>Ünvan</span>
                    <input value={draft.address} onChange={(event) => setDraftField("address", event.target.value)} className={editField} />
                  </label>
                </div>
              </section>

              {!isSupplier && (
                <section className={cx("rounded-2xl border p-5", tile)}>
                  <div className="mb-5">
                    <h3 className="font-semibold">Loyallıq məlumatları</h3>
                    <p className={cx("mt-1 text-xs", subtle)}>Müştərinin loyallıq kartı və şəxsi məlumatları.</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label>
                      <span className={cx("mb-1.5 block text-xs font-medium", subtle)}>Loyallıq kartı</span>
                      <input value={draft.loyalty ?? ""} onChange={(event) => setDraftField("loyalty", event.target.value)} className={editField} />
                    </label>
                    <label>
                      <span className={cx("mb-1.5 block text-xs font-medium", subtle)}>Doğum tarixi</span>
                      <input type="date" value={draft.birthday ?? ""} onChange={(event) => setDraftField("birthday", event.target.value)} className={editField} />
                    </label>
                    <label>
                      <span className={cx("mb-1.5 block text-xs font-medium", subtle)}>Cins</span>
                      <select value={draft.gender ?? ""} onChange={(event) => setDraftField("gender", event.target.value as CounterpartyRow["gender"])} className={editField}>
                        <option value="">Seçilməyib</option>
                        <option value="Kişi">Kişi</option>
                        <option value="Qadın">Qadın</option>
                      </select>
                    </label>
                  </div>
                </section>
              )}

              <section className={cx("rounded-2xl border p-5", tile)}>
                <label>
                  <span className={cx("mb-1.5 block text-xs font-medium", subtle)}>Qeyd</span>
                  <textarea value={draft.description} onChange={(event) => setDraftField("description", event.target.value)} className={cx("min-h-28 w-full rounded-xl border px-3 py-2 text-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10", input)} />
                </label>
              </section>
            </div>
          )}
          {!editing && (detailView === "overview" || isSupplier) && (
            <CustomerCardOverview row={row} kind={kind} isDark={isDark} onOpenPrices={() => setDetailView("prices")} />
          )}
          {false && (<>
            <section className="hidden">
              {[
                ["Limit", `${detailLimitRate}%`, `${money(detailLimit)} ₼`, detailLimitRate > 70 ? "text-rose-500" : detailLimitRate > 40 ? "text-amber-600" : "text-emerald-600"],
                ["Açıq sənəd", whole(detailOpenDocs), detailOverdueDocs ? `${detailOverdueDocs} gecikmiş` : "Gecikmə yoxdur", detailOverdueDocs ? "text-amber-600" : "text-emerald-600"],
                [isSupplier ? "Alış profili" : "Qiymət profili", isSupplier ? "Müqaviləli" : (row.status === "Standart" ? "Standart" : "Xüsusi"), detailPaymentTerm, "text-indigo-600"],
                ["Əsas mağaza", detailStore, isSupplier ? "Alış kanalı" : "Satış kanalı", "text-cyan-600"],
              ].map(([label, value, helper, color]) => (
                <div key={label} className={cx("rounded-xl border px-4 py-3", isDark ? "border-white/10 bg-white/[0.035]" : "border-white/80 bg-white")}>
                  <div className={cx("text-xs font-medium", subtle)}>{label}</div>
                  <div className={cx("mt-1 text-base font-semibold tabular-nums", color)}>{value}</div>
                  <div className={cx("mt-1 text-xs", subtle)}>{helper}</div>
                </div>
              ))}
            </section>
            <section>
              <div className="mb-4 flex items-center gap-4">
                <div className={cx("h-px flex-1", isDark ? "bg-white/10" : "bg-slate-200")} />
                <h3 className={cx("text-xs font-semibold uppercase tracking-wide", subtle)}>Əlaqə məlumatları</h3>
                <div className={cx("h-px flex-1", isDark ? "bg-white/10" : "bg-slate-200")} />
              </div>
              <div className={cx("grid gap-0 overflow-hidden rounded-2xl border sm:grid-cols-3", border)}>
                {[
                  [<I.Phone className="h-4 w-4" />, "Telefon", row.phone || "Əlavə edilməyib"],
                  [<I.Mail className="h-4 w-4" />, "E-poçt", row.email || "Əlavə edilməyib"],
                  [<I.MapPin className="h-4 w-4" />, "Ünvan", row.address || "Əlavə edilməyib"],
                ].map(([icon, label, value], index) => (
                  <div key={String(label)} className={cx("px-4 py-3", index > 0 && (isDark ? "sm:border-l sm:border-white/10" : "sm:border-l sm:border-slate-200"))}>
                    <div className={cx("flex items-center gap-2 text-xs font-medium", subtle)}>{icon}{label}</div>
                    <div className="mt-1.5 truncate text-sm font-medium">{value}</div>
                  </div>
                ))}
              </div>
              {row.description && <div className={cx("mt-3 text-sm", subtle)}>{row.description}</div>}
            </section>

            <section>
              <div className="mb-4 flex items-center gap-4">
                <div className={cx("h-px flex-1", isDark ? "bg-white/10" : "bg-slate-200")} />
                <h3 className={cx("text-xs font-semibold uppercase tracking-wide", subtle)}>Statistika</h3>
                <div className={cx("h-px flex-1", isDark ? "bg-white/10" : "bg-slate-200")} />
              </div>
              <div className="grid gap-x-10 gap-y-1 md:grid-cols-2">
                {stats.map(([label, value], index) => (
                  <div key={label} className={cx("flex min-w-0 items-end gap-2 py-2", index === 0 || index === stats.length - 1 ? "font-semibold" : "")}>
                    <span className={cx("shrink-0 text-sm", index === 0 || index === stats.length - 1 ? "text-base" : subtle)}>{label}</span>
                    <span className={cx("mb-1 min-w-4 flex-1 border-b border-dotted", isDark ? "border-white/15" : "border-slate-300")} />
                    <span className={cx("shrink-0 text-right tabular-nums", index === 0 || index === stats.length - 1 ? "text-lg" : "text-sm")}>{value}</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <div className="mb-4 flex items-center gap-4">
                <div className={cx("h-px flex-1", isDark ? "bg-white/10" : "bg-slate-200")} />
                <h3 className={cx("text-xs font-semibold uppercase tracking-wide", subtle)}>Son əməliyyatlar</h3>
                <div className={cx("h-px flex-1", isDark ? "bg-white/10" : "bg-slate-200")} />
              </div>
              <div className="mb-5 flex justify-center">
                <div className={cx("inline-flex overflow-hidden rounded-xl border p-1", border, isDark ? "bg-white/5" : "bg-slate-50")}>
                  {[
                    ["products", isSupplier ? "Alışlar" : "Satışlar"],
                    ["money", "Pul fəaliyyəti"],
                    ...(!isSupplier ? [["bonus", "Bonus tarixçəsi"]] : []),
                  ].map(([key, label]) => (
                    <button key={key} type="button" onClick={() => setActivityView(key as typeof activityView)} className={cx("h-9 rounded-lg px-4 text-sm font-medium", activityView === key ? "bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200" : subtle, isDark && activityView === key && "bg-white/10 text-indigo-200 ring-white/10")}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="space-y-5">
                {visibleOperations.map((operation) => (
                  <div key={operation.title}>
                    <div className="mb-2 text-base font-semibold">{operation.date}</div>
                    <div className={cx("overflow-hidden rounded-2xl border", border)}>
                      <div className="flex">
                        <div className={cx("w-1 shrink-0", operation.accent)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-start justify-between gap-3 p-4">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-base font-semibold text-indigo-600"><I.Receipt className="h-4 w-4 shrink-0" /><span className="truncate">{operation.title}</span></div>
                              <div className={cx("mt-1 text-sm", subtle)}>{operation.meta}</div>
                            </div>
                            <div className={cx("text-lg font-semibold tabular-nums", operation.amount < 0 ? "text-rose-500" : "text-emerald-600")}>{money(operation.amount)} ₼</div>
                          </div>
                          <div className={cx("flex items-center justify-between border-t px-4 py-3 text-sm", border, subtle)}>
                            <span>Sənəd təsdiqlənib</span>
                            <I.ChevronDown className="h-4 w-4" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </>)}
          {saveMessage && <div className={cx("mt-4 text-sm", saveMessage.includes("saxlanıldı") ? "text-emerald-600" : "text-rose-600")}>{saveMessage}</div>}
        </div>
      </div>
    </div>
  );
}

export default function Counterparties({ isDark, kind }: Props) {
  const [rowsByKind, setRowsByKind] = useState<Record<CounterpartyKind, CounterpartyRow[]>>(sampleRows);
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("information");
  const [createOpen, setCreateOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<CounterpartyRow | null>(null);
  const createMenuRef = useRef<HTMLDivElement | null>(null);

  const rows = rowsByKind[kind];
  useEffect(() => {
    let cancelled = false;
    requestJson<{ data: ApiCounterparty[] }>(`/api/counterparties?kind=${apiKindFor(kind)}`)
      .then((payload) => {
        if (cancelled || !Array.isArray(payload.data)) return;
        setRowsByKind((prev) => ({ ...prev, [kind]: payload.data.map((item: ApiCounterparty) => mapApiCounterparty(item, kind)) }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.name, row.phone, row.email, row.address, row.description, row.code].some((value) => value.toLowerCase().includes(q))
    );
  }, [query, rows]);

  const firstColumn = kind === "suppliers" ? "TƏCHİZATÇI" : "MÜŞTƏRİ";
  const card = isDark ? "glass-panel-dark border-white/10" : "glass-panel border-white/70";
  const control = isDark ? "glass-control-dark border-white/10 text-slate-100" : "glass-control border-slate-200 text-slate-800";
  const subtle = isDark ? "text-slate-400" : "text-slate-500";
  const divider = isDark ? "border-white/10" : "border-slate-200/70";

  const saveForm = async (form: CounterpartyForm, savePrices?: (customerIdOverride?: number) => Promise<void>) => {
    const nextRow: CounterpartyRow = {
      id: Date.now(),
      name: form.name.trim(),
      code: `${kind === "suppliers" ? "SUP" : "CUS"}-${String(rowsByKind[kind].length + 1).padStart(3, "0")}`,
      type: form.type,
      phone: form.phone,
      email: form.email,
      description: form.description,
      address: form.address,
      balance: 0,
      added: "Arif Mahmud",
      created: new Date().toLocaleDateString("az-Latn-AZ"),
      status: form.isDefault ? "Standart" : "Aktiv",
      loyalty: form.loyaltyCard,
      birthday: form.birthday,
      gender: form.gender,
    };
    let created: CounterpartyRow | null = null;
    try {
      const payload = await requestJson<{ data: ApiCounterparty }>("/api/counterparties", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: apiKindFor(kind),
          name: form.name.trim(),
          type: form.type,
          phone: form.phone,
          email: form.email,
          description: form.description,
          address: form.address,
          balance: 0,
          owner: "Arif Mahmud",
          status: form.isDefault ? "Standart" : "Aktiv",
          loyalty: form.loyaltyCard,
          birthday: form.birthday,
          gender: form.gender,
        }),
      });
      if (payload.data) {
        created = mapApiCounterparty(payload.data, kind);
      }
    } catch {
      /* fallback to local insert */
    }
    const savedRow = created ?? nextRow;
    if (savePrices) await savePrices(savedRow.id);
    setRowsByKind((prev) => ({ ...prev, [kind]: [savedRow, ...prev[kind]] }));
    setCreateOpen(false);
    window.dispatchEvent(new CustomEvent("arix:counterparties-updated"));
  };

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setCreateMenuOpen(false);
      }
    };
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCreateMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onEsc);
    };
  }, []);

  useEffect(() => {
    setSelectedRow(null);
  }, [kind]);

  return (
    <div className="flex min-h-[calc(100vh-9rem)] min-w-0 flex-col gap-3 md:h-[calc(100vh-8rem)] md:min-h-0">
      <div className={cx("relative z-30 flex flex-col gap-3 rounded-2xl border p-3 lg:flex-row lg:items-center lg:justify-between", card)}>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-[440px]">
            <I.Search className="absolute left-2 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="axtarış…"
              className={cx("h-10 w-full rounded-xl border pl-8 pr-12 text-sm outline-none placeholder-slate-400", control)}
            />
            <button
              type="button"
              aria-label="Filtr"
              className={cx(
                "absolute right-1 top-1/2 flex h-8 w-10 -translate-y-1/2 items-center justify-center rounded-lg",
                isDark ? "text-slate-400 hover:bg-white/10" : "text-slate-500 hover:bg-white/65"
              )}
            >
              <I.Filter className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <div ref={createMenuRef} className="relative">
            <button
              type="button"
              onClick={() => setCreateMenuOpen((value) => !value)}
              className="surface-primary inline-flex h-10 items-center gap-2 rounded-xl px-3 text-sm font-medium"
              aria-haspopup="menu"
              aria-expanded={createMenuOpen}
            >
              <I.Plus className="h-4 w-4" />
              Yarat
            </button>
            {createMenuOpen && (
              <CreateMenu
                kind={kind}
                isDark={isDark}
                onClose={() => setCreateMenuOpen(false)}
                onCreate={() => {
                  setCreateMenuOpen(false);
                  setCreateOpen(true);
                }}
              />
            )}
          </div>
          <div className={cx("flex h-10 items-center overflow-hidden rounded-xl border", divider)}>
            {(["information", "statistics"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setView(mode)}
                className={cx(
                  "inline-flex h-full min-w-[104px] items-center justify-center px-4 text-sm transition",
                  view === mode
                    ? isDark ? "surface-nav-active text-slate-100" : "surface-nav-active text-indigo-700"
                    : isDark ? "text-slate-300 hover:bg-white/7" : "text-slate-600 hover:bg-white/65"
                )}
              >
                {mode === "information" ? "Məlumat" : "Statistika"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className={cx("flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border", card)}>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="space-y-3 p-3 md:hidden">
            {filteredRows.map((row) => {
              const stats = tableStats(row, kind);
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => setSelectedRow(row)}
                  className={cx("w-full rounded-2xl border p-3 text-left transition", divider, isDark ? "bg-white/5 hover:bg-white/10" : "bg-white hover:bg-slate-50")}
                >
                  <div className="flex items-start gap-3">
                    <div className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xs font-semibold", isDark ? "bg-indigo-500/15 text-indigo-200" : "bg-indigo-50 text-indigo-700")}>
                      {initials(row.name)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{row.name}</div>
                      <div className={cx("mt-1 truncate text-xs", subtle)}>{row.phone || row.email || row.address || row.code}</div>
                    </div>
                    <div className="shrink-0 text-right text-sm font-semibold tabular-nums">{money(row.balance)}</div>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div className={cx("rounded-xl px-2 py-2", isDark ? "bg-white/7" : "bg-slate-50")}>
                      <div className={subtle}>{kind === "customers" ? "Satış" : "Alış"}</div>
                      <div className="font-semibold tabular-nums">{whole(stats.count)}</div>
                    </div>
                    <div className={cx("rounded-xl px-2 py-2", isDark ? "bg-white/7" : "bg-slate-50")}>
                      <div className={subtle}>Cəmi</div>
                      <div className="font-semibold tabular-nums">{money(stats.total)}</div>
                    </div>
                    <div className={cx("rounded-xl px-2 py-2", isDark ? "bg-white/7" : "bg-slate-50")}>
                      <div className={subtle}>Borç</div>
                      <div className="font-semibold tabular-nums">{money(stats.debt)}</div>
                    </div>
                  </div>
                </button>
              );
            })}
            {filteredRows.length === 0 && <div className={cx("rounded-2xl border p-4 text-center text-sm", divider, subtle)}>Heç nə tapılmadı.</div>}
          </div>
          <div className="hidden min-h-full md:block">
          <table className={cx("w-full border-separate border-spacing-0 text-[13px]", view === "statistics" ? "min-w-[1880px]" : "min-w-[1280px]")}>
            <thead className={cx("sticky top-0 z-10", isDark ? "bg-slate-800 text-slate-400" : "bg-white text-slate-500")}>
              <tr>
                <th className={cx("border-b px-4 py-3 text-left text-xs font-semibold", divider)}>{firstColumn}</th>
                {view === "information" ? (
                  <>
                    <th className={cx("border-b px-4 py-3 text-left text-xs font-semibold", divider)}>TELEFON</th>
                    <th className={cx("border-b px-4 py-3 text-left text-xs font-semibold", divider)}>EMAIL</th>
                    {kind === "customers" && <th className={cx("border-b px-4 py-3 text-left text-xs font-semibold", divider)}>LOYALLIQ</th>}
                    <th className={cx("border-b px-4 py-3 text-left text-xs font-semibold", divider)}>TƏSVİR</th>
                    <th className={cx("border-b px-4 py-3 text-left text-xs font-semibold", divider)}>ÜNVAN</th>
                    <th className={cx("border-b px-4 py-3 text-right text-xs font-semibold", divider)}>BALANS</th>
                    <th className={cx("border-b px-4 py-3 text-left text-xs font-semibold", divider)}>ƏLAVƏ EDƏN</th>
                    <th className={cx("border-b px-4 py-3 text-left text-xs font-semibold", divider)}>YARADILDI</th>
                  </>
                ) : (
                  <>
                    <th className={cx("border-b px-4 py-3 text-right text-xs font-semibold", divider)}>{kind === "customers" ? "SATIŞ SAYI" : "ALIŞ SAYI"}</th>
                    <th className={cx("border-b px-4 py-3 text-right text-xs font-semibold", divider)}>{kind === "customers" ? "SATIŞ CƏMİ" : "ALIŞ CƏMİ"}</th>
                    <th className={cx("border-b px-4 py-3 text-right text-xs font-semibold", divider)}>ÖDƏNİLƏN CƏMİ</th>
                    <th className={cx("border-b px-4 py-3 text-right text-xs font-semibold", divider)}>{kind === "customers" ? "ORTA ÇEK" : "ORTA ALIŞ"}</th>
                    <th className={cx("border-b px-4 py-3 text-right text-xs font-semibold", divider)}>QAYTARMA SAYI</th>
                    <th className={cx("border-b px-4 py-3 text-right text-xs font-semibold", divider)}>QAYTARMA CƏMİ</th>
                    <th className={cx("border-b px-4 py-3 text-right text-xs font-semibold", divider)}>XƏRC CƏMİ</th>
                    <th className={cx("border-b px-4 py-3 text-right text-xs font-semibold", divider)}>{kind === "customers" ? "SATIŞ BORCU" : "ALIŞ BORCU"}</th>
                    <th className={cx("border-b px-4 py-3 text-right text-xs font-semibold", divider)}>QAYTARMA BORCU</th>
                    <th className={cx("border-b px-4 py-3 text-right text-xs font-semibold", divider)}>BALANS</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => {
                const stats = tableStats(row, kind);

                return (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedRow(row)}
                    className={cx("group cursor-pointer transition", isDark ? "hover:bg-white/5" : "hover:bg-slate-50")}
                  >
                    <td className={cx("border-b px-4 py-3 align-middle", divider)}>
                      <div className="flex items-center gap-2.5">
                        <div className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-semibold", isDark ? "bg-indigo-500/15 text-indigo-200" : "bg-indigo-50 text-indigo-700")}>
                          {initials(row.name)}
                        </div>
                        <div className="min-w-0">
                          <div className={cx("truncate font-medium", isDark ? "text-slate-100" : "text-slate-700")}>{row.name}</div>
                          <div className={cx("text-xs tabular-nums", subtle)}>{row.code}</div>
                        </div>
                      </div>
                    </td>
                    {view === "information" ? (
                      <>
                        <td className={cx("border-b px-4 py-3 tabular-nums", divider)}>{row.phone || "-"}</td>
                        <td className={cx("border-b px-4 py-3", divider)}>{row.email || "-"}</td>
                        {kind === "customers" && <td className={cx("border-b px-4 py-3 tabular-nums", divider)}>{row.loyalty || "-"}</td>}
                        <td className={cx("border-b px-4 py-3", divider)}>{row.description || "-"}</td>
                        <td className={cx("border-b px-4 py-3", divider)}>{row.address || "-"}</td>
                        <td className={cx("border-b px-4 py-3 text-right tabular-nums", divider)}>{money(row.balance)}</td>
                        <td className={cx("border-b px-4 py-3", divider)}>{row.added}</td>
                        <td className={cx("border-b px-4 py-3 tabular-nums", divider)}>{row.created}</td>
                      </>
                    ) : (
                      <>
                        <td className={cx("border-b px-4 py-3 text-right tabular-nums", divider)}>{whole(stats.count)}</td>
                        <td className={cx("border-b px-4 py-3 text-right tabular-nums", divider)}>{money(stats.total)}</td>
                        <td className={cx("border-b px-4 py-3 text-right tabular-nums", divider)}>{money(stats.paid)}</td>
                        <td className={cx("border-b px-4 py-3 text-right tabular-nums", divider)}>{money(stats.average)}</td>
                        <td className={cx("border-b px-4 py-3 text-right tabular-nums", divider)}>{whole(stats.refundCount)}</td>
                        <td className={cx("border-b px-4 py-3 text-right tabular-nums", divider)}>{money(stats.refundSum)}</td>
                        <td className={cx("border-b px-4 py-3 text-right tabular-nums", divider)}>{money(stats.expenses)}</td>
                        <td className={cx("border-b px-4 py-3 text-right tabular-nums", divider)}>{money(stats.debt)}</td>
                        <td className={cx("border-b px-4 py-3 text-right tabular-nums", divider)}>{money(stats.refundDebt)}</td>
                        <td className={cx("border-b px-4 py-3 text-right tabular-nums", divider)}>{money(stats.balance)}</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>

        <div className={cx("flex h-11 items-center justify-between border-t px-4 text-sm", divider)}>
          <div className={subtle}>{filteredRows.length} nəticə göstərilir</div>
          <div className="flex overflow-hidden rounded-lg border border-slate-200/70">
            {[1, 2, 3].map((page) => (
              <button key={page} type="button" className={cx("h-8 w-9 text-sm", page === 1 ? "bg-indigo-600 text-white" : isDark ? "text-slate-300 hover:bg-white/7" : "text-slate-600 hover:bg-slate-50")}>
                {page}
              </button>
            ))}
          </div>
        </div>
      </div>

      {createOpen && <CreatePanel kind={kind} isDark={isDark} onClose={() => setCreateOpen(false)} onSave={saveForm} />}
      {selectedRow && (
        <DetailPanel
          row={selectedRow}
          kind={kind}
          isDark={isDark}
          onClose={() => setSelectedRow(null)}
          onUpdated={(updated) => {
            setSelectedRow(updated);
            setRowsByKind((current) => ({
              ...current,
              [kind]: current[kind].map((item) => item.id === updated.id ? updated : item),
            }));
          }}
        />
      )}
    </div>
  );
}
