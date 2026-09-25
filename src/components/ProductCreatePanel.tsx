import React, { useEffect, useMemo, useRef, useState } from "react";

const cx = (...s: (string | false | undefined)[]) => s.filter(Boolean).join(" ");

const makeUI = (isDark: boolean) => ({
  card: `rounded-2xl border ${isDark ? "glass-panel-dark" : "glass-panel"}`,
  input: [
    "w-full h-10 px-3 rounded-xl border outline-none placeholder-slate-400 text-sm",
    isDark
      ? "glass-control-dark text-slate-100 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
      : "glass-control text-slate-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25",
  ].join(" "),
  textarea: [
    "w-full min-h-24 resize-y rounded-xl border px-3 py-2 outline-none placeholder-slate-400 text-sm",
    isDark
      ? "glass-control-dark text-slate-100 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
      : "glass-control text-slate-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25",
  ].join(" "),
  borderSoft: isDark ? "border-white/10" : "border-white/60",
  textSubtle: isDark ? "text-slate-400" : "text-slate-500",
  softBox: isDark ? "bg-white/5 border-white/10" : "bg-slate-50 border-slate-200",
});

type ProductCreateForm = {
  ad: string;
  kod: string;
  status: "active" | "inactive";
  barkod: string;
  barcodeType: "fixed" | "weight" | "quantity" | "plu";
  barcodeDecimals: string;
  gtin: string;
  plu: string;
  artikel: string;
  brand: string;
  sekil: string;
  kateqoriyalar: string;
  vahid: string;
  secondaryUnit: string;
  conversionRate: string;
  weighted: boolean;
  packageEnabled: boolean;
  packageName: string;
  packageQty: string;
  xususiyyetler: string;
  lengthCm: string;
  widthCm: string;
  depthCm: string;
  weightKg: string;
  rollWidthMm: string;
  defaultRollLengthMt: string;
  netWeightKg: string;
  grossWeightKg: string;
  volumeM3: string;
  description: string;
  country: string;
  qiymet: string;
  wholesalePrice: string;
  maya: string;
  alis: string;
  markup: string;
  freePrice: boolean;
  storePrices: boolean;
  endirim: string;
  vergi: string;
  taxFree: boolean;
  groupId: string;
  stockGroup: string;
  supplier: string;
  supplierCode: string;
  supplierProductCode: string;
  supplierSources: SupplierSourceForm[];
  antrepo: string;
  depo: string;
  warehouseStocks: Record<string, string>;
  minimalQalq: string;
  maxStock: string;
  minOrderQty: string;
  maxOrderQty: string;
  negativeStockAllowed: boolean;
  shelfLocation: string;
  shelfLifeDays: string;
  leadTimeDays: string;
  warrantyMonths: string;
  tariffCode: string;
  alternativeProductIds: string[];
  note: string;
  modifikasiya: boolean;
  initialStock: boolean;
  expirationDate: string;
};

export type SupplierSourceForm = {
  id: string;
  supplierId: string;
  productCode: string;
  purchasePrice: string;
  currency: "TRY" | "USD" | "EUR" | "AZN";
  leadTimeDays: string;
  isPrimary: boolean;
};

export type ProductFormValues = ProductCreateForm & {
  type: "product" | "service" | "bundle";
};

type GroupOption = {
  id: number;
  name: string;
  parentId: number | null;
};

type StoreOption = {
  id: number;
  key: string;
  name: string;
  status: "active" | "inactive";
};

type ProductOption = {
  id: number;
  name: string;
  code?: string;
};

type SupplierOption = {
  id: number;
  name: string;
};

type Props = {
  visible: boolean;
  isDark?: boolean;
  defaultType?: ProductFormValues["type"];
  defaultGroupId?: number | null;
  defaultCode?: string;
  groups?: GroupOption[];
  stores?: StoreOption[];
  products?: ProductOption[];
  suppliers?: SupplierOption[];
  onClose: () => void;
  onSubmit?: (values: ProductFormValues) => void;
};

const emptyForm = (groupId: number | null = null, code = ""): ProductCreateForm => ({
  ad: "",
  kod: code,
  status: "active",
  barkod: "",
  barcodeType: "fixed",
  barcodeDecimals: "0",
  gtin: "",
  plu: "",
  artikel: "",
  brand: "",
  sekil: "",
  kateqoriyalar: "",
  vahid: "əd",
  secondaryUnit: "",
  conversionRate: "",
  weighted: false,
  packageEnabled: false,
  packageName: "",
  packageQty: "",
  xususiyyetler: "",
  lengthCm: "",
  widthCm: "",
  depthCm: "",
  weightKg: "",
  rollWidthMm: "",
  defaultRollLengthMt: "",
  netWeightKg: "",
  grossWeightKg: "",
  volumeM3: "",
  description: "",
  country: "",
  qiymet: "",
  wholesalePrice: "",
  maya: "",
  alis: "",
  markup: "",
  freePrice: false,
  storePrices: false,
  endirim: "",
  vergi: "",
  taxFree: false,
  groupId: groupId == null ? "" : String(groupId),
  stockGroup: "",
  supplier: "",
  supplierCode: "",
  supplierProductCode: "",
  supplierSources: [],
  antrepo: "",
  depo: "",
  warehouseStocks: {},
  minimalQalq: "",
  maxStock: "",
  minOrderQty: "",
  maxOrderQty: "",
  negativeStockAllowed: false,
  shelfLocation: "",
  shelfLifeDays: "",
  leadTimeDays: "",
  warrantyMonths: "",
  tariffCode: "",
  alternativeProductIds: [],
  note: "",
  modifikasiya: false,
  initialStock: false,
  expirationDate: "",
});

const generateNumericCode = (length = 13) =>
  Array.from({ length }, () => Math.floor(Math.random() * 10)).join("");

const createSupplierSource = (isPrimary = false): SupplierSourceForm => ({
  id: `supplier-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  supplierId: "",
  productCode: "",
  purchasePrice: "",
  currency: "USD",
  leadTimeDays: "",
  isPrimary,
});

function ToggleControl({
  checked,
  onChange,
  label,
  hint,
  isDark,
  textSubtle,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
  isDark: boolean;
  textSubtle: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="flex items-start gap-3 text-left"
    >
      <span
        className={cx(
          "mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition",
          checked ? "bg-indigo-600" : isDark ? "bg-slate-700" : "bg-slate-200"
        )}
      >
        <span className={cx("h-5 w-5 rounded-full bg-white shadow transition", checked && "translate-x-5")} />
      </span>
      <span>
        <span className={cx("block text-sm font-medium", isDark ? "text-slate-100" : "text-slate-700")}>{label}</span>
        {hint && <span className={cx("block text-xs", textSubtle)}>{hint}</span>}
      </span>
    </button>
  );
}

function FormSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 px-1 pb-1">
      <div className="mb-4 flex items-center gap-3">
        <h3 className="shrink-0 text-base font-semibold">{title}</h3>
        <span className="h-px flex-1 bg-slate-200/80 dark:bg-white/10" />
      </div>
      {children}
    </section>
  );
}

export default function ProductCreatePanel({
  visible,
  isDark = false,
  defaultType = "product",
  defaultGroupId = null,
  defaultCode = "",
  groups = [],
  stores = [],
  products = [],
  suppliers = [],
  onClose,
  onSubmit,
}: Props) {
  const ui = makeUI(isDark);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [tab, setTab] = useState<ProductFormValues["type"]>(defaultType);
  const [section, setSection] = useState<"basic" | "codes" | "measure" | "stock" | "suppliers" | "price" | "tax" | "extra">("basic");
  const [form, setForm] = useState<ProductCreateForm>(() => emptyForm(defaultGroupId, defaultCode));

  useEffect(() => {
    if (!visible) return;
    setTab(defaultType);
    setSection("basic");
    setForm({
      ...emptyForm(defaultGroupId, defaultCode),
      vahid: defaultType === "service" ? "xidmət" : defaultType === "bundle" ? "dəst" : "əd",
      warehouseStocks: Object.fromEntries(stores.filter((store) => store.status === "active").map((store) => [store.key, ""])),
    });
  }, [defaultCode, defaultGroupId, defaultType, stores, visible]);

  const groupOptions = useMemo(() => {
    const byParent = new Map<number | null, GroupOption[]>();
    groups.forEach((group) => {
      const list = byParent.get(group.parentId) ?? [];
      list.push(group);
      byParent.set(group.parentId, list);
    });

    const flatten = (parentId: number | null, level = 0): { group: GroupOption; level: number }[] =>
      (byParent.get(parentId) ?? []).flatMap((group) => [
        { group, level },
        ...flatten(group.id, level + 1),
      ]);

    return flatten(null);
  }, [groups]);

  if (!visible) return null;

  const setField = <K extends keyof ProductCreateForm>(key: K, value: ProductCreateForm[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleChange =
    (key: keyof ProductCreateForm) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
    };

  const handleImageFile = (file?: File) => {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => setField("sekil", String(reader.result ?? ""));
    reader.readAsDataURL(file);
  };

  const handleSave = () => {
    if (!form.ad.trim()) return;
    const supplierSources = form.supplierSources.filter((source) => source.supplierId);
    const primarySource = supplierSources.find((source) => source.isPrimary) ?? supplierSources[0];
    const primarySupplier = suppliers.find((supplier) => String(supplier.id) === primarySource?.supplierId);
    onSubmit?.({
      type: tab,
      ...form,
      supplierSources,
      supplier: primarySupplier?.name ?? "",
      supplierCode: primarySource?.supplierId ?? "",
      supplierProductCode: primarySource?.productCode.trim() ?? "",
      leadTimeDays: primarySource?.leadTimeDays ?? form.leadTimeDays,
      alis: form.alis || primarySource?.purchasePrice || "",
    });
    onClose();
  };

  const typeCards: { id: ProductFormValues["type"]; title: string; description: string }[] = [
    { id: "product", title: "Məhsul", description: "Stok və qalıq izlənən kart" },
    { id: "service", title: "Xidmət", description: "Anbar qalığı olmayan satış" },
    { id: "bundle", title: "Dəst", description: "Bir neçə məhsuldan ibarət" },
  ];
  const sectionTabs = [
    { id: "basic", label: "Əsas məlumat" },
    { id: "codes", label: "Kodlar və barkod" },
    { id: "measure", label: "Rulo parametrləri", productOnly: true },
    { id: "stock", label: "Stok", productOnly: true },
    { id: "suppliers", label: "Təchizatçılar", productOnly: true },
    { id: "price", label: "Qiymətlər" },
    { id: "tax", label: "Vergi" },
    { id: "extra", label: "Əlavə" },
  ] as const;
  const activeStores = stores.filter((store) => store.status === "active");

  const toggleProps = { isDark, textSubtle: ui.textSubtle };

  return (
    <div
      className={cx(
        "fixed inset-0 z-40 flex items-center justify-center px-4 py-6",
        isDark ? "bg-slate-950/55 backdrop-blur-sm" : "bg-slate-900/30 backdrop-blur-sm"
      )}
      onClick={onClose}
    >
      <div
        className={cx("erp-modal-shell flex w-full max-w-5xl flex-col overflow-hidden", ui.card)}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={cx("flex items-center justify-between gap-4 border-b px-5 py-4", ui.borderSoft)}>
          <div>
            <h2 className="text-lg font-semibold">Yarat</h2>
            <p className={cx("text-xs", ui.textSubtle)}>Məhsul, xidmət və dəst kartını yığcam formada əlavə et.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cx(
              "h-9 rounded-lg border px-3 text-sm",
              ui.borderSoft,
              isDark ? "hover:bg-white/10 text-slate-100" : "hover:bg-white/65 text-slate-700"
            )}
          >
            Bağla
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4">
          <div className={cx("mb-4 grid grid-cols-3 rounded-xl border p-1", ui.borderSoft, isDark ? "bg-slate-950/20" : "bg-slate-100/70")}>
            {typeCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => {
                  setTab(card.id);
                  setSection("basic");
                  if (card.id === "service") setField("vahid", "xidmət");
                  if (card.id === "bundle" && form.vahid === "xidmət") setField("vahid", "dəst");
                  if (card.id === "product" && form.vahid === "xidmət") setField("vahid", "əd");
                }}
                className={cx(
                  "min-h-14 rounded-lg px-3 py-2 text-center transition",
                  tab === card.id
                    ? isDark ? "bg-indigo-500/20 text-indigo-100 shadow-sm" : "bg-white text-indigo-700 shadow-sm"
                    : isDark ? "text-slate-300 hover:bg-white/5" : "text-slate-600 hover:bg-white/60"
                )}
              >
                <span className="block text-sm font-semibold">{card.title}</span>
                <span className={cx("mt-0.5 block text-[11px]", tab === card.id && !isDark ? "text-indigo-500" : ui.textSubtle)}>{card.description}</span>
              </button>
            ))}
          </div>

          <div className={cx("mb-5 flex gap-1 overflow-x-auto border-b", ui.borderSoft)} role="tablist" aria-label="Məhsul kartı bölmələri">
            {sectionTabs.filter((item) => tab !== "service" || !("productOnly" in item && item.productOnly)).map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={section === item.id}
                onClick={() => setSection(item.id)}
                className={cx(
                  "relative h-11 shrink-0 px-3 text-sm font-medium transition",
                  section === item.id
                    ? isDark ? "text-indigo-200" : "text-indigo-700"
                    : isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-800"
                )}
              >
                {item.label}
                {section === item.id && <span className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-indigo-600" />}
              </button>
            ))}
          </div>

          <div className="min-h-[390px]">
            {section === "basic" && (
              <FormSection title="Əsas məlumat">
                <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_180px]">
                  <div className="grid gap-3 md:grid-cols-4">
                    <label className="md:col-span-3"><span className="mb-1 block text-xs font-medium">Ad <span className="text-red-500">*</span></span><input className={ui.input} value={form.ad} onChange={handleChange("ad")} placeholder="Məhsul adını daxil edin" /></label>
                    <label><span className="mb-1 block text-xs font-medium">Status</span><select className={ui.input} value={form.status} onChange={handleChange("status")}><option value="active">Aktiv</option><option value="inactive">Qeyri-aktiv</option></select></label>
                    <label><span className="mb-1 block text-xs font-medium">Marka</span><input className={ui.input} value={form.brand} onChange={handleChange("brand")} placeholder="Marka" /></label>
                    <label><span className="mb-1 block text-xs font-medium">Mənşə ölkəsi</span><select className={ui.input} value={form.country} onChange={handleChange("country")}><option value="">Ölkə seçin</option><option value="Azərbaycan">Azərbaycan</option><option value="Türkiyə">Türkiyə</option><option value="Çin">Çin</option><option value="Almaniya">Almaniya</option></select></label>
                    <label><span className="mb-1 block text-xs font-medium">Kateqoriyalar</span><input className={ui.input} value={form.kateqoriyalar} onChange={handleChange("kateqoriyalar")} placeholder="Vergüllə ayırın" /></label>
                    <label><span className="mb-1 block text-xs font-medium">Qovluq</span><select className={ui.input} value={form.groupId} onChange={handleChange("groupId")}><option value="">Qovluqsuz</option>{groupOptions.map(({ group, level }) => <option key={group.id} value={String(group.id)}>{"— ".repeat(level)}{group.name}</option>)}</select></label>
                    <label className="md:col-span-4"><span className="mb-1 block text-xs font-medium">Təsvir</span><textarea className={ui.textarea} value={form.description} onChange={handleChange("description")} placeholder={tab === "service" ? "Xidmətin təsviri" : "Məhsul haqqında qeyd"} /></label>
                  </div>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium">Şəkil</span>
                    <button type="button" onClick={() => fileRef.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); handleImageFile(e.dataTransfer.files[0]); }} className={cx("flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-dashed p-3 text-center text-sm", isDark ? "border-slate-600 hover:bg-white/5" : "border-slate-300 hover:bg-slate-50")}>{form.sekil ? <img src={form.sekil} alt="Məhsul" className="h-full w-full object-contain" /> : <span><span className="block font-medium">Şəkil seçin</span><span className={cx("mt-1 block text-xs", ui.textSubtle)}>və ya bura sürüşdürün</span></span>}</button>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageFile(e.target.files?.[0])} />
                  </label>
                </div>
              </FormSection>
            )}

            {section === "codes" && (
              <FormSection title="Kodlar və barkod">
                <div className="grid gap-3 md:grid-cols-3">
                  <label><span className="mb-1 block text-xs font-medium">Məhsul kodu</span><input className={ui.input} value={form.kod} onChange={handleChange("kod")} placeholder="00250" /></label>
                  <label><span className="mb-1 block text-xs font-medium">SKU / Artikul</span><input className={ui.input} value={form.artikel} onChange={handleChange("artikel")} placeholder="ERSA 011" /></label>
                  <label><span className="mb-1 flex items-center justify-between text-xs font-medium">PLU kod<button type="button" aria-label="PLU kodu yarat" className="text-indigo-600" onClick={() => setField("plu", generateNumericCode(5))}>Törət</button></span><input className={ui.input} value={form.plu} onChange={handleChange("plu")} placeholder="PLU kod" /></label>
                  <label><span className="mb-1 block text-xs font-medium">Barkod növü</span><select className={ui.input} value={form.barcodeType} onChange={handleChange("barcodeType")}><option value="fixed">Sabit</option><option value="weight">KG barkodu</option><option value="quantity">Ədəd barkodu</option><option value="plu">PLU barkodu</option></select></label>
                  <label><span className="mb-1 flex items-center justify-between text-xs font-medium">Əsas barkod<button type="button" aria-label="Əsas barkod yarat" className="text-indigo-600" onClick={() => setField("barkod", generateNumericCode())}>Törət</button></span><input className={ui.input} value={form.barkod} onChange={handleChange("barkod")} placeholder="13 rəqəmli barkod" /></label>
                  <label><span className="mb-1 block text-xs font-medium">GTIN</span><input className={ui.input} value={form.gtin} onChange={handleChange("gtin")} placeholder="GTIN" /></label>
                  <label><span className="mb-1 block text-xs font-medium">Ondalıq rəqəm</span><input className={ui.input} value={form.barcodeDecimals} onChange={handleChange("barcodeDecimals")} inputMode="numeric" /></label>
                </div>
                <p className={cx("mt-4 text-xs", ui.textSubtle)}>Rulo pasport barkodları alış zamanı hər rulo üçün ayrıca yaradılır. Buradakı barkod məhsul kartının əsas barkodudur.</p>
              </FormSection>
            )}

            {section === "measure" && tab !== "service" && (
              <FormSection title="Vahid və rulo qaydaları">
                <div className="grid gap-3 md:grid-cols-3">
                  <label><span className="mb-1 block text-xs font-medium">Əsas vahid</span><select className={ui.input} value={form.vahid} onChange={handleChange("vahid")}><option value="əd">əd</option><option value="mt">mt</option><option value="rulo">rulo</option><option value="palet">palet</option><option value="kg">kg</option><option value="m²">m²</option><option value="dəst">dəst</option></select></label>
                  <label><span className="mb-1 block text-xs font-medium">İkinci vahid</span><select className={ui.input} value={form.secondaryUnit} onChange={handleChange("secondaryUnit")}><option value="">Yoxdur</option><option value="mt">mt</option><option value="rulo">rulo</option><option value="palet">palet</option><option value="kg">kg</option><option value="m²">m²</option></select></label>
                  <label><span className="mb-1 block text-xs font-medium">Çevirmə əmsalı</span><input className={ui.input} value={form.conversionRate} onChange={handleChange("conversionRate")} placeholder="1 rulo = 100 mt" /></label>
                  <label><span className="mb-1 block text-xs font-medium">Rulo eni, mm</span><input className={ui.input} value={form.rollWidthMm} onChange={handleChange("rollWidthMm")} inputMode="decimal" placeholder="1220" /></label>
                  <label><span className="mb-1 block text-xs font-medium">Standart rulo, mt</span><input className={ui.input} value={form.defaultRollLengthMt} onChange={handleChange("defaultRollLengthMt")} inputMode="decimal" placeholder="100" /></label>
                </div>
                <p className={cx("mt-4 text-xs", ui.textSubtle)}>Faktiki rulo metrajı, net və brüt çəki alış sənədində hər rulo və partiya üçün ayrıca daxil edilir.</p>
                <div className="mt-5 grid gap-4 md:grid-cols-2"><ToggleControl {...toggleProps} checked={form.weighted} onChange={(next) => setField("weighted", next)} label="Çəki ilə satılır" /><ToggleControl {...toggleProps} checked={form.packageEnabled} onChange={(next) => setField("packageEnabled", next)} label="Qablaşdırma vahidi əlavə et" hint="Qutu, paket və ya palet çevirməsi üçün" /></div>
                {form.packageEnabled && <div className="mt-4 grid gap-3 md:grid-cols-2"><label><span className="mb-1 block text-xs font-medium">Qablaşdırma adı</span><input className={ui.input} value={form.packageName} onChange={handleChange("packageName")} /></label><label><span className="mb-1 block text-xs font-medium">İçindəki miqdar</span><input className={ui.input} value={form.packageQty} onChange={handleChange("packageQty")} inputMode="decimal" /></label></div>}
              </FormSection>
            )}

            {section === "suppliers" && tab !== "service" && (
              <FormSection title="Təchizat mənbələri">
                <div className="flex items-start justify-between gap-4">
                  <p className={cx("max-w-2xl text-sm", ui.textSubtle)}>Eyni məhsul fərqli təchizatçılardan fərqli kod, valyuta və qiymətlə alına bilər. Buradakı qiymət təklif qiymətidir; faktiki alış qiyməti alış sənədində saxlanılır.</p>
                  <button
                    type="button"
                    onClick={() => setField("supplierSources", [...form.supplierSources, createSupplierSource(form.supplierSources.length === 0)])}
                    className="surface-primary h-9 shrink-0 rounded-lg px-3 text-sm"
                  >
                    + Təchizatçı
                  </button>
                </div>
                {suppliers.length === 0 && <div className={cx("mt-5 rounded-lg border px-4 py-3 text-sm", ui.softBox)}>Əvvəlcə Kontragentlər → Təchizatçılar bölməsində təchizatçı yaradın.</div>}
                <div className="mt-5 space-y-3">
                  {form.supplierSources.map((source, index) => (
                    <div key={source.id} className={cx("grid items-end gap-3 rounded-xl border p-3 md:grid-cols-[minmax(170px,1.4fr)_1fr_120px_92px_92px_40px]", ui.borderSoft, isDark ? "bg-white/5" : "bg-slate-50/75")}>
                      <label><span className="mb-1 block text-xs font-medium">Təchizatçı</span><select className={ui.input} value={source.supplierId} onChange={(e) => setField("supplierSources", form.supplierSources.map((item) => item.id === source.id ? { ...item, supplierId: e.target.value } : item))}><option value="">Seçin</option>{suppliers.map((supplier) => <option key={supplier.id} value={String(supplier.id)}>{supplier.name}</option>)}</select></label>
                      <label><span className="mb-1 block text-xs font-medium">Məhsul kodu</span><input className={ui.input} value={source.productCode} onChange={(e) => setField("supplierSources", form.supplierSources.map((item) => item.id === source.id ? { ...item, productCode: e.target.value } : item))} placeholder="Təchizatçı SKU" /></label>
                      <label><span className="mb-1 block text-xs font-medium">Təklif qiyməti</span><input className={ui.input} value={source.purchasePrice} onChange={(e) => setField("supplierSources", form.supplierSources.map((item) => item.id === source.id ? { ...item, purchasePrice: e.target.value } : item))} inputMode="decimal" placeholder="0.00" /></label>
                      <label><span className="mb-1 block text-xs font-medium">Valyuta</span><select className={ui.input} value={source.currency} onChange={(e) => setField("supplierSources", form.supplierSources.map((item) => item.id === source.id ? { ...item, currency: e.target.value as SupplierSourceForm["currency"] } : item))}><option value="TRY">TRY</option><option value="USD">USD</option><option value="EUR">EUR</option><option value="AZN">AZN</option></select></label>
                      <label><span className="mb-1 block text-xs font-medium">Müddət, gün</span><input className={ui.input} value={source.leadTimeDays} onChange={(e) => setField("supplierSources", form.supplierSources.map((item) => item.id === source.id ? { ...item, leadTimeDays: e.target.value } : item))} inputMode="numeric" /></label>
                      <button type="button" aria-label="Təchizatçını sil" title="Sil" onClick={() => { const remaining = form.supplierSources.filter((item) => item.id !== source.id); if (source.isPrimary && remaining.length) remaining[0] = { ...remaining[0], isPrimary: true }; setField("supplierSources", remaining); }} className={cx("flex h-10 w-10 items-center justify-center rounded-lg border text-lg text-rose-500", ui.borderSoft)}>×</button>
                      <label className="flex items-center gap-2 text-xs md:col-span-6"><input type="radio" name="primarySupplier" checked={source.isPrimary} onChange={() => setField("supplierSources", form.supplierSources.map((item) => ({ ...item, isPrimary: item.id === source.id })))} /><span>{source.isPrimary ? "Əsas təchizatçı" : `${index + 1}. alternativ mənbə`}</span></label>
                    </div>
                  ))}
                  {form.supplierSources.length === 0 && suppliers.length > 0 && <div className={cx("rounded-lg border border-dashed px-4 py-8 text-center text-sm", ui.borderSoft, ui.textSubtle)}>Bu məhsula hələ təchizatçı bağlanmayıb.</div>}
                </div>
              </FormSection>
            )}

            {section === "stock" && tab !== "service" && (
              <FormSection title="Stok qaydaları və mağazalar">
                <div className="grid gap-3 md:grid-cols-3">
                  <label><span className="mb-1 block text-xs font-medium">Anbar qrupu</span><input className={ui.input} value={form.stockGroup} onChange={handleChange("stockGroup")} /></label>
                  <label><span className="mb-1 block text-xs font-medium">Minimal qalıq</span><input className={ui.input} value={form.minimalQalq} onChange={handleChange("minimalQalq")} inputMode="decimal" /></label>
                  <label><span className="mb-1 block text-xs font-medium">Maksimal qalıq</span><input className={ui.input} value={form.maxStock} onChange={handleChange("maxStock")} inputMode="decimal" /></label>
                  <label><span className="mb-1 block text-xs font-medium">Minimum sifariş</span><input className={ui.input} value={form.minOrderQty} onChange={handleChange("minOrderQty")} inputMode="decimal" /></label>
                  <label><span className="mb-1 block text-xs font-medium">Maksimum sifariş</span><input className={ui.input} value={form.maxOrderQty} onChange={handleChange("maxOrderQty")} inputMode="decimal" /></label>
                  <label><span className="mb-1 block text-xs font-medium">Rəf yeri</span><input className={ui.input} value={form.shelfLocation} onChange={handleChange("shelfLocation")} /></label>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-3"><ToggleControl {...toggleProps} checked={form.negativeStockAllowed} onChange={(next) => setField("negativeStockAllowed", next)} label="Mənfi qalığa icazə ver" /><ToggleControl {...toggleProps} checked={form.modifikasiya} onChange={(next) => setField("modifikasiya", next)} label="Variantlı məhsul" hint="Rəng və ölçü variasiyaları" /><ToggleControl {...toggleProps} checked={form.initialStock} onChange={(next) => setField("initialStock", next)} label="İlkin qalıqları daxil et" /></div>
                {form.initialStock && <div className="mt-5 grid gap-3 md:grid-cols-3">{activeStores.map((store) => <label key={store.key}><span className="mb-1 block text-xs font-medium">{store.name}</span><input className={ui.input} value={form.warehouseStocks[store.key] ?? ""} onChange={(e) => setField("warehouseStocks", { ...form.warehouseStocks, [store.key]: e.target.value })} inputMode="decimal" placeholder="0" /></label>)}{activeStores.length === 0 && <div className={cx("text-sm", ui.textSubtle)}>Şirkət bölməsində aktiv mağaza yaradılmayıb.</div>}</div>}
              </FormSection>
            )}

            {section === "price" && (
              <FormSection title="Qiymətlər">
                <div className="grid gap-3 md:grid-cols-3">
                  <label><span className="mb-1 block text-xs font-medium">Başlanğıc maya dəyəri</span><input className={ui.input} value={form.maya} onChange={handleChange("maya")} inputMode="decimal" /></label>
                  <label><span className="mb-1 block text-xs font-medium">Standart satış qiyməti</span><input className={ui.input} value={form.qiymet} onChange={handleChange("qiymet")} inputMode="decimal" /></label>
                  <label><span className="mb-1 block text-xs font-medium">Topdan satış qiyməti</span><input className={ui.input} value={form.wholesalePrice} onChange={handleChange("wholesalePrice")} inputMode="decimal" /></label>
                  <label><span className="mb-1 block text-xs font-medium">Artım, %</span><input className={ui.input} value={form.markup} onChange={handleChange("markup")} inputMode="decimal" /></label>
                  <label><span className="mb-1 block text-xs font-medium">Endirim, %</span><input className={ui.input} value={form.endirim} onChange={handleChange("endirim")} inputMode="decimal" /></label>
                </div>
                <p className={cx("mt-4 text-xs", ui.textSubtle)}>Alış qiymətləri təchizatçıya görə saxlanılır və alış sənədində faktiki məbləğlə yenilənir.</p>
                <div className="mt-5 grid gap-4 md:grid-cols-2"><ToggleControl {...toggleProps} checked={form.freePrice} onChange={(next) => setField("freePrice", next)} label="Sərbəst satış qiyməti" hint="Sənəddə qiymət dəyişdirilə bilər" /><ToggleControl {...toggleProps} checked={form.storePrices} onChange={(next) => setField("storePrices", next)} label="Mağazalara görə fərqli qiymət" /></div>
              </FormSection>
            )}

            {section === "tax" && (
              <FormSection title="Vergi və gömrük məlumatları">
                <div className="grid gap-3 md:grid-cols-2"><label><span className="mb-1 block text-xs font-medium">ƏDV</span><select className={ui.input} value={form.vergi} onChange={handleChange("vergi")}><option value="">Vergi seçin</option><option value="20">ƏDV 20%</option><option value="18">ƏDV 18%</option><option value="0">0%</option></select></label><label><span className="mb-1 block text-xs font-medium">GTİP / gömrük kodu</span><input className={ui.input} value={form.tariffCode} onChange={handleChange("tariffCode")} placeholder="Gömrük tarif kodu" /></label></div>
                <div className="mt-5"><ToggleControl {...toggleProps} checked={form.taxFree} onChange={(next) => setField("taxFree", next)} label="Vergidən azaddır" /></div>
              </FormSection>
            )}

            {section === "extra" && (
              <FormSection title="Əlavə məlumatlar">
                <div className="grid gap-3 md:grid-cols-3">
                  <label><span className="mb-1 block text-xs font-medium">Rəf ömrü, gün</span><input className={ui.input} value={form.shelfLifeDays} onChange={handleChange("shelfLifeDays")} inputMode="numeric" /></label>
                  <label><span className="mb-1 block text-xs font-medium">Zəmanət, ay</span><input className={ui.input} value={form.warrantyMonths} onChange={handleChange("warrantyMonths")} inputMode="numeric" /></label>
                  <label><span className="mb-1 block text-xs font-medium">İstifadə müddəti</span><input className={ui.input} value={form.expirationDate} onChange={handleChange("expirationDate")} type="date" /></label>
                  <label className="md:col-span-2"><span className="mb-1 block text-xs font-medium">Alternativ məhsullar</span><select className={ui.input} value="" onChange={(e) => { if (e.target.value && !form.alternativeProductIds.includes(e.target.value)) setField("alternativeProductIds", [...form.alternativeProductIds, e.target.value]); }}><option value="">Məhsul əlavə et</option>{products.filter((item) => !form.alternativeProductIds.includes(String(item.id))).map((item) => <option key={item.id} value={String(item.id)}>{item.name}{item.code ? ` · ${item.code}` : ""}</option>)}</select>{form.alternativeProductIds.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{form.alternativeProductIds.map((id) => { const item = products.find((product) => String(product.id) === id); return <button key={id} type="button" onClick={() => setField("alternativeProductIds", form.alternativeProductIds.filter((value) => value !== id))} className={cx("rounded-full border px-3 py-1 text-xs", ui.borderSoft)}>{item?.name ?? id} ×</button>; })}</div>}</label>
                  <label className="md:col-span-3"><span className="mb-1 block text-xs font-medium">Xüsusiyyətlər</span><textarea className={ui.textarea} value={form.xususiyyetler} onChange={handleChange("xususiyyetler")} placeholder="Texniki xüsusiyyətlər" /></label>
                  <label className="md:col-span-3"><span className="mb-1 block text-xs font-medium">Daxili qeyd</span><textarea className={ui.textarea} value={form.note} onChange={handleChange("note")} placeholder="Yalnız əməkdaşlar üçün qeyd" /></label>
                </div>
              </FormSection>
            )}
          </div>
        </div>

        <div className={cx("flex items-center justify-between gap-3 border-t px-5 py-4", ui.borderSoft)}>
          <div className={cx("text-xs", ui.textSubtle)}>
            {form.ad.trim() ? "Kart saxlanmağa hazırdır." : "Ad sahəsi mütləqdir."}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className={cx(
                "h-9 rounded-lg border px-4 text-sm",
                ui.borderSoft,
                isDark ? "hover:bg-white/10 text-slate-100" : "hover:bg-white/65 text-slate-700"
              )}
            >
              İmtina et
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!form.ad.trim()}
              className={cx("surface-primary h-9 rounded-lg px-4 text-sm", !form.ad.trim() && "opacity-50")}
            >
              Saxla
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
