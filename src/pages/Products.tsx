import React, { useEffect, useMemo, useRef, useState } from "react";

/* ------------------------------ helpers ------------------------------ */
const cx = (...s: (string | false | undefined)[]) => s.filter(Boolean).join(" ");
const toNum = (n?: number) => (n == null ? "—" : n.toLocaleString("az-Latn-AZ"));
const toCurrency = (n?: number) =>
  n == null ? "—" : n.toLocaleString("az-Latn-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ------------------------------ Panel rəng tokenləri ------------------------------ */
// Dashboard-dakı panel fonunu buradan idarə edirik. İstəsən rəngi dəyiş, hamısı avtomatik uyğunlaşacaq.
const PANEL_DARK_BG    = 'bg-slate-800';    // əsas panel fonu (Dashboard-la eyni ton)
const PANEL_DARK_BG_80 = 'bg-slate-800/80'; // sticky header üçün şəffaf variant
const PANEL_DARK_SOFT  = 'bg-slate-900/40';    // input / iç qutular üçün bir az açıq ton

/* ------------------------------ UI tokens ------------------------------ */
const makeUI = (isDark: boolean) => ({
  // Bütün panellər (action bar, breadcrumb, cədvəl qabığı)
  card: `rounded-2xl shadow-sm border ${isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200/70"}`,

  // Düymələr
  iconBtn: `w-10 h-10 rounded-xl flex items-center justify-center ${
    isDark ? "hover:bg-white/5" : "hover:bg-slate-100"
  }`,
  iconBtnDisabled: "opacity-50 cursor-not-allowed",

  // Input-lar
  input: [
    "w-full h-10 px-3 rounded-xl border outline-none placeholder-slate-400",
    isDark
      ? `${PANEL_DARK_SOFT} border-white/10 text-slate-100 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40`
      : "bg-white border-slate-200 text-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/40",
  ].join(" "),

  // Cədvəl header fonu
  theadSticky: `sticky top-0 z-10 ${isDark ? "bg-slate-800/80" : "bg-white/80"} backdrop-blur`,
  headerRow: `${isDark ? "text-slate-300 border-b border-slate-700" : "text-slate-600 border-b border-slate-200"}`,
  rowHover: isDark ? "hover:bg-white/5" : "hover:bg-slate-50",
  rowDivider: isDark ? "border-t border-slate-700" : "border-t border-slate-200",

  chip: isDark
    ? "h-10 inline-flex items-center gap-2 px-3 rounded-full border bg-indigo-500/10 border-indigo-700/40 text-indigo-300"
    : "h-10 inline-flex items-center gap-2 px-3 rounded-full border bg-indigo-50 border-indigo-200 text-indigo-700",

  textSubtle: isDark ? "text-slate-400" : "text-slate-500",
  crumbBtn:   isDark ? "text-slate-300 hover:text-slate-100" : "text-slate-600 hover:text-slate-800",
  crumbRoot:  isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700",

  borderSoft: isDark ? "border-white/10" : "border-slate-200",
  iconColor:  isDark ? "text-slate-200" : "text-slate-700",

  // Kiçik ikon qutuları (folder/photo)
  softBox: isDark ? `${PANEL_DARK_SOFT} ring-1 ring-inset ring-white/10` : "bg-slate-50 ring-1 ring-inset ring-slate-200",
});

/* ------------------------------ icons ------------------------------ */
const I = {
  Search: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="11" cy="11" r="7" /><path d="M21 21l-3.5-3.5" />
    </svg>
  ),
  Filter: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 5h18" /><path d="M7 12h10" /><path d="M10 19h4" />
    </svg>
  ),
  Plus: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Dots: (p: any) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>),
  Cog: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 8a4 4 0 100 8 4 4 0 000-8z" />
      <path d="M2 12h2M20 12h2M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
    </svg>
  ),
  Trash: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    </svg>
  ),
  Download: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3v12" /><path d="M8 11l4 4 4-4" /><path d="M21 21H3" />
    </svg>
  ),
  Folder: (p: any) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    </svg>
  ),
  ChevronR: (p: any) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 6l6 6-6 6"/></svg>),
};

/* ------------------------------ demo data ------------------------------ */
type ProductType = "product" | "service" | "bundle";
type Product = {
  id: number;
  type: ProductType;
  ad: string;
  groupId: number | null;    // qovluq id-si (null = root)
  kod?: string;
  artikel?: string;
  vahid?: string;
  sale_price?: number;
  cost?: number;
  purchase_price?: number;
  antrepo?: number;
  depo?: number;
};
type Group = { id: number; name: string; parentId: number | null };

const DEMO_GROUPS: Group[] = [
  { id: 1, name: "Parlaq rənglər", parentId: null },
  { id: 2, name: "Mat rənglər", parentId: null },
  { id: 3, name: "Metalik", parentId: 1 },
];

const DEMO_ROWS: Product[] = [
  { id: 1, type: "product", ad: "Soft Touch Kubanit Göy", groupId: 1, kod: "00146", artikel: "ANT-ERSA 517", vahid: "mt", antrepo: 485, depo: 0, sale_price: 11.9 },
  { id: 2, type: "product", ad: "Soft Touch Kubanit Gri", groupId: 2, kod: "00180", artikel: "ERSA 517", vahid: "mt", antrepo: 756, depo: 0, sale_price: 12.5 },
  { id: 3, type: "product", ad: "HG Füme", groupId: null, kod: "00204", artikel: "ERSA C1311", vahid: "mt", antrepo: 0, depo: 0, sale_price: 10.1 },
  { id: 4, type: "product", ad: "Metal Night Blue", groupId: 3, kod: "00311", artikel: "ERSA M200", vahid: "mt", antrepo: 80, depo: 20, sale_price: 14.2 },
];

/* ------------------------------ columns/params ------------------------------ */
type ColId =
  | "foto" | "kod" | "artikel" | "vahid"
  | "sale_price" | "cost" | "purchase_price"
  | "antrepo" | "depo";

type ColSettings = Record<ColId, boolean>;

const DEFAULT_COLS: ColSettings = {
  foto: true, kod: true, artikel: true, vahid: true,
  sale_price: false, cost: false, purchase_price: false,
  antrepo: true, depo: true,
};

type RowDensity = "comfortable" | "compact";
type SearchScope = "current" | "all";

type ViewSettings = { density: RowDensity; stickyHeader: boolean; zebra: boolean; };
type NavSettings = { foldersEnabled: boolean };
type SearchSettings = { scope: SearchScope };

const STORAGE = {
  cols: "arix.products.cols.v2",
  view: "arix.products.view.v1",
  nav: "arix.products.nav.v1",
  search: "arix.products.search.v1",
  filters: "arix.products.filters.v1",
  folder: "arix.products.currentFolder.v1",
};

const DEFAULT_VIEW: ViewSettings = { density: "comfortable", stickyHeader: true, zebra: false };
const DEFAULT_NAV: NavSettings = { foldersEnabled: true };
const DEFAULT_SEARCH: SearchSettings = { scope: "current" };

/* ------------------------------ filters ------------------------------ */
type StockOp = "gt" | "lt" | "eq";
type Filters = {
  types: { product: boolean; service: boolean; bundle: boolean };
  category: string | null;
  stock?: { place: "total" | "antrepo" | "depo"; op: StockOp; qty: number }[];
  price?: { level: "esas"; min?: number; max?: number };
};
const FILTERS_DEFAULT: Filters = {
  types: { product: true, service: true, bundle: true },
  category: null,
  stock: [],
  price: { level: "esas" },
};

/* ------------------------------ main component ------------------------------ */
export default function Products({ isDark = false }: { isDark?: boolean }) {
  const ui = makeUI(isDark);

  /* data */
  const [groups] = useState<Group[]>(DEMO_GROUPS);
  const [rows] = useState<Product[]>(DEMO_ROWS);

  /* state */
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [cols, setCols] = useState<ColSettings>(() => {
    try { const raw = localStorage.getItem(STORAGE.cols); return raw ? { ...DEFAULT_COLS, ...JSON.parse(raw) } : DEFAULT_COLS; }
    catch { return DEFAULT_COLS; }
  });
  const [view, setView] = useState<ViewSettings>(() => {
    try { const raw = localStorage.getItem(STORAGE.view); return raw ? { ...DEFAULT_VIEW, ...JSON.parse(raw) } : DEFAULT_VIEW; }
    catch { return DEFAULT_VIEW; }
  });
  const [nav, setNav] = useState<NavSettings>(() => {
    try { const raw = localStorage.getItem(STORAGE.nav); return raw ? { ...DEFAULT_NAV, ...JSON.parse(raw) } : DEFAULT_NAV; }
    catch { return DEFAULT_NAV; }
  });
  const [searchSet, setSearchSet] = useState<SearchSettings>(() => {
    try { const raw = localStorage.getItem(STORAGE.search); return raw ? { ...DEFAULT_SEARCH, ...JSON.parse(raw) } : DEFAULT_SEARCH; }
    catch { return DEFAULT_SEARCH; }
  });
  const [filters, setFilters] = useState<Filters>(() => {
    try { const raw = localStorage.getItem(STORAGE.filters); return raw ? { ...FILTERS_DEFAULT, ...JSON.parse(raw) } : FILTERS_DEFAULT; }
    catch { return FILTERS_DEFAULT; }
  });
  const [currentFolder, setCurrentFolder] = useState<number | null>(() => {
    try { const raw = localStorage.getItem(STORAGE.folder); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  });

  /* persist */
  useEffect(() => { try { localStorage.setItem(STORAGE.cols, JSON.stringify(cols)); } catch {} }, [cols]);
  useEffect(() => { try { localStorage.setItem(STORAGE.view, JSON.stringify(view)); } catch {} }, [view]);
  useEffect(() => { try { localStorage.setItem(STORAGE.nav, JSON.stringify(nav)); } catch {} }, [nav]);
  useEffect(() => { try { localStorage.setItem(STORAGE.search, JSON.stringify(searchSet)); } catch {} }, [searchSet]);
  useEffect(() => { try { localStorage.setItem(STORAGE.filters, JSON.stringify(filters)); } catch {} }, [filters]);
  useEffect(() => { try { localStorage.setItem(STORAGE.folder, JSON.stringify(currentFolder)); } catch {} }, [currentFolder]);

  /* visibility */
  const canSeeCosts = true;
  const colVisible = (id: ColId) => cols[id] && (canSeeCosts || (id !== "cost" && id !== "purchase_price"));

  /* filtering */
  const filterByQ = (list: Product[]) =>
    list.filter((r) => (r.ad + " " + (r.kod ?? "") + " " + (r.artikel ?? "")).toLowerCase().includes(q.toLowerCase()));

  const filteredAll = useMemo(() => {
    let items = filterByQ(rows);
    // types
    items = items.filter((r) => {
      if (r.type === "product" && !filters.types.product) return false;
      if (r.type === "service" && !filters.types.service) return false;
      if (r.type === "bundle" && !filters.types.bundle) return false;
      return true;
    });
    // stock
    if (filters.stock && filters.stock.length) {
      items = items.filter((r) =>
        filters.stock!.every((s) => {
          const v = s.place === "antrepo" ? r.antrepo ?? 0 : s.place === "depo" ? r.depo ?? 0 : (r.antrepo ?? 0) + (r.depo ?? 0);
          if (s.op === "gt") return v > s.qty;
          if (s.op === "lt") return v < s.qty;
          return v === s.qty;
        })
      );
    }
    // price (esas -> sale_price)
    if ((filters.price?.min ?? null) != null) items = items.filter((r) => (r.sale_price ?? 0) >= (filters.price!.min as number));
    if ((filters.price?.max ?? null) != null) items = items.filter((r) => (r.sale_price ?? 0) <= (filters.price!.max as number));
    return items;
  }, [rows, q, filters]);

  /* folder logic */
  const childGroups = useMemo(() => groups.filter((g) => g.parentId === currentFolder), [groups, currentFolder]);

  const visibleProducts: Product[] = useMemo(() => {
    if (!nav.foldersEnabled) return filteredAll;
    if (searchSet.scope === "all") return filteredAll;
    return filteredAll.filter((r) => r.groupId === currentFolder);
  }, [filteredAll, nav.foldersEnabled, searchSet.scope, currentFolder]);

  /* selection */
  const toggleRow = (id: number) =>
    setSelected((prev) => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const clearSelection = () => setSelected(new Set());
  const headerAllChecked = visibleProducts.length > 0 && visibleProducts.every((r) => selected.has(r.id));

  /* breadcrumbs */
  const crumbs = useMemo(() => {
    const list: Group[] = [];
    let id = currentFolder;
    while (id != null) {
      const g = groups.find((x) => x.id === id);
      if (!g) break;
      list.unshift(g);
      id = g.parentId;
    }
    return list;
  }, [groups, currentFolder]);

  /* filter panel popover */
  const [showFilter, setShowFilter] = useState(false);
  const filterRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => { if (filterRef.current && !filterRef.current.contains(e.target as Node)) setShowFilter(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") setShowFilter(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onEsc); };
  }, []);

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (!filters.types.product || !filters.types.service || !filters.types.bundle) n++;
    if (filters.category) n++;
    n += filters.stock?.length ? filters.stock.length : 0;
    if ((filters.price?.min ?? null) != null || (filters.price?.max ?? null) != null) n++;
    return n;
  }, [filters]);

  /* menus */
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const [colsOpen, setColsOpen] = useState(false);
  const colsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (moreRef.current && !moreRef.current.contains(t)) setMoreOpen(false);
      if (colsRef.current && !colsRef.current.contains(t)) setColsOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") { setMoreOpen(false); setColsOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onEsc); };
  }, []);

  /* ui helpers */
  const rowPad = view.density === "compact" ? "py-1.5" : "py-2.5";

  /* ------------------------------ render ------------------------------ */
  return (
    <div className="space-y-3">
      {/* ACTION BAR */}
      <div className={cx("p-3 flex flex-wrap items-center gap-2", ui.card, ui.ring)}>
        {/* search + filter */}
        <div className="flex items-center gap-2 flex-1 min-w-[260px]">
          <div ref={filterRef} className="relative w-[360px] max-w-full">
            <I.Search className="absolute left-2 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="axtarış…"
              className={cx(ui.input, "pl-8 pr-12")}
            />
            <button
              onClick={() => setShowFilter((v) => !v)}
              className={cx("absolute right-1 top-1/2 -translate-y-1/2 w-10 h-8 rounded-lg flex items-center justify-center",
                            isDark ? "hover:bg-white/5" : "hover:bg-slate-100")}
              title="Filtrlər"
              aria-expanded={showFilter}
              aria-haspopup="menu"
            >
              <I.Filter className="h-5 w-5 text-slate-500" />
              {activeFilterCount > 0 && (
                <span className="absolute -top-1 -right-1 text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-600 text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>

            {/* filter panel */}
            {showFilter && (
              <div className={cx("absolute z-30 mt-2 w-[540px] max-w-[90vw] rounded-xl shadow-lg p-3", ui.card, ui.ring)}>
                <div className="text-sm font-semibold mb-2">Filtrlər</div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  {["product","service","bundle"].map((t) => (
                    <label key={t} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={(filters.types as any)[t as ProductType]}
                        onChange={(e) => setFilters((f)=>({...f, types:{...f.types, [t]: e.target.checked}}))}
                      />
                      <span>{t==="product"?"Məhsul":t==="service"?"Xidmət":"Dəst"}</span>
                    </label>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <div className={cx("text-xs mb-1", ui.textSubtle)}>Qiymət səviyyəsi</div>
                    <select
                      value={filters.price?.level ?? "esas"}
                      onChange={(e)=>setFilters((f)=>({...f, price:{...f.price, level: e.target.value as any}}))}
                      className={ui.input}
                    >
                      <option value="esas">əsas</option>
                      <option value="topdan">topdan</option>
                      <option value="perakende">pərakəndə</option>
                    </select>
                  </div>
                  <div>
                    <div className={cx("text-xs mb-1", ui.textSubtle)}>Min</div>
                    <input
                      type="number"
                      value={filters.price?.min ?? ""}
                      onChange={(e)=>setFilters((f)=>({...f, price:{...f.price, min: e.target.value?Number(e.target.value):undefined}}))}
                      className={ui.input}
                    />
                  </div>
                  <div>
                    <div className={cx("text-xs mb-1", ui.textSubtle)}>Max</div>
                    <input
                      type="number"
                      value={filters.price?.max ?? ""}
                      onChange={(e)=>setFilters((f)=>({...f, price:{...f.price, max: e.target.value?Number(e.target.value):undefined}}))}
                      className={ui.input}
                    />
                  </div>
                </div>

                <div className="mb-2">
                  <div className={cx("text-xs mb-2", ui.textSubtle)}>Qalıqlar (şərtlər)</div>
                  {(filters.stock ?? []).map((s, idx)=>(
                    <div key={idx} className="grid grid-cols-3 gap-3 mb-2">
                      <select
                        value={s.place}
                        onChange={(e)=>setFilters((f)=>{const arr=[...(f.stock??[])]; arr[idx]={...arr[idx], place: e.target.value as any}; return {...f, stock: arr};})}
                        className={ui.input}
                      >
                        <option value="total">ümumi</option>
                        <option value="antrepo">ERSA ANTREPO</option>
                        <option value="depo">ERSA DEPO</option>
                      </select>
                      <select
                        value={s.op}
                        onChange={(e)=>setFilters((f)=>{const arr=[...(f.stock??[])]; arr[idx]={...arr[idx], op: e.target.value as StockOp}; return {...f, stock: arr};})}
                        className={ui.input}
                      >
                        <option value="gt">daha çox</option>
                        <option value="lt">daha az</option>
                        <option value="eq">bərabər</option>
                      </select>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          value={s.qty}
                          onChange={(e)=>setFilters((f)=>{const arr=[...(f.stock??[])]; arr[idx]={...arr[idx], qty: Number(e.target.value||0)}; return {...f, stock: arr};})}
                          className={cx("flex-1", ui.input)}
                        />
                        <button
                          onClick={()=>setFilters((f)=>{const arr=[...(f.stock??[])]; arr.splice(idx,1); return {...f, stock: arr};})}
                          className={cx("w-10 h-10 rounded-lg border", ui.borderSoft, isDark ? "hover:bg-white/5" : "hover:bg-red-50")}
                          title="Şərti sil"
                        >✕</button>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={()=>setFilters((f)=>({...f, stock:[...(f.stock??[]), {place:"total", op:"gt" as StockOp, qty:0}]}))}
                    className={cx("px-3 h-9 rounded-lg text-sm border", ui.borderSoft, isDark ? "hover:bg-white/5" : "hover:bg-slate-100")}
                  >+ Şərt əlavə et</button>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <button onClick={()=>setShowFilter(false)} className={cx("px-4 h-9 rounded-lg text-sm", isDark ? "hover:bg-white/5" : "hover:bg-slate-100")}>Bağla</button>
                  <div className="flex gap-2">
                    <button onClick={()=>setFilters(FILTERS_DEFAULT)} className={cx("px-3 h-9 rounded-lg text-sm border", ui.borderSoft, isDark ? "hover:bg-white/5" : "hover:bg-slate-100")}>Sıfırla</button>
                    <button onClick={()=>setShowFilter(false)} className="px-3 h-9 rounded-lg text-white text-sm bg-indigo-600 hover:bg-indigo-500">Tətbiq et</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* selected chip */}
          {selected.size > 0 && (
            <div className={ui.chip}>
              <strong className="tabular-nums">{selected.size}</strong> məhsul seçilib
              <button onClick={clearSelection} className="ml-1 text-sm opacity-70 hover:opacity-100">Təmizlə</button>
            </div>
          )}
        </div>

        {/* right actions */}
        <div className="flex items-center gap-2">
          <button className="px-3 h-10 rounded-xl inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white">
            <I.Plus className="h-4 w-4" /> Məhsul yaratmaq
          </button>

          <button title="Sil" disabled={selected.size===0} className={cx(ui.iconBtn, selected.size===0 && ui.iconBtnDisabled)}>
            <I.Trash className={cx("h-5 w-5", ui.iconColor)} />
          </button>

          <button title="İxrac" className={ui.iconBtn}>
            <I.Download className={cx("h-5 w-5", ui.iconColor)} />
          </button>

          {/* overflow */}
          <div ref={moreRef} className="relative">
            <button
              onClick={()=>setMoreOpen((v)=>!v)}
              className={ui.iconBtn}
              title="Fəaliyyətlər"
              aria-haspopup="menu"
              aria-expanded={moreOpen}
            >
              <I.Dots className={cx("h-5 w-5", ui.iconColor)} />
            </button>
            {moreOpen && <OverflowMenu onClose={()=>setMoreOpen(false)} selectedCount={selected.size} isDark={isDark} />}
          </div>

          {/* settings */}
          <div ref={colsRef} className="relative">
            <button
              onClick={()=>setColsOpen((v)=>!v)}
              className={ui.iconBtn}
              title="Cədvəl parametrləri"
              aria-expanded={colsOpen}
            >
              <I.Cog className={cx("h-5 w-5", ui.iconColor)} />
            </button>
            {colsOpen && (
              <ParamsPanel
                cols={cols}
                setCols={setCols}
                view={view}
                setView={setView}
                nav={nav}
                setNav={setNav}
                searchSet={searchSet}
                setSearchSet={setSearchSet}
                onResetAll={()=>{
                  setCols(DEFAULT_COLS);
                  setView(DEFAULT_VIEW);
                  setNav(DEFAULT_NAV);
                  setSearchSet(DEFAULT_SEARCH);
                }}
                onResetCols={()=>setCols(DEFAULT_COLS)}
                isDark={isDark}
              />
            )}
          </div>
        </div>
      </div>

      {/* BREADCRUMB PANEL — sabit yer: axtarış panelinin altında */}
      <div className="mt-2">
        <div
          className={cx(
            "p-2 rounded-2xl flex items-center justify-between",
            "min-h-[44px]",
            ui.card, ui.ring,
            nav.foldersEnabled ? "" : "opacity-0 pointer-events-none select-none"
          )}
          aria-hidden={!nav.foldersEnabled}
        >
          {/* solda: ierarxiya */}
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => { setCurrentFolder(null); clearSelection(); }}
              className={ui.crumbRoot}
            >
              Məhsullar
            </button>
            {crumbs.map((c) => (
              <React.Fragment key={c.id}>
                <I.ChevronR className="h-4 w-4 text-slate-400" />
                <button
                  onClick={() => { setCurrentFolder(c.id); clearSelection(); }}
                  className={ui.crumbBtn}
                >
                  {c.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          {/* sağda: Yuxarı */}
          {currentFolder != null && (
            <button
              onClick={() => setCurrentFolder(groups.find((g) => g.id === currentFolder)?.parentId ?? null)}
              className={cx("px-3 h-9 rounded-lg text-sm border", ui.borderSoft, isDark ? "hover:bg-white/5" : "hover:bg-slate-50")}
              title="Yuxarı"
            >
              Yuxarı
            </button>
          )}
        </div>
      </div>

      {/* TABLE */}
      <div className={cx("overflow-x-auto", ui.card, ui.ring)}>
        <table className="min-w-full text-sm">
          <thead className={cx(view.stickyHeader && ui.theadSticky)}>
            <tr className={ui.headerRow}>
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Hamısını seç"
                  checked={headerAllChecked}
                  onChange={(e)=>setSelected(e.target.checked ? new Set(visibleProducts.map((r)=>r.id)) : new Set())}
                />
              </th>
              {/* FOTO başlığını ləğv etdik — boş th saxlayırıq */}
              {colVisible("foto") && <th className={cx("px-3 w-[52px]", rowPad)}></th>}
              <th className={cx("text-left px-3", rowPad)}>AD</th>
              {colVisible("kod") && <th className={cx("text-left px-3", rowPad)}>KOD</th>}
              {colVisible("artikel") && <th className={cx("text-left px-3", rowPad)}>ARTIKUL</th>}
              {colVisible("vahid") && <th className={cx("text-left px-3", rowPad)}>ÖLÇÜ VAHİDİ</th>}
              {colVisible("sale_price") && <th className={cx("text-left px-3", rowPad)}>Satış qiyməti</th>}
              {colVisible("cost") && <th className={cx("text-left px-3", rowPad)}>Maya dəyəri</th>}
              {colVisible("purchase_price") && <th className={cx("text-left px-3", rowPad)}>Alışın qiyməti</th>}
              {colVisible("antrepo") && <th className={cx("text-left px-3", rowPad)}>ERSA ANTREPO</th>}
              {colVisible("depo") && <th className={cx("text-left px-3", rowPad)}>ERSA DEPO</th>}
              <th className={cx("text-left px-3", rowPad)}>QALIQ</th>
            </tr>
          </thead>

          <tbody>
            {/* folder rows */}
            {nav.foldersEnabled && searchSet.scope === "current" && childGroups.map((g) => {
              const prodCount = filteredAll.filter((r)=>r.groupId === g.id).length;
              const sAnt = filteredAll.filter((r)=>r.groupId===g.id).reduce((a,b)=>a+(b.antrepo??0),0);
              const sDep = filteredAll.filter((r)=>r.groupId===g.id).reduce((a,b)=>a+(b.depo??0),0);
              const sTot = sAnt + sDep;
              return (
                <tr key={"folder-"+g.id} className={cx(ui.rowHover, ui.rowDivider)}>
                  <td className="w-8 px-3">{/* qovluq seçimi yoxdur */}</td>
                  {colVisible("foto") && (
                    <td className={cx("px-3", rowPad)}>
                      <div className={cx("w-8 h-8 rounded-md flex items-center justify-center", ui.softBox)}>
                        <I.Folder className="h-5 w-5 text-blue-600"/>
                      </div>
                    </td>
                  )}
                  <td className={cx("px-3", rowPad)}>
                    <button onClick={()=>{ setCurrentFolder(g.id); clearSelection(); }} className="text-blue-600 hover:underline">{g.name}</button>
                    <span className={cx("ml-2 text-xs", ui.textSubtle)}>Məhsul: {prodCount}</span>
                  </td>
                  {colVisible("kod") && <td className={cx("px-3", rowPad)}>—</td>}
                  {colVisible("artikel") && <td className={cx("px-3", rowPad)}>—</td>}
                  {colVisible("vahid") && <td className={cx("px-3", rowPad)}>—</td>}
                  {colVisible("sale_price") && <td className={cx("px-3", rowPad)}>—</td>}
                  {colVisible("cost") && <td className={cx("px-3", rowPad)}>—</td>}
                  {colVisible("purchase_price") && <td className={cx("px-3", rowPad)}>—</td>}
                  {colVisible("antrepo") && <td className={cx("px-3", rowPad)}>{toNum(sAnt)}</td>}
                  {colVisible("depo") && <td className={cx("px-3", rowPad)}>{toNum(sDep)}</td>}
                  <td className={cx("px-3", rowPad)}>{toNum(sTot)}</td>
                </tr>
              );
            })}

            {/* product rows */}
            {visibleProducts.map((r, i) => {
              const zebra = view.zebra && i % 2 === 1 ? (isDark ? "bg-white/5" : "bg-slate-50") : undefined;
              const isSel = selected.has(r.id);
              const total = (r.antrepo ?? 0) + (r.depo ?? 0);
              return (
                <tr key={r.id} className={cx(zebra, isSel && (isDark ? "bg-indigo-500/10" : "bg-indigo-50"), ui.rowDivider, ui.rowHover)}>
                  <td className="w-8 px-3">
                    <input type="checkbox" checked={isSel} onChange={()=>toggleRow(r.id)} aria-label={`Seç: ${r.ad}`} />
                  </td>
                  {colVisible("foto") && (
                    <td className={cx("px-3", rowPad)}>
                      <div className={cx(
                        "w-8 h-8 rounded-md bg-gradient-to-br",
                        isDark ? "from-indigo-900/30 to-indigo-500/10 ring-1 ring-inset ring-indigo-800/40" : "from-indigo-200 to-indigo-50 ring-1 ring-inset ring-indigo-100"
                      )} />
                    </td>
                  )}
                  <td className={cx("px-3", rowPad)}><a className="text-indigo-600 hover:underline" href="#">{r.ad}</a></td>
                  {colVisible("kod") && <td className={cx("px-3 tabular-nums", rowPad)}>{r.kod ?? "—"}</td>}
                  {colVisible("artikel") && <td className={cx("px-3", rowPad)}>{r.artikel ?? "—"}</td>}
                  {colVisible("vahid") && <td className={cx("px-3", rowPad)}>{r.vahid ?? "—"}</td>}
                  {colVisible("sale_price") && <td className={cx("px-3 tabular-nums", rowPad)}>{toCurrency(r.sale_price)}</td>}
                  {colVisible("cost") && <td className={cx("px-3 tabular-nums", rowPad)}>{toCurrency(r.cost)}</td>}
                  {colVisible("purchase_price") && <td className={cx("px-3 tabular-nums", rowPad)}>{toCurrency(r.purchase_price)}</td>}
                  {colVisible("antrepo") && <td className={cx("px-3 tabular-nums", rowPad)}>{toNum(r.antrepo)}</td>}
                  {colVisible("depo") && <td className={cx("px-3 tabular-nums", rowPad)}>{toNum(r.depo)}</td>}
                  <td className={cx("px-3 tabular-nums", rowPad)}>{toNum(total)}</td>
                </tr>
              );
            })}

            {visibleProducts.length === 0 && childGroups.length === 0 && (
              <tr><td colSpan={12} className={cx("px-4 py-6 text-center", ui.textSubtle)}>Heç nə tapılmadı.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------ overflow menu ------------------------------ */
function OverflowMenu({ onClose, selectedCount, isDark }: { onClose: () => void; selectedCount: number; isDark: boolean; }) {
  const ui = makeUI(isDark);
  const disabledIfNoSel = selectedCount === 0;

  const Item = ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; }) => (
    <button
      role="menuitem"
      disabled={disabled}
      onClick={() => { if (disabled) return; onClick?.(); onClose(); }}
      className={cx(
        "w-full text-left px-3 py-2 rounded-lg",
        disabled ? "opacity-50 cursor-not-allowed" : (isDark ? "hover:bg-white/5" : "hover:bg-slate-100")
      )}
    >{children}</button>
  );

  return (
    <div role="menu" className={cx("absolute right-0 mt-2 w-72 backdrop-blur overflow-hidden p-2", ui.card, ui.ring)}>
      <details>
        <summary className={cx("px-2 py-2 cursor-pointer list-none rounded-lg flex items-center justify-between",
                               isDark ? "hover:bg-white/5" : "hover:bg-slate-100")}>
          <span>Sənəd yarat</span><span className="text-slate-400">▸</span>
        </summary>
        <div className="px-1 pb-2 space-y-1">
          <Item>Satış</Item>
          <Item>Alış</Item>
          <Item>Düzəliş</Item>
          <Item>Anbar köçürməsi</Item>
        </div>
      </details>

      <div className={cx("h-px my-2", isDark ? "bg-slate-700" : "bg-slate-200")} />

      <Item disabled={disabledIfNoSel}>Qiymətlər və endirimlər</Item>
      <Item disabled={disabledIfNoSel}>Kateqoriya və qruplar</Item>
      <Item disabled={disabledIfNoSel}>Digər</Item>

      <div className={cx("h-px my-2", isDark ? "bg-slate-700" : "bg-slate-200")} />

      <Item disabled={disabledIfNoSel}>Qiymət etiketləri</Item>
      <Item disabled={disabledIfNoSel}>Qiymət redaktoru</Item>

      <div className={cx("h-px my-2", isDark ? "bg-slate-700" : "bg-slate-200")} />

      <Item>Anbar qiymətləndirilməsi</Item>
      <Item disabled={disabledIfNoSel}>Tərəzi üçün fayl</Item>

      <details>
        <summary className={cx("px-2 py-2 cursor-pointer list-none rounded-lg flex items-center justify-between",
                               isDark ? "hover:bg-white/5" : "hover:bg-slate-100")}>
          <span>Excel-də yükləyin</span><span className="text-slate-400">▸</span>
        </summary>
        <div className="px-1 pb-2 space-y-1">
          <Item>Seçilənlər (XLSX)</Item>
          <Item>Seçilənlər (CSV)</Item>
          <Item>Hamısı (XLSX)</Item>
          <Item>Hamısı (CSV)</Item>
        </div>
      </details>

      <div className={cx("h-px my-2", isDark ? "bg-slate-700" : "bg-slate-200")} />

      <Item disabled={disabledIfNoSel}><span className="text-red-600">Sil</span></Item>
    </div>
  );
}

/* ------------------------------ params panel ------------------------------ */
function ParamsPanel({
  cols, setCols, view, setView, nav, setNav, searchSet, setSearchSet,
  onResetAll, onResetCols, isDark
}: {
  cols: ColSettings; setCols: React.Dispatch<React.SetStateAction<ColSettings>>;
  view: ViewSettings; setView: React.Dispatch<React.SetStateAction<ViewSettings>>;
  nav: NavSettings; setNav: React.Dispatch<React.SetStateAction<NavSettings>>;
  searchSet: SearchSettings; setSearchSet: React.Dispatch<React.SetStateAction<SearchSettings>>;
  onResetAll: () => void; onResetCols: () => void;
  isDark: boolean;
}) {
  const ui = makeUI(isDark);
  const toggleCol = (id: ColId) => setCols((c)=>({ ...c, [id]: !c[id] }));
  const setAllCols = (v: boolean) => {
    const next: ColSettings = { ...cols }; (Object.keys(next) as ColId[]).forEach((k)=>next[k]=v);
    setCols(next);
  };
  const setStandardCols = () => setCols(DEFAULT_COLS);

  return (
    <div className={cx("absolute right-0 mt-2 w-[360px] overflow-hidden", ui.card, ui.ring)} role="menu">
      <div className={cx("px-4 py-3 text-xs font-semibold flex items-center gap-2", isDark ? "text-slate-200" : "text-slate-700") }>
        <I.Cog className="h-4 w-4" /> CƏDVƏL PARAMETRLƏRİ
      </div>

      {/* Sütunlar */}
      <div className="px-3 pb-2 space-y-2 max-h-56 overflow-auto">
        <div className={cx("text-xs mb-1", ui.textSubtle)}>Sütunlar</div>
        {["foto","kod","artikel","vahid","sale_price","cost","purchase_price","antrepo","depo"].map((id)=> (
          <label key={id} className="flex items-center gap-3">
            <input type="checkbox" checked={cols[id as ColId]} onChange={()=>toggleCol(id as ColId)} />
            <span>
              {id==="foto"?"Foto":id==="kod"?"Kod":id==="artikel"?"Artikul":id==="vahid"?"Ölçü vahidi":
               id==="sale_price"?"Satış qiyməti":id==="cost"?"Maya dəyəri":id==="purchase_price"?"Alışın qiyməti":
               id==="antrepo"?"ERSA ANTREPO":"ERSA DEPO"}
            </span>
          </label>
        ))}
      </div>
      <div className="px-3 pb-3 flex gap-2">
        <button className={cx("px-2.5 h-8 rounded-lg text-xs border", ui.borderSoft, isDark ? "hover:bg-white/5" : "hover:bg-slate-100")} onClick={()=>setAllCols(true)}>Hamısını göstər</button>
        <button className={cx("px-2.5 h-8 rounded-lg text-xs border", ui.borderSoft, isDark ? "hover:bg-white/5" : "hover:bg-slate-100")} onClick={()=>setAllCols(false)}>Hamısını gizlət</button>
        <button className={cx("px-2.5 h-8 rounded-lg text-xs border", ui.borderSoft, isDark ? "hover:bg-white/5" : "hover:bg-slate-100")} onClick={setStandardCols}>Standart</button>
      </div>

      <div className={cx("h-px mx-3", isDark ? "bg-slate-700" : "bg-slate-200")} />

      {/* Qovluqlar */}
      <div className="px-3 py-3 space-y-2">
        <div className={cx("text-xs", ui.textSubtle)}>Qovluq / qruplar</div>
        <label className="flex items-center gap-3">
          <input type="checkbox" checked={nav.foldersEnabled} onChange={(e)=>setNav((v)=>({ ...v, foldersEnabled: e.target.checked }))} />
          <span>Qovluq naviqasiyasını aktiv et</span>
        </label>
      </div>

      <div className={cx("h-px mx-3", isDark ? "bg-slate-700" : "bg-slate-200")} />

      {/* Görünüş */}
      <div className="px-3 py-3 space-y-2">
        <div className={cx("text-xs", ui.textSubtle)}>Görünüş</div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="den" checked={view.density==="comfortable"} onChange={()=>setView((v)=>({ ...v, density:"comfortable" }))} />
            Rahat
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="den" checked={view.density==="compact"} onChange={()=>setView((v)=>({ ...v, density:"compact" }))} />
            Kompakt
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={view.stickyHeader} onChange={(e)=>setView((v)=>({ ...v, stickyHeader: e.target.checked }))} />
          Sticky header
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={view.zebra} onChange={(e)=>setView((v)=>({ ...v, zebra: e.target.checked }))} />
          Zebra sətirlər
        </label>
      </div>

      <div className={cx("h-px mx-3", isDark ? "bg-slate-700" : "bg-slate-200")} />

      {/* Axtarış */}
      <div className="px-3 py-3 space-y-2">
        <div className={cx("text-xs", ui.textSubtle)}>Axtarış</div>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="scope" checked={searchSet.scope==="current"} onChange={()=>setSearchSet({ scope: "current" })} />
          Yalnız cari qovluqda
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="scope" checked={searchSet.scope==="all"} onChange={()=>setSearchSet({ scope: "all" })} />
          Bütün qovluqlarda
        </label>
      </div>

      <div className={cx("h-px mx-3", isDark ? "bg-slate-700" : "bg-slate-200")} />


      {/* footer */}
      <div className="px-3 py-3 flex items-center justify-between">
        <button onClick={onResetAll} className={cx("px-3 h-9 rounded-lg text-sm border", ui.borderSoft, isDark ? "hover:bg-white/5" : "hover:bg-slate-100")}>Defolta qaytar</button>
        <button onClick={onResetCols} className={cx("px-3 h-9 rounded-lg text-sm border", ui.borderSoft, isDark ? "hover:bg-white/5" : "hover:bg-slate-100")}>Yalnız sütunları sıfırla</button>
      </div>
    </div>
  );
}
