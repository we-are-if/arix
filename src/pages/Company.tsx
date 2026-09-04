import { useEffect, useMemo, useState, type SVGProps } from "react";
import { requestJson } from "../api";
import AriXLogo from "../components/AriXLogo";
import { defaultPrintSettings, mergePrintSettings, type PrintFormKey, type PrintSettings } from "../print/printSettings";

export type CompanySection = "settings" | "employees" | "stores" | "accounts" | "loyalty" | "printForms";
type StockMode = "simple" | "bondedRolls";
type ExchangeRateSource = "tcmb" | "cbar" | "frankfurter" | "manual";
type DocumentRateDay = "instant" | "previousDay" | "twoDaysBefore";
type TcmbRateType = "banknote" | "forex";
type ExchangeSettings = {
  source: ExchangeRateSource;
  documentRateDay: DocumentRateDay;
  tcmbRateType: TcmbRateType;
  baseCurrency: string;
  symbols: string[];
  manualRates: Record<string, number>;
};
type CompanySettings = {
  stockMode: StockMode;
  allowNegativeStock: boolean;
  reserveBeforeBondedExit: boolean;
  rollTracking: boolean;
  exchangeSettings: ExchangeSettings;
  printSettings: PrintSettings;
};

const defaultCompanySettings: CompanySettings = {
  stockMode: "simple",
  allowNegativeStock: false,
  reserveBeforeBondedExit: true,
  rollTracking: false,
  exchangeSettings: {
    source: "tcmb",
    documentRateDay: "previousDay",
    tcmbRateType: "banknote",
    baseCurrency: "TRY",
    symbols: ["USD", "EUR", "AZN"],
    manualRates: { USD: 0, EUR: 0, AZN: 0 },
  },
  printSettings: defaultPrintSettings,
};

type ExchangeRatePreview = {
  source: ExchangeRateSource | "manual";
  sourceLabel: string;
  rateType?: TcmbRateType;
  sourceBaseCurrency?: string;
  date: string;
  requestedOffset: number;
  fallbackDays?: number | null;
  baseCurrency: string;
  rates: Record<string, number>;
  url?: string;
};

const cx = (...s: (string | false | undefined)[]) => s.filter(Boolean).join(" ");

const mergeCompanySettings = (data?: Partial<CompanySettings>): CompanySettings => ({
  ...defaultCompanySettings,
  ...(data ?? {}),
  exchangeSettings: {
    ...defaultCompanySettings.exchangeSettings,
    ...(data?.exchangeSettings ?? {}),
    manualRates: {
      ...defaultCompanySettings.exchangeSettings.manualRates,
      ...(data?.exchangeSettings?.manualRates ?? {}),
    },
    symbols: Array.isArray(data?.exchangeSettings?.symbols)
      ? data.exchangeSettings.symbols
      : defaultCompanySettings.exchangeSettings.symbols,
  },
  printSettings: mergePrintSettings(data?.printSettings),
});

const prepareCompanyLogo = (file: File) =>
  new Promise<string>((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Şəkil faylı seçin."));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Loqo oxunmadı."));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error("Loqo açıla bilmədi."));
      image.onload = () => {
        const scale = Math.min(1, 900 / image.width, 320 / image.height);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        if (!context) {
          reject(new Error("Loqo hazırlana bilmədi."));
          return;
        }
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/png"));
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });

const I = {
  Building: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 21h16" /><path d="M6 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" />
      <path d="M9 8h1M14 8h1M9 12h1M14 12h1M9 16h1M14 16h1" />
    </svg>
  ),
  User: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  ),
  Wallet: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" /><path d="M16 13h5" />
    </svg>
  ),
  File: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M10 13h6M10 17h4" />
    </svg>
  ),
  Eye: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ),
  More: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="currentColor" {...p}>
      <circle cx="12" cy="5" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="12" cy="19" r="1.8" />
    </svg>
  ),
  Phone: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.7 19.7 0 0 1-8.6-3.1 19.2 19.2 0 0 1-5.9-5.9A19.7 19.7 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.7 2.6a2 2 0 0 1-.4 2.1L8.1 9.7a16 16 0 0 0 6.2 6.2l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.6 2.6.7A2 2 0 0 1 22 16.9Z" />
    </svg>
  ),
  Mail: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
    </svg>
  ),
  Plus: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Edit: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  ),
  Trash: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" />
    </svg>
  ),
};

const titles: Record<CompanySection, { title: string; subtitle: string }> = {
  settings: { title: "Şirkət parametrləri", subtitle: "Rekvizitlər, vergi, valyuta və əlaqə məlumatları." },
  employees: { title: "Əməkdaşlar", subtitle: "Komanda, rollar və sistem girişləri." },
  stores: { title: "Mağazalar", subtitle: "Mağaza, anbar və satış nöqtələri." },
  accounts: { title: "Hesablar", subtitle: "Kassa, bank və mağaza hesabları." },
  loyalty: { title: "Sadiqlik", subtitle: "Endirim, bonus və müştəri sadiqliyi qaydaları." },
  printForms: { title: "Çap formaları", subtitle: "Sənəd, qəbz və etiket şablonları." },
};

const employees = [
  { name: "Arif Mahmud", role: "Sahib", phone: "+90 554 113 7244", email: "arifmd@icloud.com", tone: "indigo" },
  { name: "Ekrem Tiryaki", role: "Rəhbər", phone: "+90 533 281 5488", email: "ekrem@arix.az", tone: "emerald" },
  { name: "Serkan Şeremet", role: "Satış rəhbəri", phone: "+90 533 707 5488", email: "serkan@arix.az", tone: "sky" },
  { name: "Sami", role: "Anbar əməliyyatları", phone: "+964 750 448 7617", email: "sami@arix.az", tone: "amber" },
  { name: "Mustafa Yazman", role: "Maliyyə", phone: "+90 533 965 488", email: "mustafa@arix.az", tone: "violet" },
];

const stores = [
  { name: "ERSA DEPO", type: "Əsas mağaza", date: "22 sentyabr 2024", status: "Aktiv", balance: "522,199.72 ₼" },
  { name: "ERSA ANTREPO", type: "Anbar", date: "5 noyabr 2024", status: "Aktiv", balance: "1,147,922.59 ₼" },
];

const accounts = [
  { name: "Kassa №1", type: "Kassa", date: "22 sentyabr 2024", balance: "0.00 ₼" },
  { name: "Ekrem Tiryaki", type: "Kassa", date: "11 noyabr 2024", balance: "0.00 ₼" },
  { name: "ERSA DEPO", type: "Mağaza hesabı", date: "22 sentyabr 2024", balance: "522,199.72 ₼" },
  { name: "ERSA ANTREPO", type: "Mağaza hesabı", date: "5 noyabr 2024", balance: "-1,147,922.59 ₼" },
];

const printGroups: Array<{ title: string; forms: Array<{ key: PrintFormKey; label: string; description: string }> }> = [
  {
    title: "Əməliyyat sənədləri",
    forms: [
      { key: "sale", label: "Satış sənədi", description: "Satış, məhsul və ödəniş məlumatları" },
      { key: "orderConfirmation", label: "Sipariş onay formu", description: "Adi satışlar üçün müştəri təsdiq forması" },
      { key: "proforma", label: "Proforma invoice", description: "İxracat üçün ilkin invoice, KDV-siz" },
      { key: "commercial", label: "Commercial invoice", description: "Rəsmi ixrac invoice forması" },
      { key: "packingList", label: "Packing list", description: "Göndərilən palet, rulo və çəki siyahısı" },
      { key: "purchase", label: "Alış sənədi", description: "Təchizatçıdan alış və palet detalları" },
      { key: "movement", label: "Yerdəyişmə sənədi", description: "Mağazalar arasında stok hərəkəti" },
      { key: "customs", label: "Antrepo düşüm", description: "Bəyannamə, palet və rulo siyahısı" },
    ],
  },
  {
    title: "Anbar və maliyyə",
    forms: [
      { key: "inventory", label: "İnventar siyahısı", description: "Faktiki və sistem qalığı" },
      { key: "writeOff", label: "Silinmə aktı", description: "Stokdan silinən məhsullar" },
      { key: "receipt", label: "Ödəniş qəbzi", description: "Kontragent ödəniş məlumatları" },
      { key: "label", label: "Məhsul etiketi", description: "Məhsul və barkod məlumatları" },
    ],
  },
];

const toneClass = (tone: string, isDark: boolean) => {
  const dark: Record<string, string> = {
    amber: "bg-amber-400/12 text-amber-200",
    emerald: "bg-emerald-400/12 text-emerald-200",
    indigo: "bg-indigo-400/12 text-indigo-200",
    sky: "bg-sky-400/12 text-sky-200",
    violet: "bg-violet-400/12 text-violet-200",
  };
  const light: Record<string, string> = {
    amber: "bg-amber-50 text-amber-700",
    emerald: "bg-emerald-50 text-emerald-700",
    indigo: "bg-indigo-50 text-indigo-700",
    sky: "bg-sky-50 text-sky-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (isDark ? dark : light)[tone] ?? (isDark ? dark.indigo : light.indigo);
};

export default function Company({ section, isDark = false }: { section: CompanySection; isDark?: boolean }) {
  const meta = titles[section];
  const border = isDark ? "border-white/10" : "border-white/60";
  const card = isDark ? "glass-panel-dark text-slate-100" : "glass-panel text-slate-900";
  const soft = isDark ? "bg-white/5" : "bg-white/55";
  const subtle = isDark ? "text-slate-400" : "text-slate-500";
  const input = cx("h-11 w-full rounded-xl border px-3 outline-none", border, isDark ? "bg-white/5 text-slate-100" : "bg-white/75 text-slate-800");
  const stats = useMemo(() => {
    if (section === "employees") return [{ label: "Cəmi əməkdaş", value: "5" }, { label: "Rəhbər", value: "3" }, { label: "Anbar", value: "1" }];
    if (section === "stores") return [{ label: "Mağaza", value: "1" }, { label: "Anbar", value: "1" }, { label: "Aktiv nöqtə", value: "2" }];
    if (section === "accounts") return [{ label: "Balans", value: "-625,722.87 ₼" }, { label: "Kassa", value: "2" }, { label: "Mağaza hesabı", value: "2" }];
    if (section === "printForms") return [{ label: "Şablon", value: "8" }, { label: "Aktiv", value: "8" }, { label: "Qrup", value: "4" }];
    return [{ label: "Profil", value: "Hazır" }, { label: "Valyuta", value: "AZN" }, { label: "Ölkə", value: "Azərbaycan" }];
  }, [section]);

  const stockModes: { id: StockMode; title: string; subtitle: string; points: string[] }[] = [
    {
      id: "simple",
      title: "Sadə stok",
      subtitle: "Palet və rulo izləməsi olmayan firmalar üçün klassik anbar qalığı.",
      points: ["Məhsul üzrə ümumi miqdar", "Antrepo və depo balansı", "Satışda miqdar birbaşa azalır"],
    },
    {
      id: "bondedRolls",
      title: "Antrepo / rulo izləmə",
      subtitle: "Konteyner, palet və tam rulo seçimi ilə gömrük anbarı axını.",
      points: ["Konteyner → palet → rulo strukturu", "Rezerv → depoya çəkim / ixrac", "Net və gross kilo izləmə"],
    },
  ];

  return (
    <div className={cx("space-y-4", section === "settings" && "flex max-h-[calc(100vh-8rem)] flex-col overflow-hidden")} data-stock-mode-count={stockModes.length}>
      <div className={cx("rounded-2xl border p-4", border, card)}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className={cx("text-xs font-semibold uppercase tracking-wide", subtle)}>Şirkət / {meta.title}</div>
            <h1 className="mt-1 text-2xl font-semibold">{meta.title}</h1>
            <p className={cx("mt-1 text-sm", subtle)}>{meta.subtitle}</p>
          </div>
          {section !== "settings" && section !== "printForms" && <button type="button" className="surface-primary h-10 rounded-xl px-4 text-sm font-semibold">Yarat</button>}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {stats.map((item) => (
          <div key={item.label} className={cx("rounded-2xl border p-4", border, card)}>
            <div className={cx("text-xs font-semibold", subtle)}>{item.label}</div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">{item.value}</div>
          </div>
        ))}
      </div>

      {section === "settings" && <SettingsView border={border} card={card} subtle={subtle} input={input} />}
      {section === "employees" && <EmployeesView border={border} card={card} soft={soft} subtle={subtle} isDark={isDark} />}
      {section === "stores" && <StoresView border={border} card={card} soft={soft} subtle={subtle} />}
      {section === "accounts" && <AccountsView border={border} card={card} soft={soft} subtle={subtle} />}
      {section === "loyalty" && <LoyaltyView border={border} card={card} soft={soft} subtle={subtle} />}
      {section === "printForms" && <PrintFormsView border={border} card={card} soft={soft} subtle={subtle} input={input} isDark={isDark} />}
    </div>
  );
}

function SettingsView({ border, card, subtle, input }: { border: string; card: string; subtle: string; input: string }) {
  const [settings, setSettings] = useState<CompanySettings>(defaultCompanySettings);
  const [saving, setSaving] = useState(false);
  const [ratePreview, setRatePreview] = useState<ExchangeRatePreview | null>(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [rateMessage, setRateMessage] = useState("");

  useEffect(() => {
    let alive = true;
    requestJson<{ data: CompanySettings }>("/api/company-settings")
      .then((payload) => {
        if (alive) setSettings(mergeCompanySettings(payload.data));
      })
      .catch(() => {
        /* keep defaults when API is unavailable */
      });
    return () => {
      alive = false;
    };
  }, []);

  const saveStockMode = async (stockMode: StockMode) => {
    const nextSettings = {
      ...settings,
      stockMode,
      rollTracking: stockMode === "bondedRolls",
      reserveBeforeBondedExit: stockMode === "bondedRolls" ? true : settings.reserveBeforeBondedExit,
    };
    setSettings(nextSettings);
    setSaving(true);
    try {
      const payload = await requestJson<{ data: CompanySettings }>("/api/company-settings", {
        method: "PATCH",
        body: JSON.stringify(nextSettings),
      });
      setSettings(mergeCompanySettings(payload.data));
      window.dispatchEvent(new CustomEvent("arix:company-settings-updated", { detail: payload.data }));
    } catch {
      /* optimistic UI remains; next save will retry */
    } finally {
      setSaving(false);
    }
  };

  const saveExchangeSettings = async (exchangeSettings = settings.exchangeSettings) => {
    const nextSettings = { ...settings, exchangeSettings };
    setSettings(nextSettings);
    setSaving(true);
    setRateMessage("");
    try {
      const payload = await requestJson<{ data: CompanySettings }>("/api/company-settings", {
        method: "PATCH",
        body: JSON.stringify({ exchangeSettings }),
      });
      setSettings(mergeCompanySettings(payload.data));
      setRateMessage("Məzənnə ayarları saxlandı.");
      window.dispatchEvent(new CustomEvent("arix:company-settings-updated", { detail: payload.data }));
    } catch (error) {
      setRateMessage(error instanceof Error ? error.message : "Məzənnə ayarları saxlanmadı.");
    } finally {
      setSaving(false);
    }
  };

  const loadExchangePreview = async (exchangeSettings = settings.exchangeSettings, options: { silent?: boolean } = {}) => {
    if (exchangeSettings.source === "manual") {
      setRateLoading(false);
      setRatePreview({
        source: "manual",
        sourceLabel: "Manual",
        date: new Date().toISOString().slice(0, 10),
        requestedOffset: 0,
        fallbackDays: 0,
        sourceBaseCurrency: exchangeSettings.baseCurrency,
        baseCurrency: exchangeSettings.baseCurrency,
        rates: {
          ...exchangeSettings.manualRates,
          [exchangeSettings.baseCurrency]: 1,
        },
        url: "",
      });
      if (!options.silent) setRateMessage("Manual kurslar göstərilir.");
      return;
    }
    setRateLoading(true);
    if (!options.silent) setRateMessage("");
    try {
      const params = new URLSearchParams({
        source: exchangeSettings.source,
        dayMode: exchangeSettings.documentRateDay,
        tcmbRateType: exchangeSettings.tcmbRateType,
        baseCurrency: exchangeSettings.baseCurrency,
        symbols: exchangeSettings.symbols.join(","),
      });
      const payload = await requestJson<{ data: ExchangeRatePreview }>(`/api/exchange-rates?${params.toString()}`);
      setRatePreview(payload.data);
      if (!options.silent) setRateMessage(`${payload.data.sourceLabel} kursu alındı: ${payload.data.date}`);
    } catch (error) {
      if (!options.silent) setRateMessage(error instanceof Error ? error.message : "Məzənnə alınmadı.");
    } finally {
      setRateLoading(false);
    }
  };

  useEffect(() => {
    const current = settings.exchangeSettings;
    if (!current.symbols.length) {
      setRatePreview(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void loadExchangePreview(current, { silent: true });
    }, 350);
    return () => window.clearTimeout(timer);
  }, [
    settings.exchangeSettings.source,
    settings.exchangeSettings.documentRateDay,
    settings.exchangeSettings.tcmbRateType,
    settings.exchangeSettings.baseCurrency,
    settings.exchangeSettings.symbols.join(","),
    settings.exchangeSettings.manualRates,
  ]);

  const updateExchangeSettings = (patch: Partial<ExchangeSettings>) => {
    setSettings((current) => ({
      ...current,
      exchangeSettings: {
        ...current.exchangeSettings,
        ...patch,
      },
    }));
  };

  const updateManualRate = (symbol: string, value: string) => {
    const numeric = Number(value.replace(",", "."));
    updateExchangeSettings({
      manualRates: {
        ...settings.exchangeSettings.manualRates,
        [symbol]: Number.isFinite(numeric) ? numeric : 0,
      },
    });
  };

  const stockModes: { id: StockMode; title: string; subtitle: string; points: string[] }[] = [
    {
      id: "simple",
      title: "Sadə stok",
      subtitle: "Palet və rulo izləməsi olmayan firmalar üçün klassik anbar qalığı.",
      points: ["Məhsul üzrə ümumi miqdar", "Antrepo və depo balansı", "Satışda miqdar birbaşa azalır"],
    },
    {
      id: "bondedRolls",
      title: "Antrepo / rulo izləmə",
      subtitle: "Konteyner, palet və tam rulo seçimi ilə gömrük anbarı axını.",
      points: ["Konteyner → palet → rulo strukturu", "Rezerv → depoya çəkim / ixrac", "Net və gross kilo izləmə"],
    },
  ];
  const tabs = ["Əsaslar", "Rekvizitlər", "Vergilər", "Email hesabı", "Məlumatlar"];
  return (
    <div className={cx("min-h-0 flex-1 overflow-y-auto rounded-2xl border p-5 [scrollbar-gutter:stable]", border, card)}>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-3xl font-semibold">AriX</h2>
          <p className={cx("mt-1 text-sm", subtle)}>Yaradıldı 22 sentyabr 2024</p>
        </div>
        <div className={cx("text-right text-3xl font-semibold", subtle)}>
          Şirkət
          <div className="mt-1 text-sm font-medium">ID 66f01208b6f19c57377baaea</div>
        </div>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((tab, index) => (
          <button key={tab} type="button" className={cx("h-10 rounded-xl px-4 text-sm font-semibold", index === 0 ? "surface-nav-active text-indigo-700" : "hover:bg-white/50")}>
            {tab}
          </button>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Təşkilatın adı" className="lg:col-span-2"><input className={input} defaultValue="AriX" /></Field>
        <Field label="Ölkə"><select className={input} defaultValue="Azərbaycan"><option>Azərbaycan</option><option>Türkiyə</option></select></Field>
        <Field label="Əsas valyuta"><select className={input} defaultValue="AZN"><option>AZN</option><option>USD</option><option>TRY</option></select></Field>
        <Field label="Valyuta göstər" className="lg:col-span-2"><input className={input} defaultValue="₼" /></Field>
        <Field label="Çəki mallarının prefiks barkodu" className="lg:col-span-2"><input className={input} defaultValue="21" /></Field>
        <Field label="Telefon" className="lg:col-span-2"><input className={input} defaultValue="+994 50 000 00 00" /></Field>
        <Field label="E-poçt" className="lg:col-span-2"><input className={input} placeholder="mail@arix.az" /></Field>
        <Field label="Sayt" className="lg:col-span-2"><input className={input} placeholder="www.example.com" /></Field>
      </div>
      <div className={cx("mt-6 rounded-2xl border p-4", border, card)}>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="text-lg font-semibold">Valyuta məzənnələri</div>
            <p className={cx("mt-1 text-sm", subtle)}>
              Sənədlərdə istifadə olunacaq kurs mənbəyini və tarix qaydasını seçin.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadExchangePreview()}
              disabled={rateLoading}
              className={cx("h-10 rounded-xl border px-4 text-sm font-semibold", border, rateLoading ? "opacity-60" : "hover:bg-white/50")}
            >
              {rateLoading ? "Yoxlanılır..." : "Kursu yoxla"}
            </button>
            <button
              type="button"
              onClick={() => void saveExchangeSettings()}
              disabled={saving}
              className="surface-primary h-10 rounded-xl px-4 text-sm font-semibold"
            >
              Saxla
            </button>
          </div>
        </div>
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <div>
              <div className={cx("mb-2 text-sm font-semibold", subtle)}>Kurs mənbəyi</div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { id: "tcmb" as const, title: "TCMB", subtitle: "Türkiyə Mərkəzi Bankı" },
                  { id: "cbar" as const, title: "AMB / CBAR", subtitle: "Azərbaycan Mərkəzi Bankı" },
                  { id: "frankfurter" as const, title: "ECB", subtitle: "Frankfurter alternativ" },
                  { id: "manual" as const, title: "Manual", subtitle: "Kursu əllə yaz" },
                ].map((source) => {
                  const active = settings.exchangeSettings.source === source.id;
                  return (
                    <button
                      key={source.id}
                      type="button"
                      onClick={() => updateExchangeSettings({ source: source.id })}
                      className={cx(
                        "rounded-2xl border p-3 text-left transition",
                        active ? "border-indigo-400 bg-indigo-500/10 text-indigo-700 shadow-sm" : cx(border, "hover:bg-white/50")
                      )}
                    >
                      <div className="text-sm font-semibold">{source.title}</div>
                      <div className={cx("mt-1 text-xs", subtle)}>{source.subtitle}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            {settings.exchangeSettings.source === "tcmb" ? (
              <div>
                <div className={cx("mb-2 text-sm font-semibold", subtle)}>TCMB kurs tipi</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {[
                    { id: "banknote" as const, title: "Banknote / effektiv", subtitle: "Efektiv satış kursu, məsələn 46.4253" },
                    { id: "forex" as const, title: "Forex", subtitle: "Döviz satış kursu, məsələn 46.3557" },
                  ].map((rateType) => {
                    const active = settings.exchangeSettings.tcmbRateType === rateType.id;
                    return (
                      <button
                        key={rateType.id}
                        type="button"
                        onClick={() => updateExchangeSettings({ tcmbRateType: rateType.id })}
                        className={cx(
                          "rounded-2xl border p-3 text-left transition",
                          active ? "border-indigo-400 bg-indigo-500/10 text-indigo-700 shadow-sm" : cx(border, "hover:bg-white/50")
                        )}
                      >
                        <div className="text-sm font-semibold">{rateType.title}</div>
                        <div className={cx("mt-1 text-xs", subtle)}>{rateType.subtitle}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div>
              <div className={cx("mb-2 text-sm font-semibold", subtle)}>Sənəddə kurs günü</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {[
                  { id: "instant" as const, title: "Anlıq", subtitle: "Bugünkü kurs" },
                  { id: "previousDay" as const, title: "1 gün əvvəl", subtitle: "Standart sənəd kursu" },
                  { id: "twoDaysBefore" as const, title: "2 gün əvvəl", subtitle: "Gecikməli hesablama" },
                ].map((day) => {
                  const active = settings.exchangeSettings.documentRateDay === day.id;
                  return (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => updateExchangeSettings({ documentRateDay: day.id })}
                      className={cx(
                        "rounded-2xl border p-3 text-left transition",
                        active ? "border-indigo-400 bg-indigo-500/10 text-indigo-700 shadow-sm" : cx(border, "hover:bg-white/50")
                      )}
                    >
                      <div className="text-sm font-semibold">{day.title}</div>
                      <div className={cx("mt-1 text-xs", subtle)}>{day.subtitle}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[0.45fr_1fr]">
              <Field label="Baza valyuta">
                <select
                  className={input}
                  value={settings.exchangeSettings.baseCurrency}
                  onChange={(event) => updateExchangeSettings({ baseCurrency: event.target.value })}
                >
                  <option value="TRY">TRY</option>
                  <option value="AZN">AZN</option>
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                </select>
              </Field>
              <Field label="İzlənən valyutalar">
                <input
                  className={input}
                  value={settings.exchangeSettings.symbols.join(", ")}
                  onChange={(event) =>
                    updateExchangeSettings({
                      symbols: event.target.value
                        .split(",")
                        .map((symbol) => symbol.trim().toUpperCase())
                        .filter(Boolean),
                    })
                  }
                  placeholder="USD, EUR, AZN"
                />
              </Field>
            </div>
          </div>
          <div className={cx("rounded-2xl border p-4", border, card)}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">Kurs ön baxışı</div>
                <p className={cx("mt-1 text-xs", subtle)}>
                  {ratePreview ? `${ratePreview.sourceLabel} · ${ratePreview.date}` : "Yoxlama ilə real kurslar görünəcək."}
                </p>
              </div>
              <span className={cx("rounded-full px-3 py-1 text-xs font-semibold", settings.exchangeSettings.source === "manual" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700")}>
                {settings.exchangeSettings.source === "manual" ? "Manual" : "Online"}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {settings.exchangeSettings.symbols.map((symbol) => {
                const rate = settings.exchangeSettings.source === "manual"
                  ? settings.exchangeSettings.manualRates[symbol] ?? 0
                  : ratePreview?.rates?.[symbol] ?? 0;
                return (
                  <div key={symbol} className={cx("flex items-center gap-3 rounded-xl border px-3 py-2", border)}>
                    <div className="w-14 text-sm font-semibold">{symbol}</div>
                    {settings.exchangeSettings.source === "manual" ? (
                      <input
                        className={cx(input, "h-9 flex-1 text-right")}
                        value={settings.exchangeSettings.manualRates[symbol] ?? ""}
                        onChange={(event) => updateManualRate(symbol, event.target.value)}
                        placeholder="0.0000"
                      />
                    ) : (
                      <div className="flex-1 text-right text-sm font-semibold">
                        {rate ? rate.toLocaleString("tr-TR", { maximumFractionDigits: 4 }) : "-"}
                      </div>
                    )}
                    <div className={cx("text-xs", subtle)}>{settings.exchangeSettings.baseCurrency}</div>
                  </div>
                );
              })}
            </div>
            {rateMessage ? (
              <div className={cx("mt-3 text-sm", rateMessage.includes("alınmadı") || rateMessage.includes("saxlanmadı") ? "text-rose-600" : "text-emerald-600")}>
                {rateMessage}
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="mt-6">
        <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-lg font-semibold">Stok modeli</div>
            <p className={cx("text-sm", subtle)}>Firma tipinə görə stokun necə izlənəcəyini seçin.</p>
          </div>
          <span className={cx("text-xs", subtle)}>{saving ? "Saxlanılır..." : "Seçim avtomatik tətbiq olunur"}</span>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {stockModes.map((mode) => {
            const active = settings.stockMode === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                onClick={() => void saveStockMode(mode.id)}
                className={cx(
                  "rounded-2xl border p-4 text-left transition",
                  active
                    ? "border-indigo-400 bg-indigo-500/10 shadow-sm shadow-indigo-500/15"
                    : cx(border, "hover:bg-white/45")
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-base font-semibold">{mode.title}</div>
                    <p className={cx("mt-1 text-sm leading-5", subtle)}>{mode.subtitle}</p>
                  </div>
                  <span className={cx("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs", active ? "border-indigo-500 bg-indigo-600 text-white" : border)}>
                    {active ? "✓" : ""}
                  </span>
                </div>
                <div className="mt-4 grid gap-2">
                  {mode.points.map((point) => (
                    <div key={point} className={cx("flex items-center gap-2 text-sm", subtle)}>
                      <span className={cx("h-1.5 w-1.5 rounded-full", active ? "bg-indigo-500" : "bg-slate-400")} />
                      {point}
                    </div>
                  ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>
      <button type="button" className="surface-primary mt-6 h-11 rounded-xl px-6 text-sm font-semibold">Saxlamaq</button>
    </div>
  );
}

function EmployeesView({ border, card, soft, subtle, isDark }: { border: string; card: string; soft: string; subtle: string; isDark: boolean }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <CreateTile border={border} soft={soft} label="Əməkdaş yarat" />
      {employees.map((employee) => (
        <div key={employee.email} className={cx("overflow-hidden rounded-2xl border", border, card)}>
          <div className="flex items-start gap-4 p-4">
            <div className={cx("flex h-20 w-20 shrink-0 items-center justify-center rounded-full", toneClass(employee.tone, isDark))}>
              <I.User className="h-9 w-9" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xl font-semibold">{employee.name}</div>
              <div className={cx("mt-1 text-sm", subtle)}>{employee.role}</div>
            </div>
            <button type="button" className={cx("rounded-lg p-1", subtle)}><I.More className="h-5 w-5" /></button>
          </div>
          <div className={cx("space-y-2 border-t p-4 text-sm", border, soft)}>
            <div className="flex items-center gap-2 text-indigo-600"><I.Phone className="h-4 w-4" />{employee.phone}</div>
            <div className="flex items-center gap-2 text-indigo-600"><I.Mail className="h-4 w-4" />{employee.email}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function StoresView({ border, card, soft, subtle }: { border: string; card: string; soft: string; subtle: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <CreateTile border={border} soft={soft} label="Mağaza yarat" />
      {stores.map((store) => <StoreCard key={store.name} item={store} border={border} card={card} soft={soft} subtle={subtle} />)}
    </div>
  );
}

function AccountsView({ border, card, soft, subtle }: { border: string; card: string; soft: string; subtle: string }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <CreateTile border={border} soft={soft} label="Hesab yarat" />
      {accounts.map((account) => <StoreCard key={`${account.type}-${account.name}`} item={account} border={border} card={card} soft={soft} subtle={subtle} />)}
    </div>
  );
}

function LoyaltyView({ border, card, soft, subtle }: { border: string; card: string; soft: string; subtle: string }) {
  const rules = ["Müştəri qrupu üzrə endirim", "Bonus yığım faizi", "Kart səviyyələri", "Doğum günü kuponu"];
  return (
    <div className={cx("rounded-2xl border p-4", border, card)}>
      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <div className={cx("rounded-2xl border p-4", border, soft)}>
          <div className="text-lg font-semibold">Endirim sistemi</div>
          <p className={cx("mt-1 text-sm", subtle)}>Satış zamanı avtomatik endirim və kampaniya qaydaları.</p>
          <button type="button" className="mt-4 h-10 rounded-xl border border-emerald-400 px-4 text-sm font-semibold text-emerald-600">Aktiv et</button>
        </div>
        <div className={cx("rounded-2xl border p-4", border, soft)}>
          <div className="text-lg font-semibold">Bonus sistemi</div>
          <p className={cx("mt-1 text-sm", subtle)}>Hər alışdan bonus hesabına faiz köçürmə.</p>
          <button type="button" className="mt-4 h-10 rounded-xl border border-indigo-400 px-4 text-sm font-semibold text-indigo-600">Qayda yarat</button>
        </div>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {rules.map((rule) => (
          <div key={rule} className={cx("flex items-center justify-between rounded-xl border px-3 py-3", border, soft)}>
            <span className="text-sm font-medium">{rule}</span>
            <span className={cx("text-xs", subtle)}>Hazırlanır</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PrintFormsView({
  border,
  card,
  soft,
  subtle,
  input,
  isDark,
}: {
  border: string;
  card: string;
  soft: string;
  subtle: string;
  input: string;
  isDark: boolean;
}) {
  const [settings, setSettings] = useState<PrintSettings>(defaultPrintSettings);
  const [selected, setSelected] = useState<PrintFormKey>("customs");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const activeForm = settings.forms[selected];

  useEffect(() => {
    let alive = true;
    requestJson<{ data: CompanySettings }>("/api/company-settings")
      .then((payload) => {
        if (alive) setSettings(mergePrintSettings(payload.data?.printSettings));
      })
      .catch(() => {
        if (alive) setMessage("Parametrlər yüklənmədi. Standart şablon göstərilir.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const updateForm = (patch: Partial<typeof activeForm>) => {
    setSettings((current) => ({
      ...current,
      forms: {
        ...current.forms,
        [selected]: { ...current.forms[selected], ...patch },
      },
    }));
    setMessage("");
  };

  const save = async () => {
    setSaving(true);
    setMessage("");
    try {
      const payload = await requestJson<{ data: CompanySettings }>("/api/company-settings", {
        method: "PATCH",
        body: JSON.stringify({ printSettings: settings }),
      });
      const next = mergePrintSettings(payload.data?.printSettings);
      setSettings(next);
      window.dispatchEvent(new CustomEvent("arix:company-settings-updated", { detail: payload.data }));
      window.dispatchEvent(new CustomEvent("arix:print-settings-updated", { detail: next }));
      setMessage("Çap forması saxlanıldı.");
    } catch {
      setMessage("Saxlama zamanı xəta baş verdi.");
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setMessage("");
    try {
      const companyLogo = await prepareCompanyLogo(file);
      if (companyLogo.length > 850_000) {
        setMessage("Loqo faylı çox böyükdür. Daha yığcam şəkil seçin.");
        return;
      }
      setSettings((current) => ({ ...current, companyLogo }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Loqo yüklənmədi.");
    }
  };

  return (
    <div className={cx("overflow-hidden rounded-2xl border", border, card)}>
      <div className={cx("flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between", border)}>
        <div>
          <h2 className="text-lg font-semibold">Vahid çap dizaynı</h2>
          <p className={cx("mt-1 text-sm", subtle)}>Sənəd başlığını, aşağı qeydi və görünən məlumatları idarə edin.</p>
        </div>
        <button type="button" onClick={() => void save()} disabled={saving} className={cx("surface-primary h-11 rounded-xl px-5 text-sm font-semibold", saving && "opacity-60")}>
          {saving ? "Saxlanılır..." : "Dəyişiklikləri saxla"}
        </button>
      </div>

      <div className="grid min-h-[680px] lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className={cx("border-b p-3 lg:border-b-0 lg:border-r", border)}>
          <div className="space-y-5">
            {printGroups.map((group) => (
              <div key={group.title}>
                <div className={cx("mb-2 px-2 text-xs font-semibold", subtle)}>{group.title}</div>
                <div className="space-y-1">
                  {group.forms.map((form) => {
                    const active = selected === form.key;
                    return (
                      <button
                        key={form.key}
                        type="button"
                        onClick={() => setSelected(form.key)}
                        className={cx(
                          "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition",
                          active ? "surface-nav-active text-indigo-700" : isDark ? "hover:bg-white/5" : "hover:bg-slate-50"
                        )}
                      >
                        <I.File className={cx("mt-0.5 h-5 w-5 shrink-0", active ? "text-indigo-600" : subtle)} />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">{form.label}</span>
                          <span className={cx("mt-0.5 block text-xs leading-4", active ? "text-indigo-500" : subtle)}>{form.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="min-w-0 p-4 lg:p-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <div className="space-y-5">
              <section>
                <div className="mb-3">
                  <h3 className="text-base font-semibold">Brend məlumatları</h3>
                  <p className={cx("mt-1 text-sm", subtle)}>Bu məlumatlar bütün çap formalarında ortaq istifadə olunur.</p>
                </div>
                <div className={cx("mb-3 flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center", border, soft)}>
                  <div className="flex h-16 w-36 shrink-0 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-2">
                    {settings.companyLogo ? (
                      <img src={settings.companyLogo} alt="Şirkət loqosu" className="max-h-full max-w-full object-contain" />
                    ) : (
                      <div className="flex items-center gap-2 text-slate-500">
                        <AriXLogo className="h-8 w-8" />
                        <span className="text-xs font-semibold">Standart AriX</span>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold">Şirkət loqosu</div>
                    <p className={cx("mt-1 text-xs", subtle)}>PNG, JPG və ya WebP. Loqo sənədlərin başlığında görünəcək.</p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <label className="surface-primary inline-flex h-10 cursor-pointer items-center rounded-xl px-4 text-sm font-semibold">
                      {settings.companyLogo ? "Dəyiş" : "Loqo yüklə"}
                      <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void uploadLogo(event)} />
                    </label>
                    {settings.companyLogo && (
                      <button type="button" onClick={() => setSettings((current) => ({ ...current, companyLogo: "" }))} className="h-10 rounded-xl border border-rose-300 px-3 text-sm font-semibold text-rose-600">
                        Sil
                      </button>
                    )}
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Şirkət adı">
                    <input value={settings.companyName} onChange={(event) => setSettings((current) => ({ ...current, companyName: event.target.value }))} className={input} />
                  </Field>
                  <Field label="Loqo alt yazısı">
                    <input value={settings.brandSubtitle} onChange={(event) => setSettings((current) => ({ ...current, brandSubtitle: event.target.value }))} className={input} />
                  </Field>
                </div>
              </section>

              <section className={cx("border-t pt-5", border)}>
                <div className="mb-3">
                  <h3 className="text-base font-semibold">{printGroups.flatMap((group) => group.forms).find((form) => form.key === selected)?.label}</h3>
                  <p className={cx("mt-1 text-sm", subtle)}>Bu sahələr yalnız seçilmiş sənəd növünə tətbiq olunur.</p>
                </div>
                <div className="grid gap-3">
                  <Field label="Sənəd başlığı">
                    <input value={activeForm.title} onChange={(event) => updateForm({ title: event.target.value })} className={input} />
                  </Field>
                  <Field label="Başlıq altında açıqlama">
                    <input value={activeForm.subtitle} onChange={(event) => updateForm({ subtitle: event.target.value })} className={input} />
                  </Field>
                  <Field label="Aşağı hissədə qısa məlumat">
                    <input value={activeForm.footerInfo} onChange={(event) => updateForm({ footerInfo: event.target.value })} className={input} placeholder="Telefon · e-poçt · sayt və ya vergi məlumatı" />
                  </Field>
                  <Field label="Sənəd alt qeydi">
                    <textarea
                      value={activeForm.footerNote}
                      onChange={(event) => updateForm({ footerNote: event.target.value })}
                      className={cx(input, "min-h-28 resize-y py-3")}
                      placeholder="Şərtlər, hüquqi qeyd, çatdırılma məlumatı və ya imza qeydi..."
                    />
                  </Field>
                </div>
              </section>

              <section className={cx("border-t pt-5", border)}>
                <h3 className="mb-3 text-base font-semibold">Görünüş</h3>
                <div className="grid gap-2 sm:grid-cols-3">
                  <PrintToggle label="Ortada şirkət loqosu" checked={activeForm.showLogo} onChange={(checked) => updateForm({ showLogo: checked })} border={border} soft={soft} />
                  <PrintToggle label="Sənəd məlumatları" checked={activeForm.showMeta} onChange={(checked) => updateForm({ showMeta: checked })} border={border} soft={soft} />
                  <PrintToggle label="Aşağı hissə" checked={activeForm.showFooter} onChange={(checked) => updateForm({ showFooter: checked })} border={border} soft={soft} />
                </div>
                <p className={cx("mt-2 text-xs", subtle)}>
                  AriX loqosu solda sabit qalır. Yüklənmiş şirkət loqosu sənəd başlığının ortasında göstərilir.
                </p>
              </section>
              {message && <div className={cx("rounded-xl border px-3 py-2 text-sm", border, message.includes("xəta") ? "text-rose-600" : "text-emerald-600")}>{message}</div>}
            </div>

            <PrintFormPreview settings={settings} form={activeForm} subtle={subtle} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PrintToggle({ label, checked, onChange, border, soft }: { label: string; checked: boolean; onChange: (checked: boolean) => void; border: string; soft: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={cx("flex h-11 items-center justify-between rounded-xl border px-3 text-sm font-semibold", border, soft)}>
      {label}
      <span className={cx("flex h-5 w-9 items-center rounded-full p-0.5 transition", checked ? "bg-indigo-600" : "bg-slate-300")}>
        <span className={cx("h-4 w-4 rounded-full bg-white transition", checked && "translate-x-4")} />
      </span>
    </button>
  );
}

function PrintFormPreview({ settings, form, subtle }: { settings: PrintSettings; form: PrintSettings["forms"][PrintFormKey]; subtle: string }) {
  return (
    <aside className="xl:sticky xl:top-4 xl:self-start">
      <div className={cx("mb-2 text-xs font-semibold", subtle)}>Canlı önizləmə</div>
      <div className="flex aspect-[1/1.414] flex-col overflow-hidden rounded-xl border bg-white p-5 text-slate-800 shadow-sm">
        <div className="grid grid-cols-3 items-start gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <AriXLogo className="h-9 w-9" />
            <div>
              <div className="text-base font-semibold">AriX</div>
              <div className="text-[8px] text-slate-500">Sənəd sistemi</div>
            </div>
          </div>
          <div className="flex min-h-9 items-center justify-center">
            {form.showLogo && settings.companyLogo && <img src={settings.companyLogo} alt="" className="h-9 max-w-24 object-contain" />}
          </div>
          <div className="text-right">
            <div className="text-[8px] font-semibold text-indigo-600">AriX sənəd sistemi</div>
            <div className="mt-1 text-sm font-semibold">{form.title || "Sənəd başlığı"}</div>
            <div className="mt-1 text-[8px] text-slate-500">{form.subtitle}</div>
          </div>
        </div>
        {form.showMeta && (
          <div className="mt-3 grid grid-cols-4 overflow-hidden rounded-md border border-slate-200 bg-slate-50 text-[7px]">
            {["Sənəd", "Tarix", "Status", "Mənbə"].map((label) => <div key={label} className="border-r border-slate-200 px-2 py-2 last:border-r-0"><span className="text-slate-400">{label}</span><strong className="mt-1 block font-semibold">Məlumat</strong></div>)}
          </div>
        )}
        <div className="mt-5 flex items-center gap-2 text-[8px] font-semibold"><span>Məhsullar</span><span className="h-px flex-1 bg-slate-200" /></div>
        <div className="mt-2 overflow-hidden border border-slate-200 text-[7px]">
          <div className="grid grid-cols-[1.6fr_.6fr_.6fr_.7fr] bg-slate-50 font-semibold text-slate-500"><span className="border-r border-slate-200 p-2">Ad</span><span className="border-r border-slate-200 p-2">Miqdar</span><span className="border-r border-slate-200 p-2">Qiymət</span><span className="p-2">Ümumi</span></div>
          {[1, 2, 3, 4].map((row) => <div key={row} className="grid grid-cols-[1.6fr_.6fr_.6fr_.7fr] border-t border-slate-200"><span className="border-r border-slate-200 p-2">Məhsul {row}</span><span className="border-r border-slate-200 p-2 text-right">100</span><span className="border-r border-slate-200 p-2 text-right">2.50</span><span className="p-2 text-right">250.00</span></div>)}
        </div>
        <div className="mt-auto pt-8">
          {form.showFooter && (
            <>
              <div className="flex justify-between border-t border-slate-200 pt-2 text-[7px] text-slate-500">
                <span><strong className="text-indigo-600">{settings.companyName || "AriX"}</strong>{form.footerInfo ? ` · ${form.footerInfo}` : ""}</span>
                <span>Sənəd №</span>
              </div>
              {form.footerNote && <div className="mt-1 whitespace-pre-line text-[7px] leading-3 text-slate-500">{form.footerNote}</div>}
            </>
          )}
        </div>
      </div>
    </aside>
  );
}

function StoreCard({ item, border, card, soft, subtle }: { item: { name: string; type: string; date: string; balance?: string; status?: string }; border: string; card: string; soft: string; subtle: string }) {
  return (
    <div className={cx("overflow-hidden rounded-2xl border", border, card)}>
      <div className={cx("border-b px-4 py-3 text-sm font-semibold", border, soft)}>{item.type}</div>
      <div className="flex items-start gap-4 p-5">
        <div className={cx("flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl", soft)}>
          {item.type.includes("Kassa") ? <I.Wallet className="h-9 w-9 text-slate-400" /> : <I.Building className="h-9 w-9 text-slate-400" />}
        </div>
        <div className="min-w-0">
          <div className="truncate text-xl font-semibold text-indigo-600">{item.name}</div>
          <div className={cx("mt-1 text-sm", subtle)}>Yaradıldı {item.date}</div>
          {item.balance && <div className={cx("mt-1 text-sm", subtle)}>Balans {item.balance}</div>}
        </div>
      </div>
      <div className={cx("grid grid-cols-[1fr_72px] border-t p-3", border, soft)}>
        <button type="button" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-emerald-400 text-sm font-semibold text-emerald-600"><I.Edit className="h-4 w-4" />Redaktə</button>
        <button type="button" className="ml-2 inline-flex h-10 items-center justify-center rounded-xl border border-rose-400 text-rose-600"><I.Trash className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

function CreateTile({ border, soft, label }: { border: string; soft: string; label: string }) {
  return (
    <button type="button" className={cx("flex min-h-[190px] items-center justify-center rounded-2xl border border-dashed transition hover:border-indigo-300", border, soft)}>
      <span className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-white/60 px-4 py-3 text-sm font-semibold text-indigo-600">
        <I.Plus className="h-4 w-4" />
        {label}
      </span>
    </button>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={cx("block", className)}>
      <span className="mb-1 block text-sm font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}
