import { useCallback, useEffect, useMemo, useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { requestJson } from "../api";

type Colors = { card: string; kpiLabel: string; chip: string; tableHead: string; grid: string };
type ApiProduct = { id: number; cost?: number; purchasePrice?: number };
type ApiDocumentLine = { productId?: number; qty?: number; unitCost?: number; costTotal?: number };
type ApiDocument = {
  type?: string; status?: string; posted?: boolean; documentDate?: string; createdAt?: string;
  amount?: number; total?: number; lines?: ApiDocumentLine[];
};

const cx = (...s: (string | false | undefined)[]) => s.filter(Boolean).join(" ");
const money = (value: number) => value.toLocaleString("az-Latn-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = (value: number) => value.toLocaleString("az-Latn-AZ", { maximumFractionDigits: 2 });
const monthNames = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avqust", "sentyabr", "oktyabr", "noyabr", "dekabr"];

const documentDate = (document: ApiDocument) => {
  const date = new Date(document.documentDate ?? document.createdAt ?? "");
  return Number.isNaN(date.getTime()) ? null : date;
};
const documentAmount = (document: ApiDocument) => typeof document.total === "number"
  ? document.total
  : typeof document.amount === "number" ? Math.abs(document.amount) : 0;
const activeDocument = (document: ApiDocument) => {
  const status = String(document.status ?? "").toLowerCase();
  return document.posted !== false && !["cancelled", "canceled", "deleted", "void", "draft"].includes(status);
};

const documentLabels: Record<string, string> = {
  sale: "Satış", purchase: "Alış", saleReturn: "Satışın geri qaytarılması",
  purchaseReturn: "Alışın geri qaytarılması", movement: "Yerdəyişmə", writeOff: "Silinmə",
  openingBalance: "Əvvələ qalıq", stocktake: "İnventarlaşma", cashIn: "Mədaxil",
  cashOut: "Məxaric", transfer: "Köçürülmə",
};
const primaryDocumentTypes = ["sale", "purchase", "saleReturn", "purchaseReturn", "movement", "writeOff"];

export default function Dashboard({ colors }: { colors: Colors }) {
  const [documents, setDocuments] = useState<ApiDocument[]>([]);
  const [products, setProducts] = useState<ApiProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [documentPayload, productPayload] = await Promise.all([
        requestJson<{ data: ApiDocument[] }>("/api/documents"),
        requestJson<{ data: ApiProduct[] }>("/api/products"),
      ]);
      setDocuments(Array.isArray(documentPayload.data) ? documentPayload.data : []);
      setProducts(Array.isArray(productPayload.data) ? productPayload.data : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Məlumatlar yüklənmədi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const reload = () => void load();
    window.addEventListener("arix:documents-updated", reload);
    window.addEventListener("arix:products-updated", reload);
    return () => {
      window.removeEventListener("arix:documents-updated", reload);
      window.removeEventListener("arix:products-updated", reload);
    };
  }, [load]);

  const dashboard = useMemo(() => {
    const year = new Date().getFullYear();
    const productCosts = new Map(products.map((product) => [Number(product.id), product.cost ?? product.purchasePrice ?? 0]));
    const yearDocuments = documents.filter((document) => documentDate(document)?.getFullYear() === year && activeDocument(document));
    const sales = yearDocuments.filter((document) => document.type === "sale");
    const saleReturns = yearDocuments.filter((document) => document.type === "saleReturn");
    const costOf = (document: ApiDocument) => (document.lines ?? []).reduce((sum, line) => {
      if (typeof line.costTotal === "number") return sum + line.costTotal;
      const unitCost = line.unitCost ?? (line.productId == null ? 0 : productCosts.get(Number(line.productId)) ?? 0);
      return sum + (line.qty ?? 0) * unitCost;
    }, 0);
    const salesRevenue = sales.reduce((sum, document) => sum + documentAmount(document), 0);
    const revenue = salesRevenue - saleReturns.reduce((sum, document) => sum + documentAmount(document), 0);
    const cogs = sales.reduce((sum, document) => sum + costOf(document), 0)
      - saleReturns.reduce((sum, document) => sum + costOf(document), 0);
    const series = monthNames.map((name, month) => ({
      name,
      value: yearDocuments.reduce((sum, document) => {
        if (documentDate(document)?.getMonth() !== month) return sum;
        if (document.type === "sale") return sum + documentAmount(document);
        if (document.type === "saleReturn") return sum - documentAmount(document);
        return sum;
      }, 0),
    }));
    const allTypes = [...primaryDocumentTypes, ...yearDocuments.map((document) => document.type ?? "").filter(Boolean)];
    const rows = [...new Set(allTypes)].map((type) => {
      const matches = yearDocuments.filter((document) => document.type === type);
      const direction = ["saleReturn", "purchaseReturn", "writeOff"].includes(type) ? -1 : 1;
      return {
        type, name: documentLabels[type] ?? type, count: matches.length,
        amount: matches.reduce((sum, document) => sum + documentAmount(document), 0),
        quantity: matches.reduce((sum, document) => sum + (document.lines ?? []).reduce((lineSum, line) => lineSum + (line.qty ?? 0), 0), 0) * direction,
      };
    });
    return { year, revenue, cogs, profit: revenue - cogs, average: sales.length ? salesRevenue / sales.length : 0, series, rows };
  }, [documents, products]);

  const kpis = [
    { title: "Hasilat", value: dashboard.revenue },
    { title: "Satışların maya dəyəri", value: dashboard.cogs },
    { title: "Mənfəət", value: dashboard.profit },
    { title: "Orta çek", value: dashboard.average },
  ];

  if (loading) return <div className={cx("rounded-2xl border p-6 text-sm", colors.card, colors.kpiLabel)}>Dashboard yüklənir...</div>;
  if (error) return (
    <div className={cx("rounded-2xl border p-6", colors.card)}>
      <p className="text-sm text-rose-600">{error}</p>
      <button type="button" onClick={() => void load()} className="mt-3 rounded-lg border px-3 py-2 text-sm font-semibold">Yenidən yoxla</button>
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.title} className={cx("rounded-2xl border p-4 shadow-sm", colors.card)}>
            <div className={cx("mb-2 h-5 overflow-hidden text-ellipsis whitespace-nowrap text-[11px] uppercase tracking-wide", colors.kpiLabel)} title={kpi.title}>{kpi.title}</div>
            <div className="text-2xl font-semibold leading-none tabular-nums">{money(kpi.value)}</div>
          </div>
        ))}
      </div>

      <div className={cx("rounded-2xl border p-4 shadow-sm", colors.card)}>
        <div className="mb-4 flex items-center gap-3">
          <span className={cx("rounded-full px-2 py-1 text-xs", colors.chip)}>Hasilat</span>
          <span className={cx("text-sm", colors.kpiLabel)}>{dashboard.year}</span>
        </div>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dashboard.series} margin={{ left: 0, right: 0, top: 10, bottom: 0 }}>
              <defs><linearGradient id="dashboardRevenueArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6366f1" stopOpacity={0.6} /><stop offset="90%" stopColor="#6366f1" stopOpacity={0.05} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: colors.grid }} />
              <YAxis tick={{ fontSize: 12 }} tickLine={false} axisLine={{ stroke: colors.grid }} />
              <Tooltip formatter={(value: unknown) => `${money(Number(value))} ₼`} />
              <Area type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} fill="url(#dashboardRevenueArea)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className={cx("rounded-2xl border shadow-sm", colors.card)}>
        <div className="flex items-center gap-1 p-4 pb-3"><h2 className="text-sm font-semibold tracking-tight">Sənədlər</h2><span className={cx("text-sm", colors.kpiLabel)}>· {dashboard.year}</span></div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead><tr className={colors.tableHead}>
              <th className="px-4 py-2 text-left font-medium first:pl-6">Ad</th><th className="px-4 py-2 text-left font-medium">Sənəd sayı</th>
              <th className="px-4 py-2 text-left font-medium">Məbləğ</th><th className="px-4 py-2 text-left font-medium last:pr-6">Stok hərəkəti</th>
            </tr></thead>
            <tbody>{dashboard.rows.map((row) => (
              <tr key={row.type}><td className="px-4 py-2 first:pl-6">{row.name}</td><td className="px-4 py-2 tabular-nums">{row.count}</td>
                <td className="px-4 py-2 tabular-nums">{money(row.amount)}</td><td className="px-4 py-2 tabular-nums last:pr-6">{number(row.quantity)}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </>
  );
}
