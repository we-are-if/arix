import { useEffect, useMemo, useState } from "react";
import { requestJson } from "../api";

type Account = {
  id: string;
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "income" | "expense" | "memo";
  parentCode?: string | null;
  level: number;
  system: boolean;
  active: boolean;
  debit?: number;
  credit?: number;
  balance?: number;
};

type JournalLine = { accountCode: string; debit: number; credit: number; description?: string };
type Journal = {
  id: string;
  number: string;
  date: string;
  description: string;
  sourceType: string;
  status: string;
  debit: number;
  credit: number;
  lines: JournalLine[];
};

type Overview = {
  accountCount: number;
  journalCount: number;
  debit: number;
  credit: number;
  activePeriod: { year: number; status: string } | null;
  trial: Account[];
};

const emptyOverview: Overview = { accountCount: 0, journalCount: 0, debit: 0, credit: 0, activePeriod: null, trial: [] };
const money = (value: number) => new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
const date = (value: string) => value ? new Date(value).toLocaleString("tr-TR") : "-";
const cx = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(" ");
const typeLabels: Record<Account["type"], string> = {
  asset: "Varlıq", liability: "Borç", equity: "Öz kaynak", income: "Gəlir", expense: "Xərc", memo: "Nazım",
};

export default function Accounting({ isDark }: { isDark: boolean }) {
  const [tab, setTab] = useState<"plan" | "journals" | "trial">("plan");
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [journals, setJournals] = useState<Journal[]>([]);
  const [query, setQuery] = useState("");
  const [classFilter, setClassFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ code: "", name: "", type: "asset" as Account["type"], parentCode: "" });

  const surface = isDark ? "border-white/10 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-900";
  const soft = isDark ? "bg-white/5" : "bg-slate-50";
  const subtle = isDark ? "text-slate-400" : "text-slate-500";
  const input = cx("h-10 rounded-lg border px-3 text-sm outline-none focus:border-indigo-500", isDark ? "border-white/10 bg-white/5 text-slate-100" : "border-slate-200 bg-white text-slate-800");

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [overviewPayload, accountPayload, journalPayload] = await Promise.all([
        requestJson<{ data: Overview }>("/api/accounting/overview"),
        requestJson<{ data: Account[] }>("/api/accounting/accounts"),
        requestJson<{ data: Journal[] }>("/api/accounting/journals"),
      ]);
      setOverview(overviewPayload.data);
      setAccounts(accountPayload.data);
      setJournals(journalPayload.data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Mühasibat məlumatları alınmadı.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const filteredAccounts = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("tr-TR");
    return accounts.filter((account) => {
      if (classFilter !== "all" && !account.code.startsWith(classFilter)) return false;
      return !normalized || `${account.code} ${account.name}`.toLocaleLowerCase("tr-TR").includes(normalized);
    });
  }, [accounts, classFilter, query]);

  const createAccount = async () => {
    if (!draft.code.trim() || !draft.name.trim()) return;
    setError("");
    try {
      await requestJson("/api/accounting/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      setDraft({ code: "", name: "", type: "asset", parentCode: "" });
      setCreating(false);
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Hesab yaradıla bilmədi.");
    }
  };

  return (
    <div className="space-y-4">
      <header className={cx("rounded-lg border px-5 py-4", surface)}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className={cx("text-xs font-semibold uppercase", subtle)}>Maliyyə / Mühasibat</div>
            <h1 className="mt-1 text-2xl font-semibold">Tekdüzen mühasibat</h1>
            <p className={cx("mt-1 text-sm", subtle)}>Hesab planı, avtomatik yevmiye qeydləri və mizan.</p>
          </div>
          <div className={cx("rounded-lg border px-3 py-2 text-sm", isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50")}>
            Aktiv dövr: <b>{overview.activePeriod?.year ?? new Date().getFullYear()}</b>
          </div>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Hesab sayı", String(overview.accountCount)],
          ["Yevmiye fişi", String(overview.journalCount)],
          ["Toplam borç", money(overview.debit)],
          ["Toplam alacak", money(overview.credit)],
        ].map(([label, value]) => (
          <article key={label} className={cx("rounded-lg border p-4", surface)}>
            <div className={cx("text-xs font-medium", subtle)}>{label}</div>
            <div className="mt-2 text-xl font-semibold tabular-nums">{value}</div>
          </article>
        ))}
      </section>

      <section className={cx("overflow-hidden rounded-lg border", surface)}>
        <div className="flex flex-wrap items-center gap-2 border-b border-inherit px-4 py-3">
          {([
            ["plan", "Hesap planı"], ["journals", "Yevmiye fişləri"], ["trial", "Mizan"],
          ] as const).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={cx("h-9 rounded-lg px-3 text-sm font-medium", tab === id ? "bg-indigo-600 text-white" : soft)}>{label}</button>
          ))}
          <span className="flex-1" />
          {tab === "plan" && <button type="button" onClick={() => setCreating((value) => !value)} className="h-9 rounded-lg bg-indigo-600 px-3 text-sm font-semibold text-white">Alt hesab əlavə et</button>}
        </div>

        {error && <div className="border-b border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
        {loading && <div className={cx("px-5 py-8 text-sm", subtle)}>Məlumatlar yüklənir...</div>}

        {!loading && tab === "plan" && (
          <div>
            {creating && (
              <div className={cx("grid gap-3 border-b border-inherit p-4 md:grid-cols-[150px_1fr_170px_160px_auto]", soft)}>
                <input className={input} placeholder="120.01.00001" value={draft.code} onChange={(event) => setDraft((value) => ({ ...value, code: event.target.value }))} />
                <input className={input} placeholder="Hesab adı" value={draft.name} onChange={(event) => setDraft((value) => ({ ...value, name: event.target.value }))} />
                <input className={input} placeholder="Ana hesab: 120" value={draft.parentCode} onChange={(event) => setDraft((value) => ({ ...value, parentCode: event.target.value }))} />
                <select className={input} value={draft.type} onChange={(event) => setDraft((value) => ({ ...value, type: event.target.value as Account["type"] }))}>
                  <option value="asset">Varlıq</option><option value="liability">Borç</option><option value="equity">Öz kaynak</option><option value="income">Gəlir</option><option value="expense">Xərc</option><option value="memo">Nazım</option>
                </select>
                <button type="button" onClick={() => void createAccount()} className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white">Saxla</button>
              </div>
            )}
            <div className="flex flex-wrap gap-3 border-b border-inherit p-4">
              <input className={cx(input, "min-w-64 flex-1")} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Kod və ya hesab adı axtar..." />
              <select className={input} value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
                <option value="all">Bütün siniflər</option>
                {Array.from({ length: 9 }, (_, index) => index + 1).map((value) => <option key={value} value={String(value)}>{value} nömrəli sinif</option>)}
              </select>
            </div>
            <div className="max-h-[58vh] overflow-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className={cx("sticky top-0 z-10 text-xs", soft)}><tr><th className="px-4 py-3">KOD</th><th className="px-4 py-3">HESAB ADI</th><th className="px-4 py-3">ANA HESAB</th><th className="px-4 py-3">NÖV</th><th className="px-4 py-3">MƏNBƏ</th><th className="px-4 py-3">STATUS</th></tr></thead>
                <tbody>{filteredAccounts.map((account) => <tr key={account.id} className="border-t border-inherit"><td className="px-4 py-3 font-semibold tabular-nums text-indigo-600">{account.code}</td><td className="px-4 py-3">{account.name}</td><td className={cx("px-4 py-3", subtle)}>{account.parentCode || "-"}</td><td className="px-4 py-3">{typeLabels[account.type]}</td><td className="px-4 py-3">{account.system ? "Tekdüzen" : "Şirkət"}</td><td className="px-4 py-3">{account.active ? "Aktiv" : "Passiv"}</td></tr>)}</tbody>
              </table>
            </div>
          </div>
        )}

        {!loading && tab === "journals" && (
          <div className="max-h-[64vh] overflow-auto">
            {journals.length === 0 ? <div className={cx("px-5 py-10 text-center text-sm", subtle)}>Yeni təsdiqli sənədlər saxlandıqca yevmiye fişləri burada yaranacaq.</div> : journals.map((journal) => (
              <article key={journal.id} className="border-b border-inherit p-4 last:border-b-0">
                <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold">{journal.number} · {journal.description}</div><div className={cx("mt-1 text-xs", subtle)}>{date(journal.date)} · {journal.sourceType}</div></div><div className="text-right text-sm"><div>Borç <b>{money(journal.debit)}</b></div><div>Alacak <b>{money(journal.credit)}</b></div></div></div>
                <div className={cx("mt-3 overflow-hidden rounded-lg border border-inherit", soft)}><table className="w-full text-sm"><tbody>{journal.lines.map((line, index) => <tr key={`${journal.id}-${index}`} className="border-t border-inherit first:border-t-0"><td className="px-3 py-2 font-semibold">{line.accountCode}</td><td className={cx("px-3 py-2", subtle)}>{line.description}</td><td className="px-3 py-2 text-right tabular-nums">{line.debit ? money(line.debit) : "-"}</td><td className="px-3 py-2 text-right tabular-nums">{line.credit ? money(line.credit) : "-"}</td></tr>)}</tbody></table></div>
              </article>
            ))}
          </div>
        )}

        {!loading && tab === "trial" && (
          <div className="max-h-[64vh] overflow-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className={cx("sticky top-0 text-xs", soft)}><tr><th className="px-4 py-3">KOD</th><th className="px-4 py-3">HESAB</th><th className="px-4 py-3 text-right">BORÇ</th><th className="px-4 py-3 text-right">ALACAK</th><th className="px-4 py-3 text-right">BALANS</th></tr></thead>
              <tbody>{overview.trial.map((account) => <tr key={account.id} className="border-t border-inherit"><td className="px-4 py-3 font-semibold text-indigo-600">{account.code}</td><td className="px-4 py-3">{account.name}</td><td className="px-4 py-3 text-right tabular-nums">{money(account.debit || 0)}</td><td className="px-4 py-3 text-right tabular-nums">{money(account.credit || 0)}</td><td className={cx("px-4 py-3 text-right font-semibold tabular-nums", (account.balance || 0) < 0 ? "text-rose-600" : "text-emerald-600")}>{money(account.balance || 0)}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
