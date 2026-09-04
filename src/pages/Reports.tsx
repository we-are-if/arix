import { useEffect, useMemo, useState, type SVGProps } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { requestJson } from "../api";

const cx = (...s: (string | false | undefined)[]) => s.filter(Boolean).join(" ");
const money = (value: number) => value.toLocaleString("az-Latn-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = (value: number) => value.toLocaleString("az-Latn-AZ", { maximumFractionDigits: 2 });

type ApiProduct = {
  id: number;
  name: string;
  code?: string;
  sku?: string;
  unit?: string;
  salePrice?: number;
  cost?: number;
  purchasePrice?: number;
  warehouses?: {
    antrepo?: number;
    depo?: number;
  };
};

type ApiDocumentLine = {
  productId?: number;
  name?: string;
  qty?: number;
  price?: number;
  discount?: number;
  total?: number;
  warehouse?: string;
};

type ApiDocument = {
  id?: string | number;
  type?: string;
  status?: string;
  posted?: boolean;
  documentDate?: string;
  createdAt?: string;
  counterpartyName?: string;
  account?: string;
  fromAccount?: string;
  toAccount?: string;
  amount?: number;
  total?: number;
  paid?: number;
  relationshipType?: "debtPayment" | "landedCost";
  costAllocations?: Array<{ amount?: number; category?: string; containerNumber?: string }>;
  paymentSummary?: {
    paid?: number;
    remaining?: number;
    total?: number;
    status?: string;
  };
  lines?: ApiDocumentLine[];
  bondedStock?: {
    summary?: {
      containerCount?: number;
      palletCount?: number;
      rollCount?: number;
      qty?: number;
      netKg?: number;
      grossKg?: number;
    };
  };
};

type ApiCounterparty = {
  id: number;
  kind: "customer" | "supplier";
  name: string;
  balance?: number;
  status?: string;
};

type ReportView = "overview" | "sales" | "stock" | "money" | "counterparties" | "cost";

const reportViews: Array<{ id: ReportView; label: string }> = [
  { id: "overview", label: "İcmal" },
  { id: "sales", label: "Satış" },
  { id: "stock", label: "Stok" },
  { id: "money", label: "Pul" },
  { id: "counterparties", label: "Kontragent" },
  { id: "cost", label: "Maya" },
];

const I = {
  Search: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="11" cy="11" r="7" /><path d="M21 21l-3.5-3.5" />
    </svg>
  ),
  Download: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3v12" /><path d="M8 11l4 4 4-4" /><path d="M21 21H3" />
    </svg>
  ),
  Chart: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 19V5" /><path d="M4 19h16" /><path d="m7 15 4-4 3 3 5-7" />
    </svg>
  ),
  Alert: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 4.5 2.7 18a2 2 0 0 0 1.7 3h15.2a2 2 0 0 0 1.7-3L13.7 4.5a2 2 0 0 0-3.4 0Z" />
    </svg>
  ),
};

const makeUI = (isDark: boolean) => ({
  card: `rounded-2xl border ${isDark ? "glass-panel-dark border-white/10" : "glass-panel border-white/70"}`,
  control: isDark ? "glass-control-dark border-white/10 text-slate-100" : "glass-control border-white/70 text-slate-800",
  border: isDark ? "border-white/10" : "border-slate-200/80",
  subtle: isDark ? "text-slate-400" : "text-slate-500",
  title: isDark ? "text-slate-50" : "text-slate-900",
  tableHead: isDark ? "bg-white/5 text-slate-300" : "bg-slate-50/90 text-slate-600",
  row: isDark ? "border-white/10 hover:bg-white/5" : "border-slate-200/70 hover:bg-slate-50/80",
  grid: isDark ? "rgba(148,163,184,.24)" : "rgba(148,163,184,.34)",
});

const typeLabel = (type = "") => {
  const labels: Record<string, string> = {
    sale: "Satış",
    purchase: "Alış",
    saleReturn: "Satış qaytarması",
    purchaseReturn: "Alış qaytarması",
    movement: "Yerdəyişmə",
    writeOff: "Silinmə",
    openingBalance: "Əvvələ qalıq",
    stocktake: "İnventarlaşma",
    cashIn: "Mədaxil",
    cashOut: "Məxaric",
    transfer: "Köçürülmə",
  };
  return labels[type] ?? (type || "Sənəd");
};

const docAmount = (document: ApiDocument) => {
  if (typeof document.total === "number") return document.total;
  if (typeof document.amount === "number") return Math.abs(document.amount);
  return 0;
};

const docDate = (document: ApiDocument) => {
  const value = document.documentDate ?? document.createdAt;
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date() : date;
};

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
const monthLabel = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("az-Latn-AZ", { month: "short" });
};

const filterDocumentsByPeriod = (documents: ApiDocument[], period: string) => {
  if (period === "all") return documents;
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (period === "month") {
    start.setDate(1);
  } else if (period === "quarter") {
    start.setMonth(now.getMonth() - 2, 1);
  } else {
    start.setMonth(now.getMonth() - 11, 1);
  }
  return documents.filter((document) => docDate(document).getTime() >= start.getTime());
};

const csvValue = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;

export default function Reports({ isDark }: { isDark: boolean }) {
  const ui = makeUI(isDark);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [documents, setDocuments] = useState<ApiDocument[]>([]);
  const [counterparties, setCounterparties] = useState<ApiCounterparty[]>([]);
  const [view, setView] = useState<ReportView>("overview");
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState("year");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      try {
        const [productPayload, documentPayload, counterpartyPayload] = await Promise.all([
          requestJson<{ data: ApiProduct[] }>("/api/products"),
          requestJson<{ data: ApiDocument[] }>("/api/documents"),
          requestJson<{ data: ApiCounterparty[] }>("/api/counterparties"),
        ]);
        if (!alive) return;
        setProducts(Array.isArray(productPayload.data) ? productPayload.data : []);
        setDocuments(Array.isArray(documentPayload.data) ? documentPayload.data : []);
        setCounterparties(Array.isArray(counterpartyPayload.data) ? counterpartyPayload.data : []);
      } catch {
        if (!alive) return;
        setProducts([]);
        setDocuments([]);
        setCounterparties([]);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    window.addEventListener("arix:documents-updated", load);
    window.addEventListener("arix:products-updated", load);
    return () => {
      alive = false;
      window.removeEventListener("arix:documents-updated", load);
      window.removeEventListener("arix:products-updated", load);
    };
  }, []);

  const productCostById = useMemo(() => {
    const map = new Map<number, number>();
    products.forEach((product) => map.set(Number(product.id), product.cost ?? product.purchasePrice ?? 0));
    return map;
  }, [products]);

  const periodDocuments = useMemo(() => filterDocumentsByPeriod(documents, period), [documents, period]);

  const report = useMemo(() => {
    const sales = periodDocuments.filter((item) => item.type === "sale");
    const purchases = periodDocuments.filter((item) => item.type === "purchase");
    const cashIn = periodDocuments.filter((item) => item.type === "cashIn");
    const cashOut = periodDocuments.filter((item) => item.type === "cashOut");
    const landedCosts = periodDocuments.filter((item) => item.relationshipType === "landedCost" || (item.costAllocations?.length ?? 0) > 0);

    const revenue = sales.reduce((sum, item) => sum + docAmount(item), 0);
    const purchaseTotal = purchases.reduce((sum, item) => sum + docAmount(item), 0);
    const paidTotal = periodDocuments.reduce((sum, item) => sum + (item.paymentSummary?.paid ?? item.paid ?? 0), 0);
    const receivable = periodDocuments.reduce((sum, item) => {
      if (item.type !== "sale" && item.type !== "purchase") return sum;
      return sum + Math.max(0, (item.paymentSummary?.remaining ?? (docAmount(item) - (item.paid ?? 0))));
    }, 0);
    const landedTotal = landedCosts.reduce((sum, item) => {
      const allocated = item.costAllocations?.reduce((inner, row) => inner + (row.amount ?? 0), 0) ?? 0;
      return sum + (allocated || docAmount(item));
    }, 0);
    const cogs = sales.reduce((sum, document) => {
      const lineCost = (document.lines ?? []).reduce((lineSum, line) => {
        const unitCost = line.productId == null ? 0 : productCostById.get(Number(line.productId)) ?? 0;
        return lineSum + (line.qty ?? 0) * unitCost;
      }, 0);
      return sum + (lineCost || docAmount(document) * 0.68);
    }, 0);
    const profit = revenue - cogs;
    const stockValue = products.reduce((sum, product) => {
      const qty = (product.warehouses?.antrepo ?? 0) + (product.warehouses?.depo ?? 0);
      return sum + qty * (product.cost ?? product.purchasePrice ?? 0);
    }, 0);
    const stockQty = products.reduce((sum, product) => sum + (product.warehouses?.antrepo ?? 0) + (product.warehouses?.depo ?? 0), 0);

    const currentMonth = new Date();
    const monthKeys = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - (5 - index), 1);
      return monthKey(date);
    });
    const monthly = monthKeys.map((key) => {
      const monthDocuments = periodDocuments.filter((document) => monthKey(docDate(document)) === key);
      const monthSales = monthDocuments.filter((document) => document.type === "sale").reduce((sum, item) => sum + docAmount(item), 0);
      const monthPurchases = monthDocuments.filter((document) => document.type === "purchase").reduce((sum, item) => sum + docAmount(item), 0);
      const monthCosts = monthDocuments.filter((document) => document.relationshipType === "landedCost").reduce((sum, item) => sum + docAmount(item), 0);
      return {
        key,
        name: monthLabel(key),
        satış: monthSales,
        alış: monthPurchases,
        mənfəət: monthSales - monthSales * 0.68 - monthCosts,
      };
    });

    const storeStock = [
      { name: "ERSA ANTREPO", qty: products.reduce((sum, item) => sum + (item.warehouses?.antrepo ?? 0), 0) },
      { name: "ERSA DEPO", qty: products.reduce((sum, item) => sum + (item.warehouses?.depo ?? 0), 0) },
    ];

    const documentMix = [
      { name: "Satış", value: sales.length, color: "#4f46e5" },
      { name: "Alış", value: purchases.length, color: "#0ea5e9" },
      { name: "Mədaxil", value: cashIn.length, color: "#10b981" },
      { name: "Məxaric", value: cashOut.length, color: "#f43f5e" },
    ].filter((item) => item.value > 0);

    const topProducts = [...products]
      .map((product) => {
        const qty = (product.warehouses?.antrepo ?? 0) + (product.warehouses?.depo ?? 0);
        const value = qty * (product.cost ?? product.purchasePrice ?? 0);
        return { product, qty, value };
      })
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const topCustomers = [...counterparties]
      .filter((item) => item.kind === "customer")
      .map((item) => ({
        name: item.name,
        balance: item.balance ?? sales.filter((doc) => doc.counterpartyName === item.name).reduce((sum, doc) => sum + Math.max(0, docAmount(doc) - (doc.paid ?? 0)), 0),
        sales: sales.filter((doc) => doc.counterpartyName === item.name).reduce((sum, doc) => sum + docAmount(doc), 0),
      }))
      .sort((a, b) => b.sales - a.sales)
      .slice(0, 6);

    const recentDocuments = [...periodDocuments]
      .sort((a, b) => docDate(b).getTime() - docDate(a).getTime())
      .slice(0, 8);

    return {
      revenue,
      purchaseTotal,
      paidTotal,
      receivable,
      landedTotal,
      cogs,
      profit,
      margin: revenue > 0 ? (profit / revenue) * 100 : 0,
      stockValue,
      stockQty,
      monthly,
      storeStock,
      documentMix,
      topProducts,
      topCustomers,
      recentDocuments,
      salesCount: sales.length,
      purchaseCount: purchases.length,
    };
  }, [counterparties, periodDocuments, productCostById, products]);

  const filteredDocuments = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return report.recentDocuments;
    return periodDocuments
      .filter((document) => [
        typeLabel(document.type),
        document.counterpartyName,
        document.account,
        document.status,
        String(document.id ?? ""),
      ].join(" ").toLowerCase().includes(normalized))
      .slice(0, 12);
  }, [periodDocuments, query, report.recentDocuments]);

  const handleExport = () => {
    const rows: Array<Array<string | number>> =
      view === "stock"
        ? [["Məhsul", "Kod", "Antrepo", "Depo", "Miqdar", "Dəyər"], ...report.topProducts.map(({ product, qty, value }) => [
            product.name,
            product.code || product.sku || "",
            product.warehouses?.antrepo ?? 0,
            product.warehouses?.depo ?? 0,
            qty,
            money(value),
          ])]
        : view === "counterparties"
          ? [["Müştəri", "Satış", "Balans", "Risk"], ...report.topCustomers.map((row) => [
              row.name,
              money(row.sales),
              money(row.balance),
              row.balance > 0 ? "İzlənməlidir" : "Normal",
            ])]
          : [["Sənəd", "Tarix", "Kontragent", "Status", "Ödənilib", "Məbləğ"], ...filteredDocuments.map((row, index) => [
              `${typeLabel(row.type)} #${row.id ?? index + 1}`,
              docDate(row).toLocaleDateString("az-Latn-AZ"),
              row.counterpartyName || "",
              row.status || (row.posted === false ? "Hazırlanır" : "Təsdiqlənib"),
              money(row.paymentSummary?.paid ?? row.paid ?? 0),
              money(docAmount(row)),
            ])];
    const csv = rows.map((row) => row.map(csvValue).join(";")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `arix-hesabat-${view}-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      <section className={cx("overflow-hidden p-5", ui.card)}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className={cx("text-xs font-semibold uppercase tracking-[0.12em]", ui.subtle)}>Hesabat mərkəzi</div>
            <h1 className={cx("mt-1 text-3xl font-semibold tracking-tight", ui.title)}>Şirkətin canlı göstəriciləri</h1>
            <p className={cx("mt-1 max-w-2xl text-sm", ui.subtle)}>Satış, stok, pul axını, kontragent borcu və maya riskləri bir ekranda toplanır.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className={cx("flex h-11 min-w-[260px] items-center gap-2 rounded-xl border px-3", ui.control)}>
              <I.Search className={cx("h-4 w-4", ui.subtle)} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-400"
                placeholder="sənəd, müştəri, status axtar..."
              />
            </label>
            <select value={period} onChange={(event) => setPeriod(event.target.value)} className={cx("h-11 rounded-xl border px-3 text-sm outline-none", ui.control)}>
              <option value="month">Bu ay</option>
              <option value="quarter">Rüb</option>
              <option value="year">İl</option>
              <option value="all">Hamısı</option>
            </select>
            <button type="button" onClick={handleExport} className={cx("inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold", ui.control)}>
              <I.Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>

        <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
          {reportViews.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={cx(
                "h-10 shrink-0 rounded-xl px-4 text-sm font-semibold transition",
                view === item.id ? "surface-primary shadow-lg shadow-indigo-500/20" : isDark ? "bg-white/7 text-slate-300 hover:bg-white/10" : "bg-white/65 text-slate-600 hover:bg-white"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      {loading ? (
        <section className={cx("p-6 text-sm", ui.card, ui.subtle)}>Hesabatlar yüklənir...</section>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <KpiCard label="Hasilat" value={`${money(report.revenue)} ₼`} caption={`${number(report.salesCount)} satış sənədi`} tone="indigo" isDark={isDark} />
            <KpiCard label="Mənfəət" value={`${money(report.profit)} ₼`} caption={`Marja ${number(report.margin)}%`} tone={report.profit >= 0 ? "emerald" : "rose"} isDark={isDark} />
            <KpiCard label="Alış" value={`${money(report.purchaseTotal)} ₼`} caption={`${number(report.purchaseCount)} alış sənədi`} tone="sky" isDark={isDark} />
            <KpiCard label="Stok dəyəri" value={`${money(report.stockValue)} ₼`} caption={`${number(report.stockQty)} stok miqdarı`} tone="violet" isDark={isDark} />
            <KpiCard label="Qalıq borc" value={`${money(report.receivable)} ₼`} caption={`Ödənilib ${money(report.paidTotal)} ₼`} tone="amber" isDark={isDark} />
          </div>

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.9fr)]">
            <section className={cx("p-4", ui.card)}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className={cx("text-lg font-semibold", ui.title)}>Satış və mənfəət trendi</h2>
                  <p className={cx("text-sm", ui.subtle)}>Son 6 ay üzrə sənəd axını</p>
                </div>
                <span className={cx("rounded-full px-3 py-1 text-xs font-semibold", isDark ? "bg-indigo-400/15 text-indigo-100" : "bg-indigo-50 text-indigo-700")}>{periodLabel(period)}</span>
              </div>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={report.monthly} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
                    <defs>
                      <linearGradient id="salesArea" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#4f46e5" stopOpacity={0.42} />
                        <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.04} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={ui.grid} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: ui.grid }} />
                    <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: ui.grid }} />
                    <Tooltip formatter={(value: unknown) => `${money(Number(value))} ₼`} />
                    <Area type="monotone" dataKey="satış" stroke="#4f46e5" strokeWidth={2.4} fill="url(#salesArea)" />
                    <Area type="monotone" dataKey="mənfəət" stroke="#10b981" strokeWidth={2.2} fill="transparent" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </section>

            <section className={cx("p-4", ui.card)}>
              <h2 className={cx("text-lg font-semibold", ui.title)}>Sənəd tərkibi</h2>
              <p className={cx("text-sm", ui.subtle)}>Əməliyyat növlərinin payı</p>
              <div className="mt-4 h-52">
                {report.documentMix.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={report.documentMix} dataKey="value" nameKey="name" innerRadius={58} outerRadius={86} paddingAngle={4}>
                        {report.documentMix.map((item) => <Cell key={item.name} fill={item.color} />)}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState text="Sənəd yoxdur" isDark={isDark} />
                )}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {report.documentMix.map((item) => (
                  <div key={item.name} className={cx("rounded-xl border px-3 py-2 text-sm", ui.border)}>
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className={ui.subtle}>{item.name}</span>
                    </div>
                    <div className="mt-1 font-semibold tabular-nums">{item.value}</div>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <div className="grid gap-4 xl:grid-cols-3">
            <section className={cx("p-4 xl:col-span-2", ui.card)}>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className={cx("text-lg font-semibold", ui.title)}>{viewTitle(view)}</h2>
                  <p className={cx("text-sm", ui.subtle)}>Ən vacib sətirlər yuxarıda saxlanılır</p>
                </div>
                <I.Chart className={cx("h-5 w-5", ui.subtle)} />
              </div>
              {view === "stock" ? (
                <StockReportTable rows={report.topProducts} isDark={isDark} />
              ) : view === "counterparties" ? (
                <CustomerReportTable rows={report.topCustomers} isDark={isDark} />
              ) : (
                <DocumentReportTable rows={filteredDocuments} isDark={isDark} />
              )}
            </section>

            <section className={cx("p-4", ui.card)}>
              <h2 className={cx("text-lg font-semibold", ui.title)}>Stok bölgüsü</h2>
              <p className={cx("text-sm", ui.subtle)}>Mağaza/anbar üzrə miqdar</p>
              <div className="mt-4 h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.storeStock} margin={{ left: 0, right: 8, top: 12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={ui.grid} />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: ui.grid }} />
                    <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: ui.grid }} />
                    <Tooltip formatter={(value: unknown) => number(Number(value))} />
                    <Bar dataKey="qty" fill="#4f46e5" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 space-y-2">
                <Insight tone="amber" title="Maya nəzarəti" text={`${money(report.landedTotal)} ₼ bağlı xərc görünür.`} />
                <Insight tone="emerald" title="Satış marjası" text={`Cari hesabla ${number(report.margin)}% marja.`} />
                <Insight tone="indigo" title="Növbəti addım" text="Bu hesabatları PDF/Excel formalarına bağlaya bilərik." />
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function periodLabel(period: string) {
  if (period === "month") return "Bu ay";
  if (period === "quarter") return "Rüb";
  if (period === "all") return "Hamısı";
  return "İl";
}

function viewTitle(view: ReportView) {
  if (view === "sales") return "Satış sənədləri";
  if (view === "stock") return "Stok dəyəri yüksək məhsullar";
  if (view === "money") return "Pul hərəkətləri";
  if (view === "counterparties") return "Müştəri performansı";
  if (view === "cost") return "Maya və xərc bağlantıları";
  return "Son əməliyyatlar";
}

function KpiCard({ label, value, caption, tone, isDark }: { label: string; value: string; caption: string; tone: "indigo" | "emerald" | "rose" | "sky" | "violet" | "amber"; isDark: boolean }) {
  const toneClass = {
    indigo: isDark ? "bg-indigo-400/15 text-indigo-100" : "bg-indigo-50 text-indigo-700",
    emerald: isDark ? "bg-emerald-400/15 text-emerald-100" : "bg-emerald-50 text-emerald-700",
    rose: isDark ? "bg-rose-400/15 text-rose-100" : "bg-rose-50 text-rose-700",
    sky: isDark ? "bg-sky-400/15 text-sky-100" : "bg-sky-50 text-sky-700",
    violet: isDark ? "bg-violet-400/15 text-violet-100" : "bg-violet-50 text-violet-700",
    amber: isDark ? "bg-amber-400/15 text-amber-100" : "bg-amber-50 text-amber-700",
  }[tone];
  return (
    <div className={cx("rounded-2xl border p-4", isDark ? "glass-panel-dark border-white/10" : "glass-panel border-white/70")}>
      <div className="flex items-center justify-between gap-3">
        <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold", toneClass)}>{label}</span>
        <span className={cx("h-2 w-2 rounded-full", tone === "rose" ? "bg-rose-500" : tone === "emerald" ? "bg-emerald-500" : "bg-indigo-500")} />
      </div>
      <div className="mt-4 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className={cx("mt-1 text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{caption}</div>
    </div>
  );
}

function DocumentReportTable({ rows, isDark }: { rows: ApiDocument[]; isDark: boolean }) {
  const ui = makeUI(isDark);
  return (
    <div className={cx("overflow-x-auto rounded-2xl border", ui.border)}>
      <table className="min-w-full whitespace-nowrap text-sm">
        <thead className={ui.tableHead}>
          <tr>
            <th className="px-4 py-3 text-left">Sənəd</th>
            <th className="px-4 py-3 text-left">Tarix</th>
            <th className="px-4 py-3 text-left">Kontragent</th>
            <th className="px-4 py-3 text-left">Status</th>
            <th className="px-4 py-3 text-right">Məbləğ</th>
            <th className="px-4 py-3 text-right">Qalıq</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const total = docAmount(row);
            const paid = row.paymentSummary?.paid ?? row.paid ?? 0;
            return (
              <tr key={`${row.id ?? index}`} className={cx("border-t", ui.row)}>
                <td className="px-4 py-3 font-semibold text-indigo-600">{typeLabel(row.type)} #{row.id ?? index + 1}</td>
                <td className="px-4 py-3">{docDate(row).toLocaleDateString("az-Latn-AZ")}</td>
                <td className="px-4 py-3">{row.counterpartyName || "—"}</td>
                <td className="px-4 py-3">{row.status || (row.posted === false ? "Hazırlanır" : "Təsdiqlənib")}</td>
                <td className="px-4 py-3 text-right tabular-nums">{money(total)} ₼</td>
                <td className={cx("px-4 py-3 text-right font-semibold tabular-nums", total - paid > 0 ? "text-amber-600" : "text-emerald-600")}>{money(Math.max(0, total - paid))} ₼</td>
              </tr>
            );
          })}
          {rows.length === 0 && <tr><td colSpan={6}><EmptyState text="Uyğun sənəd tapılmadı" isDark={isDark} /></td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function StockReportTable({ rows, isDark }: { rows: Array<{ product: ApiProduct; qty: number; value: number }>; isDark: boolean }) {
  const ui = makeUI(isDark);
  return (
    <div className={cx("overflow-x-auto rounded-2xl border", ui.border)}>
      <table className="min-w-full whitespace-nowrap text-sm">
        <thead className={ui.tableHead}>
          <tr>
            <th className="px-4 py-3 text-left">Məhsul</th>
            <th className="px-4 py-3 text-left">Kod</th>
            <th className="px-4 py-3 text-right">Antrepo</th>
            <th className="px-4 py-3 text-right">Depo</th>
            <th className="px-4 py-3 text-right">Miqdar</th>
            <th className="px-4 py-3 text-right">Dəyər</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ product, qty, value }) => (
            <tr key={product.id} className={cx("border-t", ui.row)}>
              <td className="px-4 py-3 font-semibold text-indigo-600">{product.name}</td>
              <td className="px-4 py-3">{product.code || product.sku || "—"}</td>
              <td className="px-4 py-3 text-right tabular-nums">{number(product.warehouses?.antrepo ?? 0)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{number(product.warehouses?.depo ?? 0)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{number(qty)} {product.unit ?? ""}</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(value)} ₼</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6}><EmptyState text="Stok məlumatı yoxdur" isDark={isDark} /></td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function CustomerReportTable({ rows, isDark }: { rows: Array<{ name: string; balance: number; sales: number }>; isDark: boolean }) {
  const ui = makeUI(isDark);
  return (
    <div className={cx("overflow-x-auto rounded-2xl border", ui.border)}>
      <table className="min-w-full whitespace-nowrap text-sm">
        <thead className={ui.tableHead}>
          <tr>
            <th className="px-4 py-3 text-left">Müştəri</th>
            <th className="px-4 py-3 text-right">Satış</th>
            <th className="px-4 py-3 text-right">Balans</th>
            <th className="px-4 py-3 text-left">Risk</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.name} className={cx("border-t", ui.row)}>
              <td className="px-4 py-3 font-semibold text-indigo-600">{row.name}</td>
              <td className="px-4 py-3 text-right tabular-nums">{money(row.sales)} ₼</td>
              <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(row.balance)} ₼</td>
              <td className="px-4 py-3">{row.balance > 0 ? "İzlənməlidir" : "Normal"}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={4}><EmptyState text="Müştəri datası yoxdur" isDark={isDark} /></td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Insight({ title, text, tone }: { title: string; text: string; tone: "amber" | "emerald" | "indigo" }) {
  const color = tone === "amber" ? "text-amber-600 bg-amber-500/10" : tone === "emerald" ? "text-emerald-600 bg-emerald-500/10" : "text-indigo-600 bg-indigo-500/10";
  return (
    <div className="rounded-xl border border-slate-200/70 p-3">
      <div className="flex items-center gap-2">
        <span className={cx("flex h-8 w-8 items-center justify-center rounded-lg", color)}><I.Alert className="h-4 w-4" /></span>
        <div className="font-semibold">{title}</div>
      </div>
      <div className="mt-2 text-sm text-slate-500">{text}</div>
    </div>
  );
}

function EmptyState({ text, isDark }: { text: string; isDark: boolean }) {
  return <div className={cx("p-6 text-center text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{text}</div>;
}
