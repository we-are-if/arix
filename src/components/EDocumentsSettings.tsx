import { useEffect, useMemo, useState } from "react";
import { requestJson } from "../api";
import EDocumentWorkflowDialog from "./EDocumentWorkflowDialog";

type ProviderId = "mock" | "izibiz" | "edm" | "qnb";
type Environment = "test" | "production";
type EDocumentSettings = {
  enabled: boolean;
  provider: ProviderId;
  environment: Environment;
  company: { title: string; taxNumber: string; taxOffice: string; country: string; address: string; city: string; district: string; postalCode: string; email: string; phone: string };
  aliases: { sender: string; receiver: string; despatch: string };
  modules: { eInvoice: boolean; eArchive: boolean; eDespatch: boolean; exportInvoice: boolean; storage: boolean };
  series: { eInvoice: string; eArchive: string; eDespatch: string; exportInvoice: string };
  automation: { detectRecipient: boolean; syncIncoming: boolean; syncIntervalMinutes: number };
  credentials?: { configured: boolean; source: string; requiredKeys: string[] };
};

type Overview = {
  total: number;
  drafts: number;
  processing: number;
  completed: number;
  failed: number;
  incoming: number;
  outgoing: number;
  lastSyncAt: string | null;
};

type EDocument = {
  id: string;
  sourceDocumentId?: string | number;
  documentType?: string;
  direction?: string;
  number?: string;
  counterpartyName?: string;
  status?: string;
  createdAt?: string;
};

const defaults: EDocumentSettings = {
  enabled: false,
  provider: "mock",
  environment: "test",
  company: { title: "", taxNumber: "", taxOffice: "", country: "TR", address: "", city: "", district: "", postalCode: "", email: "", phone: "" },
  aliases: { sender: "", receiver: "", despatch: "" },
  modules: { eInvoice: true, eArchive: true, eDespatch: true, exportInvoice: true, storage: true },
  series: { eInvoice: "EAR", eArchive: "ARS", eDespatch: "IRS", exportInvoice: "IHR" },
  automation: { detectRecipient: true, syncIncoming: true, syncIntervalMinutes: 15 },
};

const emptyOverview: Overview = {
  total: 0,
  drafts: 0,
  processing: 0,
  completed: 0,
  failed: 0,
  incoming: 0,
  outgoing: 0,
  lastSyncAt: null,
};

const providers: Array<{ id: ProviderId; title: string; subtitle: string }> = [
  { id: "mock", title: "AriX Test", subtitle: "Xaricə məlumat göndərməyən daxili sınaq adapteri" },
  { id: "izibiz", title: "İZİBİZ", subtitle: "e-Fatura, e-Arşiv və e-İrsaliye web servisləri" },
  { id: "edm", title: "EDM", subtitle: "SOAP/WCF əsaslı e-Belge web servisləri" },
  { id: "qnb", title: "QNB eSolutions", subtitle: "Korporativ e-Dönüşüm və API xidmətləri" },
];

const moduleLabels: Array<{ key: keyof EDocumentSettings["modules"]; title: string; subtitle: string }> = [
  { key: "eInvoice", title: "e-Fatura", subtitle: "Qeydiyyatlı mükəlləflərə rəsmi fatura" },
  { key: "eArchive", title: "e-Arşiv", subtitle: "e-Fatura istifadəçisi olmayan alıcılar" },
  { key: "eDespatch", title: "e-İrsaliye", subtitle: "Sevkiyyatdan əvvəl elektron irsaliye" },
  { key: "exportInvoice", title: "İhracat faturası", subtitle: "Gömrük ssenarisi və xarici satışlar" },
  { key: "storage", title: "e-Saklama", subtitle: "XML, görüntü və sistem cavabları" },
];

const cx = (...values: Array<string | false | undefined>) => values.filter(Boolean).join(" ");

export default function EDocumentsSettings({
  border,
  card,
  subtle,
  input,
  isDark,
}: {
  border: string;
  card: string;
  subtle: string;
  input: string;
  isDark: boolean;
}) {
  const [settings, setSettings] = useState<EDocumentSettings>(defaults);
  const [overview, setOverview] = useState<Overview>(emptyOverview);
  const [documents, setDocuments] = useState<EDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">("success");
  const [selectedSourceDocumentId, setSelectedSourceDocumentId] = useState<string | number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const payload = await requestJson<{ data: EDocument[]; overview: Overview; settings: EDocumentSettings }>("/api/e-documents");
      setDocuments(payload.data ?? []);
      setOverview(payload.overview ?? emptyOverview);
      setSettings({ ...defaults, ...payload.settings });
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "e-Belge ayarları alınmadı.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener("arix:e-documents-updated", refresh);
    return () => window.removeEventListener("arix:e-documents-updated", refresh);
  }, []);

  const provider = useMemo(() => providers.find((item) => item.id === settings.provider) ?? providers[0], [settings.provider]);

  const save = async (quiet = false) => {
    setSaving(true);
    if (!quiet) setMessage("");
    try {
      const payload = await requestJson<{ data: { eDocumentSettings: EDocumentSettings } }>("/api/company-settings", {
        method: "PATCH",
        body: JSON.stringify({ eDocumentSettings: settings }),
      });
      setSettings({ ...defaults, ...payload.data.eDocumentSettings });
      if (!quiet) {
        setMessageTone("success");
        setMessage("e-Belge ayarları saxlandı.");
      }
      return true;
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Ayarlar saxlanmadı.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setMessage("");
    try {
      const saved = await save(true);
      if (!saved) return;
      const payload = await requestJson<{ data: { ok: boolean; message: string } }>("/api/e-documents/connection-test", { method: "POST" });
      setMessageTone(payload.data.ok ? "success" : "error");
      setMessage(payload.data.message);
      await load();
    } catch (error) {
      setMessageTone("error");
      setMessage(error instanceof Error ? error.message : "Bağlantı yoxlanmadı.");
    } finally {
      setTesting(false);
    }
  };

  const patchCompany = (patch: Partial<EDocumentSettings["company"]>) =>
    setSettings((current) => ({ ...current, company: { ...current.company, ...patch } }));
  const patchAliases = (patch: Partial<EDocumentSettings["aliases"]>) =>
    setSettings((current) => ({ ...current, aliases: { ...current.aliases, ...patch } }));
  const patchSeries = (patch: Partial<EDocumentSettings["series"]>) =>
    setSettings((current) => ({ ...current, series: { ...current.series, ...patch } }));
  const patchAutomation = (patch: Partial<EDocumentSettings["automation"]>) =>
    setSettings((current) => ({ ...current, automation: { ...current.automation, ...patch } }));

  const sectionClass = cx("rounded-2xl border p-5", border, card);

  return (
    <>
    <div className="space-y-4">
      <section className={sectionClass}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold">e-Belge bağlantısı</h2>
              <span className={cx("rounded-full px-3 py-1 text-xs font-semibold", settings.environment === "test" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>
                {settings.environment === "test" ? "Test mühiti" : "Canlı mühit"}
              </span>
            </div>
            <p className={cx("mt-1 text-sm", subtle)}>AriX sənədləri vahid modeldə saxlayır; provayder dəyişəndə satış axını dəyişmir.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <label className={cx("flex h-10 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold", border)}>
              <input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings((current) => ({ ...current, enabled: event.target.checked }))} className="h-4 w-4 accent-indigo-600" />
              Axın aktivdir
            </label>
            <button type="button" onClick={() => void testConnection()} disabled={testing || loading} className={cx("h-10 rounded-xl border px-4 text-sm font-semibold", border, "hover:bg-white/50 disabled:opacity-60")}>
              {testing ? "Yoxlanılır..." : "Bağlantını yoxla"}
            </button>
            <button type="button" onClick={() => void save()} disabled={saving || loading} className="surface-primary h-10 rounded-xl px-5 text-sm font-semibold disabled:opacity-60">
              {saving ? "Saxlanılır..." : "Saxla"}
            </button>
          </div>
        </div>
        {message ? (
          <div className={cx("mt-4 rounded-xl border px-4 py-3 text-sm", messageTone === "error" ? "border-rose-200 bg-rose-50 text-rose-700" : "border-emerald-200 bg-emerald-50 text-emerald-700")}>
            {message}
          </div>
        ) : null}
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Bütün sənədlər", overview.total],
          ["Qaralama", overview.drafts],
          ["Uğurlu", overview.completed],
          ["Xəta", overview.failed],
        ].map(([label, value]) => (
          <div key={String(label)} className={cx("rounded-2xl border p-4", border, card)}>
            <div className={cx("text-xs font-semibold", subtle)}>{label}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
          </div>
        ))}
      </div>

      <section className={sectionClass}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Provayder və mühit</h3>
            <p className={cx("mt-1 text-sm", subtle)}>İlk mərhələdə AriX Test seçili qalacaq.</p>
          </div>
          <div className={cx("inline-flex w-fit rounded-xl border p-1", border)}>
            {(["test", "production"] as Environment[]).map((environment) => (
              <button
                key={environment}
                type="button"
                onClick={() => setSettings((current) => ({ ...current, environment }))}
                className={cx("h-9 rounded-lg px-4 text-sm font-semibold", settings.environment === environment ? "surface-nav-active text-indigo-700" : subtle)}
              >
                {environment === "test" ? "Test" : "Canlı"}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {providers.map((item) => {
            const active = settings.provider === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSettings((current) => ({ ...current, provider: item.id, enabled: item.id !== "mock" ? current.enabled : false }))}
                className={cx("min-h-28 rounded-xl border p-4 text-left transition", active ? "border-indigo-400 bg-indigo-500/10 shadow-sm" : cx(border, "hover:bg-white/45"))}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{item.title}</span>
                  <span className={cx("h-3 w-3 rounded-full border", active ? "border-indigo-500 bg-indigo-500" : border)} />
                </div>
                <p className={cx("mt-2 text-xs leading-5", subtle)}>{item.subtitle}</p>
              </button>
            );
          })}
        </div>
        <div className={cx("mt-4 flex flex-col gap-3 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between", border)}>
          <div>
            <div className="text-sm font-semibold">{provider.title} giriş məlumatları</div>
            <div className={cx("mt-1 text-xs", subtle)}>Şifrələr brauzerdə və verilənlər bazasında saxlanmır; yalnız server secret-lərindən oxunur.</div>
          </div>
          <span className={cx("w-fit rounded-full px-3 py-1 text-xs font-semibold", settings.credentials?.configured ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700")}>
            {settings.credentials?.configured ? "Hazır" : "Giriş məlumatı gözlənilir"}
          </span>
        </div>
      </section>

      <section className={sectionClass}>
        <div className="mb-4">
          <h3 className="text-lg font-semibold">Firma və GİB ünvanları</h3>
          <p className={cx("mt-1 text-sm", subtle)}>Bu məlumatlar rəsmi UBL-TR sənədinin göndərən tərəfini təşkil edəcək.</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Field label="Rəsmi firma adı"><input className={input} value={settings.company.title} onChange={(event) => patchCompany({ title: event.target.value })} placeholder="ERSAFOLYO ... LTD. ŞTİ." /></Field>
          <div className="grid gap-4 sm:grid-cols-[1fr_0.7fr]">
            <Field label="VKN / TCKN"><input className={input} value={settings.company.taxNumber} onChange={(event) => patchCompany({ taxNumber: event.target.value.replace(/\D/g, "").slice(0, 11) })} inputMode="numeric" placeholder="10 və ya 11 rəqəm" /></Field>
            <Field label="Ölkə"><input className={input} value={settings.company.country} onChange={(event) => patchCompany({ country: event.target.value.toUpperCase().slice(0, 2) })} /></Field>
          </div>
          <Field label="Vergi dairəsi"><input className={input} value={settings.company.taxOffice} onChange={(event) => patchCompany({ taxOffice: event.target.value })} /></Field>
          <Field label="Rəsmi ünvan"><input className={input} value={settings.company.address} onChange={(event) => patchCompany({ address: event.target.value })} placeholder="Küçə, bina və qapı nömrəsi" /></Field>
          <div className="grid gap-4 sm:grid-cols-3 lg:col-span-2">
            <Field label="Şəhər"><input className={input} value={settings.company.city} onChange={(event) => patchCompany({ city: event.target.value })} /></Field>
            <Field label="Rayon"><input className={input} value={settings.company.district} onChange={(event) => patchCompany({ district: event.target.value })} /></Field>
            <Field label="Poçt indeksi"><input className={input} value={settings.company.postalCode} onChange={(event) => patchCompany({ postalCode: event.target.value })} /></Field>
          </div>
          <Field label="Telefon"><input className={input} value={settings.company.phone} onChange={(event) => patchCompany({ phone: event.target.value })} /></Field>
          <Field label="E-poçt"><input className={input} value={settings.company.email} onChange={(event) => patchCompany({ email: event.target.value })} type="email" /></Field>
          <Field label="Göndərən birim etiketi"><input className={input} value={settings.aliases.sender} onChange={(event) => patchAliases({ sender: event.target.value })} placeholder="urn:mail:defaultgb@firma.com.tr" /></Field>
          <Field label="Posta qutusu etiketi"><input className={input} value={settings.aliases.receiver} onChange={(event) => patchAliases({ receiver: event.target.value })} placeholder="urn:mail:defaultpk@firma.com.tr" /></Field>
          <Field label="e-İrsaliye etiketi"><input className={input} value={settings.aliases.despatch} onChange={(event) => patchAliases({ despatch: event.target.value })} placeholder="urn:mail:defaultpk@firma.com.tr" /></Field>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <section className={sectionClass}>
          <h3 className="text-lg font-semibold">Aktiv modullar</h3>
          <div className="mt-4 divide-y divide-slate-200/70">
            {moduleLabels.map((item) => (
              <label key={item.key} className="flex cursor-pointer items-center gap-4 py-3 first:pt-0 last:pb-0">
                <input
                  type="checkbox"
                  checked={settings.modules[item.key]}
                  onChange={(event) => setSettings((current) => ({ ...current, modules: { ...current.modules, [item.key]: event.target.checked } }))}
                  className="h-4 w-4 accent-indigo-600"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{item.title}</span>
                  <span className={cx("mt-0.5 block text-xs", subtle)}>{item.subtitle}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className={sectionClass}>
          <h3 className="text-lg font-semibold">Sənəd seriyaları</h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <SeriesField label="e-Fatura" value={settings.series.eInvoice} input={input} onChange={(value) => patchSeries({ eInvoice: value })} />
            <SeriesField label="e-Arşiv" value={settings.series.eArchive} input={input} onChange={(value) => patchSeries({ eArchive: value })} />
            <SeriesField label="e-İrsaliye" value={settings.series.eDespatch} input={input} onChange={(value) => patchSeries({ eDespatch: value })} />
            <SeriesField label="İhracat" value={settings.series.exportInvoice} input={input} onChange={(value) => patchSeries({ exportInvoice: value })} />
          </div>
          <div className={cx("mt-4 rounded-xl border px-4 py-3 text-xs leading-5", border, subtle)}>Seriyalar 3 simvoldan ibarətdir. Rəsmi nömrə provayder təsdiqindən sonra dəyişməz snapshot kimi saxlanacaq.</div>
        </section>
      </div>

      <section className={sectionClass}>
        <div className="grid gap-4 lg:grid-cols-3">
          <Toggle label="Alıcını avtomatik tanı" description="VKN/TCKN ilə e-Fatura və e-Arşiv seçimi" checked={settings.automation.detectRecipient} onChange={(checked) => patchAutomation({ detectRecipient: checked })} subtle={subtle} />
          <Toggle label="Gələn sənədləri sinxronlaşdır" description="Fatura və irsaliyələri avtomatik gətir" checked={settings.automation.syncIncoming} onChange={(checked) => patchAutomation({ syncIncoming: checked })} subtle={subtle} />
          <Field label="Sinxronizasiya aralığı">
            <select className={input} value={settings.automation.syncIntervalMinutes} onChange={(event) => patchAutomation({ syncIntervalMinutes: Number(event.target.value) })}>
              <option value={5}>5 dəqiqə</option>
              <option value={15}>15 dəqiqə</option>
              <option value={30}>30 dəqiqə</option>
              <option value={60}>1 saat</option>
            </select>
          </Field>
        </div>
      </section>

      <section className={sectionClass}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Sənəd qutusu</h3>
            <p className={cx("mt-1 text-sm", subtle)}>Gələn və gedən rəsmi sənədlər burada görünəcək.</p>
          </div>
          <div className={cx("text-xs", subtle)}>Gələn {overview.incoming} · Gedən {overview.outgoing}</div>
        </div>
        {documents.length ? (
          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200/70">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className={isDark ? "bg-white/5 text-slate-300" : "bg-slate-50 text-slate-600"}>
                <tr><th className="px-4 py-3">Tarix</th><th className="px-4 py-3">Növ</th><th className="px-4 py-3">Nömrə</th><th className="px-4 py-3">Kontragent</th><th className="px-4 py-3">İstiqamət</th><th className="px-4 py-3">Status</th><th className="px-4 py-3 text-right">Əməliyyat</th></tr>
              </thead>
              <tbody>
                {documents.map((document) => (
                  <tr key={document.id} className="border-t border-slate-200/70">
                    <td className="px-4 py-3">{document.createdAt ? new Date(document.createdAt).toLocaleString("tr-TR") : "-"}</td>
                    <td className="px-4 py-3 font-semibold">{document.documentType ?? "-"}</td>
                    <td className="px-4 py-3">{document.number ?? "Taslak"}</td>
                    <td className="px-4 py-3">{document.counterpartyName ?? "-"}</td>
                    <td className="px-4 py-3">{document.direction === "incoming" ? "Gələn" : "Gedən"}</td>
                    <td className="px-4 py-3">{document.status ?? "draft"}</td>
                    <td className="px-4 py-3 text-right">{document.sourceDocumentId ? <button type="button" onClick={() => setSelectedSourceDocumentId(document.sourceDocumentId ?? null)} className="font-semibold text-indigo-600 hover:underline">Aç</button> : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className={cx("mt-4 flex min-h-36 items-center justify-center rounded-xl border border-dashed px-6 text-center text-sm", border, subtle)}>
            Hələ rəsmi sənəd yoxdur. Test adapteri hazır olduqdan sonra satışdan ilk qaralama burada yaranacaq.
          </div>
        )}
      </section>
    </div>
    {selectedSourceDocumentId && <EDocumentWorkflowDialog sourceDocumentId={selectedSourceDocumentId} isDark={isDark} onClose={() => setSelectedSourceDocumentId(null)} />}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1.5 block text-sm font-semibold">{label}</span>{children}</label>;
}

function SeriesField({ label, value, input, onChange }: { label: string; value: string; input: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <input className={input} value={value} maxLength={3} onChange={(event) => onChange(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3))} />
    </Field>
  );
}

function Toggle({ label, description, checked, onChange, subtle }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void; subtle: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-1 h-4 w-4 accent-indigo-600" />
      <span><span className="block text-sm font-semibold">{label}</span><span className={cx("mt-1 block text-xs leading-5", subtle)}>{description}</span></span>
    </label>
  );
}
