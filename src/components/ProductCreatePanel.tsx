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
  barkod: string;
  gtin: string;
  artikel: string;
  sekil: string;
  kateqoriyalar: string;
  vahid: string;
  weighted: boolean;
  packageEnabled: boolean;
  packageName: string;
  packageQty: string;
  xususiyyetler: string;
  lengthCm: string;
  widthCm: string;
  depthCm: string;
  weightKg: string;
  description: string;
  country: string;
  qiymet: string;
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
  antrepo: string;
  depo: string;
  minimalQalq: string;
  modifikasiya: boolean;
  initialStock: boolean;
  expirationDate: string;
};

export type ProductFormValues = ProductCreateForm & {
  type: "product" | "service" | "bundle";
};

type GroupOption = {
  id: number;
  name: string;
  parentId: number | null;
};

type Props = {
  visible: boolean;
  isDark?: boolean;
  defaultType?: ProductFormValues["type"];
  defaultGroupId?: number | null;
  defaultCode?: string;
  groups?: GroupOption[];
  onClose: () => void;
  onSubmit?: (values: ProductFormValues) => void;
};

const emptyForm = (groupId: number | null = null, code = ""): ProductCreateForm => ({
  ad: "",
  kod: code,
  barkod: "",
  gtin: "",
  artikel: "",
  sekil: "",
  kateqoriyalar: "",
  vahid: "əd",
  weighted: false,
  packageEnabled: false,
  packageName: "",
  packageQty: "",
  xususiyyetler: "",
  lengthCm: "",
  widthCm: "",
  depthCm: "",
  weightKg: "",
  description: "",
  country: "",
  qiymet: "",
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
  antrepo: "",
  depo: "",
  minimalQalq: "",
  modifikasiya: false,
  initialStock: false,
  expirationDate: "",
});

const generateNumericCode = (length = 13) =>
  Array.from({ length }, () => Math.floor(Math.random() * 10)).join("");

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
  borderSoft,
  isDark,
}: {
  title: string;
  children: React.ReactNode;
  borderSoft: string;
  isDark: boolean;
}) {
  return (
    <section className={cx("rounded-2xl border p-4", borderSoft, isDark ? "bg-slate-900/25" : "bg-white/55")}>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
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
  onClose,
  onSubmit,
}: Props) {
  const ui = makeUI(isDark);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [tab, setTab] = useState<ProductFormValues["type"]>(defaultType);
  const [form, setForm] = useState<ProductCreateForm>(() => emptyForm(defaultGroupId, defaultCode));

  useEffect(() => {
    if (!visible) return;
    setTab(defaultType);
    setForm(emptyForm(defaultGroupId, defaultCode));
  }, [defaultCode, defaultGroupId, defaultType, visible]);

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
    onSubmit?.({ type: tab, ...form });
    onClose();
  };

  const typeCards: { id: ProductFormValues["type"]; title: string; description: string }[] = [
    { id: "product", title: "Məhsul", description: "Stok və qalıq izlənən kart" },
    { id: "service", title: "Xidmət", description: "Anbar qalığı olmayan satış" },
    { id: "bundle", title: "Dəst", description: "Bir neçə məhsuldan ibarət" },
  ];

  const sectionProps = { borderSoft: ui.borderSoft, isDark };
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
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            {typeCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => setTab(card.id)}
                className={cx(
                  "rounded-2xl border p-3 text-center transition",
                  tab === card.id
                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-700"
                    : cx(ui.borderSoft, isDark ? "hover:bg-white/7 text-slate-200" : "hover:bg-white/75 text-slate-700")
                )}
              >
                <span className="block text-base font-semibold">{card.title}</span>
                <span className={cx("mt-1 block text-xs", tab === card.id ? "text-indigo-600" : ui.textSubtle)}>{card.description}</span>
              </button>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1.1fr_.9fr]">
            <div className="space-y-4">
              <FormSection title="Əsas məlumat" {...sectionProps}>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="md:col-span-3">
                    <span className="mb-1 block text-xs font-medium">Ad <span className="text-red-500">*</span></span>
                    <input className={ui.input} value={form.ad} onChange={handleChange("ad")} placeholder="Məhsul adını daxil edin" />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium">Məhsul kodu</span>
                    <input className={ui.input} value={form.kod} onChange={handleChange("kod")} placeholder="00250" />
                  </label>
                  <label>
                    <span className="mb-1 flex items-center justify-between text-xs font-medium">
                      Bar-kod
                      <button type="button" className="text-indigo-600" onClick={() => setField("barkod", generateNumericCode())}>Törət</button>
                    </span>
                    <input className={ui.input} value={form.barkod} onChange={handleChange("barkod")} placeholder="Ştrix-kod" />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium">Artikul</span>
                    <input className={ui.input} value={form.artikel} onChange={handleChange("artikel")} placeholder="Artikul" />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium">GTIN</span>
                    <input className={ui.input} value={form.gtin} onChange={handleChange("gtin")} placeholder="GTIN" />
                  </label>
                </div>

                <div className="mt-3">
                  <span className="mb-1 block text-xs font-medium">Şəkil</span>
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleImageFile(e.dataTransfer.files[0]);
                    }}
                    className={cx(
                      "flex min-h-24 w-full items-center justify-center rounded-xl border border-dashed px-3 text-center text-sm",
                      isDark ? "border-slate-600 hover:bg-white/5" : "border-slate-300 hover:bg-slate-50"
                    )}
                  >
                    {form.sekil ? (
                      <img src={form.sekil} alt="" className="max-h-24 rounded-lg object-contain" />
                    ) : (
                      <span>
                        <span className="block font-medium">Yükləmək üçün şəkil seçin</span>
                        <span className={cx("text-xs", ui.textSubtle)}>və ya onu bura sürüşdürün</span>
                      </span>
                    )}
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageFile(e.target.files?.[0])} />
                </div>
              </FormSection>

              <FormSection title="Təsnifat və ölçü" {...sectionProps}>
                <div className="grid gap-3 md:grid-cols-2">
                  <label>
                    <span className="mb-1 block text-xs font-medium">Kateqoriyalar</span>
                    <input className={ui.input} value={form.kateqoriyalar} onChange={handleChange("kateqoriyalar")} placeholder="Siyahıdan seçin və ya yeni ad yazın" />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium">Qovluq</span>
                    <select className={ui.input} value={form.groupId} onChange={handleChange("groupId")}>
                      <option value="">Qovluqsuz</option>
                      {groupOptions.map(({ group, level }) => (
                        <option key={group.id} value={String(group.id)}>
                          {"— ".repeat(level)}{group.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium">Ölçü vahidi</span>
                    <select className={ui.input} value={form.vahid} onChange={handleChange("vahid")}>
                      <option value="əd">əd</option>
                      <option value="mt">mt</option>
                      <option value="kg">kg</option>
                      <option value="m²">m²</option>
                      <option value="dəst">dəst</option>
                      <option value="xidmət">xidmət</option>
                    </select>
                  </label>
                  <div className="flex items-end">
                    <ToggleControl {...toggleProps} checked={form.weighted} onChange={(next) => setField("weighted", next)} label="Çəki məhsulu" />
                  </div>
                </div>
                <div className="mt-3">
                  <ToggleControl {...toggleProps} checked={form.packageEnabled} onChange={(next) => setField("packageEnabled", next)} label="Qablaşdırma əlavə et" hint="Məsələn: qutu, rulon, paket" />
                  {form.packageEnabled && (
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <input className={ui.input} value={form.packageName} onChange={handleChange("packageName")} placeholder="Qablaşdırma adı" />
                      <input className={ui.input} value={form.packageQty} onChange={handleChange("packageQty")} placeholder="Bir qablaşdırmada miqdar" />
                    </div>
                  )}
                </div>
              </FormSection>

              <FormSection title="Xüsusiyyətlər" {...sectionProps}>
                <div className="grid gap-3 md:grid-cols-4">
                  <input className={ui.input} value={form.lengthCm} onChange={handleChange("lengthCm")} placeholder="Boy, sm" />
                  <input className={ui.input} value={form.widthCm} onChange={handleChange("widthCm")} placeholder="Uzunluq, sm" />
                  <input className={ui.input} value={form.depthCm} onChange={handleChange("depthCm")} placeholder="Dərinlik, sm" />
                  <input className={ui.input} value={form.weightKg} onChange={handleChange("weightKg")} placeholder="Həqiqi çəki, kg" />
                  <textarea className={cx(ui.textarea, "md:col-span-3")} value={form.description} onChange={handleChange("description")} placeholder="Təsvir" />
                  <select className={ui.input} value={form.country} onChange={handleChange("country")}>
                    <option value="">Ölkə seçin</option>
                    <option value="Azərbaycan">Azərbaycan</option>
                    <option value="Türkiyə">Türkiyə</option>
                    <option value="Çin">Çin</option>
                    <option value="Almaniya">Almaniya</option>
                  </select>
                </div>
              </FormSection>
            </div>

            <div className="space-y-4">
              <FormSection title="Qiymətlər" {...sectionProps}>
                <div className="grid gap-3 md:grid-cols-2">
                  <input className={ui.input} value={form.alis} onChange={handleChange("alis")} placeholder="Alışın qiyməti" />
                  <input className={ui.input} value={form.markup} onChange={handleChange("markup")} placeholder="Artırılmış məbləğ, %" />
                  <input className={ui.input} value={form.qiymet} onChange={handleChange("qiymet")} placeholder="Satış qiyməti" />
                  <input className={ui.input} value={form.endirim} onChange={handleChange("endirim")} placeholder="Endirim, %" />
                </div>
                <div className="mt-3 space-y-3">
                  <ToggleControl {...toggleProps} checked={form.freePrice} onChange={(next) => setField("freePrice", next)} label="Sərbəst qiymət ilə məhsul" hint="Satış zamanı kassir qiyməti redaktə edə bilər" />
                  <ToggleControl {...toggleProps} checked={form.storePrices} onChange={(next) => setField("storePrices", next)} label="Mağazalarda fərqli satış qiymətləri" />
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <label>
                    <span className="mb-1 flex items-center justify-between text-xs font-medium">
                      Vergilər
                      <button type="button" className="text-indigo-600">Vergi yaradın</button>
                    </span>
                    <select className={ui.input} value={form.vergi} onChange={handleChange("vergi")}>
                      <option value="">Vergi seçin</option>
                      <option value="18">ƏDV 18%</option>
                      <option value="0">0%</option>
                    </select>
                  </label>
                  <div className="flex items-end">
                    <ToggleControl {...toggleProps} checked={form.taxFree} onChange={(next) => setField("taxFree", next)} label="Vergi tutulmur" />
                  </div>
                </div>
              </FormSection>

              <FormSection title="Anbar" {...sectionProps}>
                <div className="grid gap-3 md:grid-cols-2">
                  <input className={ui.input} value={form.stockGroup} onChange={handleChange("stockGroup")} placeholder="Anbar qrupu" />
                  <input className={ui.input} value={form.supplier} onChange={handleChange("supplier")} placeholder="Təchizatçı" />
                  <input className={ui.input} value={form.minimalQalq} onChange={handleChange("minimalQalq")} placeholder="Minimal qalıq" />
                  <input className={ui.input} value={form.expirationDate} onChange={handleChange("expirationDate")} placeholder="İstifadə müddəti" type="date" />
                </div>
                <div className="mt-3 space-y-3">
                  <ToggleControl {...toggleProps} checked={form.modifikasiya} onChange={(next) => setField("modifikasiya", next)} label="Modifikasiyalı məhsul" hint="Rəng, ölçü və digər variasiyalar üçün" />
                  <ToggleControl {...toggleProps} checked={form.initialStock} onChange={(next) => setField("initialStock", next)} label="İlkin qalıqları daxil edin" hint="Əvvələ qalıq sənədi yaradılacaq" />
                </div>
                {form.initialStock && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <input className={ui.input} value={form.antrepo} onChange={handleChange("antrepo")} placeholder="ERSA ANTREPO" />
                    <input className={ui.input} value={form.depo} onChange={handleChange("depo")} placeholder="ERSA DEPO" />
                  </div>
                )}
              </FormSection>
            </div>
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
