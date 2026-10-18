import { useMemo, useRef, useState } from "react";
import { requestJson } from "../api";
import {
  buildStatementPreview,
  detectStatementHeader,
  parseStatementCsv,
  statementCellText,
  statementFields,
  suggestStatementMapping,
  type StatementMapping,
  type StatementMatrix,
} from "../bankStatementImport";

const cx = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(" ");

type Account = { id: string; name: string; currency?: string };
type ImportResult = { batch: { createdCount: number; duplicateCount: number; matchedCount: number; unmatchedCount: number }; created: unknown[]; duplicates: unknown[] };

export default function BankStatementImportDialog({ accounts, isDark, onClose, onImported }: { accounts: Account[]; isDark: boolean; onClose: () => void; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [fileName, setFileName] = useState("");
  const [sourceType, setSourceType] = useState<"csv" | "xlsx">("csv");
  const [rows, setRows] = useState<StatementMatrix>([]);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<StatementMapping>(() => suggestStatementMapping([]));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const account = accounts.find((item) => item.id === accountId);
  const headers = rows[headerRow] ?? [];
  const preview = useMemo(() => buildStatementPreview({ rows, headerRow, mapping, sourceName: fileName, defaultCurrency: account?.currency || "TRY" }), [rows, headerRow, mapping, fileName, account?.currency]);
  const validRows = preview.filter((item) => item.valid && item.transaction);
  const invalidRows = preview.filter((item) => !item.valid);
  const inputClass = cx("h-10 w-full rounded-lg border px-3 text-sm", isDark ? "border-white/10 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-800");

  const readFile = async (file?: File) => {
    if (!file) return;
    setError("");
    setResult(null);
    setLoading(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase();
      if (extension !== "csv" && extension !== "xlsx") throw new Error("Yalnız CSV veya XLSX dosyası seçin.");
      const matrix = extension === "csv"
        ? parseStatementCsv(await file.text())
        : await import("read-excel-file/browser").then(({ readSheet }) => readSheet(file) as Promise<StatementMatrix>);
      if (!matrix.length) throw new Error("Dosyada okunabilir satır bulunamadı.");
      const detectedHeader = detectStatementHeader(matrix);
      setFileName(file.name);
      setSourceType(extension);
      setRows(matrix);
      setHeaderRow(detectedHeader);
      setMapping(suggestStatementMapping(matrix[detectedHeader] ?? []));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ekstre okunamadı.");
      setRows([]);
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const changeHeaderRow = (next: number) => {
    setHeaderRow(next);
    setMapping(suggestStatementMapping(rows[next] ?? []));
  };

  const importRows = async () => {
    if (!accountId || !validRows.length) return;
    setLoading(true);
    setError("");
    try {
      const payload = await requestJson<{ data: ImportResult }>("/api/payment-integrations/bank-transactions/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          financialAccountId: accountId,
          sourceName: fileName,
          sourceType,
          transactions: validRows.map((item) => item.transaction),
        }),
      });
      setResult(payload.data);
      onImported();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Ekstre içe aktarılamadı.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/45 p-3 sm:p-6" onMouseDown={onClose}>
      <div className={cx("flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border shadow-2xl", isDark ? "border-white/10 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900")} onMouseDown={(event) => event.stopPropagation()}>
        <div className={cx("flex items-start justify-between gap-4 border-b px-5 py-4", isDark ? "border-white/10" : "border-slate-200")}>
          <div><h2 className="text-lg font-semibold">Banka ekstresi içe aktar</h2><p className="mt-1 text-sm text-slate-500">CSV/XLSX dosyasını önizleyin, kolonları kontrol edin ve mutabakat kuyruğuna gönderin.</p></div>
          <button type="button" onClick={onClose} className={cx("h-9 w-9 rounded-lg border text-lg", isDark ? "border-white/10" : "border-slate-200")} aria-label="Kapat">×</button>
        </div>

        <div className="overflow-y-auto p-5">
          {!result ? <>
            <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_minmax(280px,2fr)]">
              <label className="text-sm font-semibold">Şirket hesabı<select value={accountId} onChange={(event) => setAccountId(event.target.value)} className={cx(inputClass, "mt-2")}><option value="">Hesap seçin</option>{accounts.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.currency || "TRY"}</option>)}</select></label>
              <div><div className="text-sm font-semibold">Ekstre dosyası</div><div className="mt-2 flex min-h-10 flex-wrap items-center gap-2"><button type="button" onClick={() => fileRef.current?.click()} className="surface-primary h-10 rounded-lg px-4 text-sm font-semibold">CSV / XLSX seç</button><span className="min-w-0 truncate text-sm text-slate-500">{fileName || "Dosya seçilmedi"}</span><input ref={fileRef} type="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(event) => void readFile(event.target.files?.[0])} /></div></div>
            </div>

            {rows.length > 0 && <>
              <div className={cx("mt-5 rounded-xl border p-4", isDark ? "border-white/10" : "border-slate-200")}>
                <div className="flex flex-wrap items-end gap-3"><label className="min-w-[220px] text-sm font-semibold">Başlık satırı<select value={headerRow} onChange={(event) => changeHeaderRow(Number(event.target.value))} className={cx(inputClass, "mt-2")}>{rows.slice(0, 20).map((row, index) => <option key={index} value={index}>{index + 1}. satır · {row.slice(0, 4).map(statementCellText).filter(Boolean).join(" | ").slice(0, 80)}</option>)}</select></label><div className="pb-2 text-sm text-slate-500">{validRows.length} geçerli · {invalidRows.length} hatalı satır</div></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{statementFields.map((field) => <label key={field.key} className="text-xs font-semibold text-slate-500">{field.label}<select value={mapping[field.key] ?? ""} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value === "" ? null : Number(event.target.value) }))} className={cx(inputClass, "mt-1 font-normal text-slate-800")}><option value="">Kullanma</option>{headers.map((header, index) => <option key={index} value={index}>{statementCellText(header) || `Kolon ${index + 1}`}</option>)}</select></label>)}</div>
                <div className="mt-3 rounded-lg bg-indigo-50 px-3 py-2 text-xs text-indigo-700">Tutar tek kolondaysa “İmzalı tutar”ı; bankanız borç ve alacağı ayrı veriyorsa “Borç / giden” ile “Alacak / gelen” kolonlarını seçin.</div>
              </div>

              <div className={cx("mt-4 overflow-hidden rounded-xl border", isDark ? "border-white/10" : "border-slate-200")}><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-sm"><thead className={isDark ? "bg-white/5" : "bg-slate-50"}><tr><th className="px-3 py-2 text-left">Satır</th><th className="px-3 py-2 text-left">Tarih</th><th className="px-3 py-2 text-left">Karşı taraf / açıklama</th><th className="px-3 py-2 text-left">Referans</th><th className="px-3 py-2 text-right">Tutar</th><th className="px-3 py-2 text-left">Kontrol</th></tr></thead><tbody>{preview.slice(0, 12).map((item) => <tr key={item.sourceRow} className={cx("border-t", isDark ? "border-white/10" : "border-slate-100")}><td className="px-3 py-2">{item.sourceRow}</td><td className="px-3 py-2 whitespace-nowrap">{item.transaction ? new Date(item.transaction.date).toLocaleString("tr-TR") : "—"}</td><td className="max-w-[320px] truncate px-3 py-2">{item.transaction?.counterpartyName || item.transaction?.description || "—"}</td><td className="px-3 py-2">{item.transaction?.transactionId || "—"}</td><td className={cx("px-3 py-2 text-right font-semibold", (item.transaction?.amount ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600")}>{item.transaction ? item.transaction.amount.toLocaleString("tr-TR", { minimumFractionDigits: 2 }) : "—"}</td><td className="px-3 py-2"><span className={cx("rounded-full px-2 py-1 text-xs font-semibold", item.valid ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700")}>{item.valid ? "Hazır" : item.error}</span></td></tr>)}</tbody></table></div></div>
            </>}
          </> : <div className="py-8 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div><h3 className="mt-4 text-xl font-semibold">Ekstre işlendi</h3><p className="mt-1 text-sm text-slate-500">Yeni hareketler mutabakat kuyruğuna alındı.</p><div className="mx-auto mt-6 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">{[["Yeni", result.batch.createdCount], ["Mükerrer", result.batch.duplicateCount], ["Otomatik eşleşen", result.batch.matchedCount], ["Onay bekleyen", result.batch.unmatchedCount]].map(([label, value]) => <div key={String(label)} className={cx("rounded-xl border p-3", isDark ? "border-white/10" : "border-slate-200")}><div className="text-2xl font-semibold">{value}</div><div className="mt-1 text-xs text-slate-500">{label}</div></div>)}</div></div>}
          {error && <div className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
        </div>

        <div className={cx("flex justify-end gap-2 border-t px-5 py-4", isDark ? "border-white/10" : "border-slate-200")}><button type="button" onClick={onClose} className={cx("h-10 rounded-lg border px-4 text-sm font-semibold", isDark ? "border-white/10" : "border-slate-200")}>{result ? "Kapat" : "Vazgeç"}</button>{!result && <button type="button" onClick={() => void importRows()} disabled={loading || !accountId || !validRows.length} className="surface-primary h-10 rounded-lg px-5 text-sm font-semibold disabled:opacity-50">{loading ? "İşleniyor..." : `${validRows.length || 0} hareketi içe aktar`}</button>}</div>
      </div>
    </div>
  );
}

