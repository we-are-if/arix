import { useEffect, useMemo, useState, type Dispatch, type SetStateAction, type SVGProps } from "react";
import { createPortal } from "react-dom";
import { requestJson } from "../api";
import DocumentCreatePanel, { type ApiDocumentDraft, type DocumentCreateKind } from "../components/DocumentCreatePanel";
import { arixPrintBaseCss, renderArixPrintFooter, renderArixPrintHeader } from "../print/arixPrintTemplate";
import { defaultPrintSettings, mergePrintSettings, type PrintFormKey, type PrintSettings } from "../print/printSettings";

const cx = (...s: (string | false | undefined)[]) => s.filter(Boolean).join(" ");

type ActivityKind = "sale" | "purchase" | "transfer" | "adjustment";
type PaymentStatus = "Ödənilib" | "Qismən" | "Gözləyir";
type FilterKey = "date" | "status" | "payment" | "kind" | "author" | "fiscal" | "orderStatus" | "recipient" | "sender";
type PrintPalletMode = "withoutPallets" | "withPallets";
type PrintDetailMode = "compact" | "detail";
type PrintPaperMode = "portrait" | "landscape";
type PrintFormMode = "standard" | "customs" | "orderConfirmation" | "proforma" | "commercial" | "packingList";
type PackingStrategy = "keepSelection" | "splitTen" | "keepPartial";
type DocumentPrintOptions = {
  formMode: PrintFormMode;
  palletMode: PrintPalletMode;
  detailMode: PrintDetailMode;
  paperMode: PrintPaperMode;
  packingStrategy: PackingStrategy;
};
type ActivityFilters = {
  date: string;
  status: string;
  payment: string;
  kind: ActivityKind | "";
  author: string;
  fiscal: string;
  orderStatus: string;
  recipient: string;
  sender: string;
};
type ActivityRow = {
  id: number;
  documentId?: string;
  documentType?: string;
  documentDate?: string;
  date: string;
  time: string;
  kind: ActivityKind;
  status: "Təsdiqlənib" | "Hazırlanır" | "Ləğv edilib";
  order: string;
  items: number;
  total: number;
  paid: number;
  sender: string;
  recipient: string;
  author: string;
  payment: PaymentStatus;
};
type ProductLine = {
  productId: number;
  name: string;
  barcode: string;
  sku: string;
  variant: string;
  qty: number;
  price: number;
  discount: number;
  total: number;
  warehouse: string;
  available: number;
};
type ApiDocumentLine = {
  productId?: number;
  name?: string;
  barcode?: string;
  sku?: string;
  variant?: string;
  qty?: number;
  price?: number;
  discount?: number;
  total?: number;
  warehouse?: string;
  available?: number;
};
type ApiRoll = {
  id?: string;
  productId?: number;
  rollNo?: string;
  width?: string;
  thickness?: string;
  qty?: string | number;
  netKg?: string | number;
  grossKg?: string | number;
};
type ApiMovementRoll = ApiRoll & {
  rollId?: string;
  containerKey?: string;
  containerNumber?: string;
  declaration?: string;
  palletId?: string;
  palletNumber?: string;
};
type ApiMovementPallet = {
  id?: string;
  number?: string;
  fullPallet?: boolean;
  rolls?: ApiMovementRoll[];
};
type ApiMovementContainer = {
  key?: string;
  declaration?: string;
  number?: string;
  pallets?: ApiMovementPallet[];
};
type ApiPallet = {
  id?: string;
  number?: string;
  rolls?: ApiRoll[];
};
type ApiContainer = {
  id?: string;
  number?: string;
  invoice?: string;
  customsStatus?: string;
  pallets?: ApiPallet[];
};
type ApiDocument = {
  id?: string | number;
  type?: string;
  saleMode?: string;
  exportMode?: boolean;
  status?: string;
  posted?: boolean;
  documentDate?: string;
  createdAt?: string;
  account?: string;
  fromAccount?: string;
  toAccount?: string;
  counterpartyName?: string;
  author?: string;
  total?: number;
  paid?: number;
  paymentSummary?: {
    total?: number;
    paid?: number;
    remaining?: number;
    status?: string;
  };
  lines?: ApiDocumentLine[];
  bondedStock?: {
    containers?: ApiContainer[];
    summary?: {
      containerCount?: number;
      palletCount?: number;
      rollCount?: number;
      qty?: number;
      netKg?: number;
      grossKg?: number;
    };
  };
  movementSelection?: {
    containers?: ApiMovementContainer[];
  };
};

const makeUI = (isDark: boolean) => ({
  card: `rounded-2xl border ${isDark ? "glass-panel-dark" : "glass-panel"}`,
  ring: isDark ? "ring-1 ring-white/10" : "ring-1 ring-white/55",
  input: [
    "w-full h-10 px-3 rounded-xl border outline-none placeholder-slate-400",
    isDark
      ? "glass-control-dark text-slate-100 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
      : "glass-control text-slate-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25",
  ].join(" "),
  iconBtn: `w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? "hover:bg-white/10" : "hover:bg-white/65"}`,
  borderSoft: isDark ? "border-white/10" : "border-white/60",
  theadSticky: `sticky top-0 z-10 ${isDark ? "bg-slate-950/35" : "bg-white/45"} backdrop-blur-xl`,
  rowHover: isDark ? "hover:bg-white/5" : "hover:bg-slate-50",
  subtle: isDark ? "text-slate-400" : "text-slate-500",
  primaryBtn: "surface-primary",
});

const I = {
  Search: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="11" cy="11" r="7" /><path d="M21 21l-3.5-3.5" />
    </svg>
  ),
  Filter: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 5h18" /><path d="M7 12h10" /><path d="M10 19h4" />
    </svg>
  ),
  X: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  Tag: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M20 13l-7 7-9-9V4h7l9 9z" /><circle cx="8.5" cy="8.5" r="1.5" />
    </svg>
  ),
  Check: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 12.5 10 17l9-10" />
    </svg>
  ),
  Box: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m3 7 9-4 9 4-9 4-9-4Z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" />
    </svg>
  ),
  Edit: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
    </svg>
  ),
  Printer: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M6 9V3h12v6" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><path d="M6 14h12v7H6z" />
    </svg>
  ),
  Undo: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-1" />
    </svg>
  ),
  Calendar: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M8 2v4M16 2v4" /><path d="M3 9h18" /><path d="M5 4h14a2 2 0 0 1 2 2v14H3V6a2 2 0 0 1 2-2Z" />
    </svg>
  ),
  External: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M7 17 17 7" /><path d="M9 7h8v8" />
    </svg>
  ),
  Download: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3v12" /><path d="M8 11l4 4 4-4" /><path d="M21 21H3" />
    </svg>
  ),
};

const rows: ActivityRow[] = [
  { id: 2363, date: "20 may", time: "15:17", kind: "sale", status: "Təsdiqlənib", order: "Satış sifarişi #2363", items: 2, total: 4559.62, paid: 4559.62, sender: "ERSA DEPO", recipient: "SILKA COMPANY", author: "Arif Mahmud", payment: "Ödənilib" },
  { id: 2362, date: "20 may", time: "15:16", kind: "sale", status: "Təsdiqlənib", order: "Satış sifarişi #2362", items: 1, total: 500.98, paid: 500.98, sender: "ERSA DEPO", recipient: "DURU PVC ORMAN ÜRÜNLERİ", author: "Arif Mahmud", payment: "Ödənilib" },
  { id: 2361, date: "20 may", time: "15:16", kind: "sale", status: "Təsdiqlənib", order: "Satış sifarişi #2361", items: 1, total: 84.49, paid: 84.49, sender: "ERSA DEPO", recipient: "RAN KAPAK", author: "Arif Mahmud", payment: "Ödənilib" },
  { id: 2359, date: "19 may", time: "17:06", kind: "sale", status: "Təsdiqlənib", order: "Satış sifarişi #2359", items: 4, total: 183.61, paid: 183.61, sender: "ERSA DEPO", recipient: "PAŞA ORMAN", author: "Arif Mahmud", payment: "Ödənilib" },
  { id: 2358, date: "19 may", time: "17:05", kind: "transfer", status: "Hazırlanır", order: "Anbar köçürməsi #2358", items: 7, total: 0, paid: 0, sender: "ERSA ANTREPO", recipient: "ERSA DEPO", author: "Ekrem Tiryaki", payment: "Gözləyir" },
  { id: 2357, date: "19 may", time: "17:03", kind: "purchase", status: "Təsdiqlənib", order: "Alış sənədi #2357", items: 12, total: 2380.7, paid: 1800, sender: "Global Textile", recipient: "ERSA ANTREPO", author: "Arif Mahmud", payment: "Qismən" },
  { id: 2356, date: "19 may", time: "17:02", kind: "sale", status: "Təsdiqlənib", order: "Satış sifarişi #2356", items: 2, total: 70.97, paid: 70.97, sender: "ERSA DEPO", recipient: "DURU PVC ORMAN ÜRÜNLERİ", author: "Arif Mahmud", payment: "Ödənilib" },
  { id: 2355, date: "19 may", time: "17:02", kind: "sale", status: "Təsdiqlənib", order: "Satış sifarişi #2355", items: 1, total: 852, paid: 852, sender: "ERSA DEPO", recipient: "AKÇA KAPAK", author: "Arif Mahmud", payment: "Ödənilib" },
  { id: 2350, date: "15 may", time: "16:52", kind: "sale", status: "Təsdiqlənib", order: "Satış sifarişi #2350", items: 2, total: 6249.42, paid: 6249.42, sender: "ERSA DEPO", recipient: "DURU PVC ORMAN ÜRÜNLERİ", author: "Arif Mahmud", payment: "Ödənilib" },
  { id: 2349, date: "15 may", time: "16:27", kind: "adjustment", status: "Hazırlanır", order: "Sayım düzəlişi #2349", items: 18, total: 0, paid: 0, sender: "Sayım", recipient: "ERSA DEPO", author: "Sistem", payment: "Gözləyir" },
  { id: 2348, date: "15 may", time: "16:26", kind: "sale", status: "Təsdiqlənib", order: "Satış sifarişi #2348", items: 1, total: 2377.08, paid: 2377.08, sender: "ERSA DEPO", recipient: "Global Design", author: "Arif Mahmud", payment: "Ödənilib" },
];

const defaultProductLines: ProductLine[] = [
  { productId: 11003, name: "Bute Beyaz", barcode: "11003", sku: "ERSA 003", variant: "Beyaz / 18 mm / Parlaq", qty: 240, price: 3.27, discount: 0, total: 783.84, warehouse: "ERSA DEPO", available: 10638 },
  { productId: 11011, name: "Folyolu Satin Inci", barcode: "11011", sku: "ERSA 011", variant: "Inci / 18 mm / Satin", qty: 300, price: 4.26, discount: 0, total: 1278, warehouse: "ERSA DEPO", available: 1410 },
  { productId: 11510, name: "Soft Touch Premium Beyaz", barcode: "11510", sku: "ERSA 510", variant: "Premium / Mat / 18 mm", qty: 200, price: 5.96, discount: 0, total: 1192, warehouse: "ERSA ANTREPO", available: 778 },
  { productId: 11500, name: "Soft Touch Beyaz", barcode: "11500", sku: "ERSA 500", variant: "Standart / Mat / 18 mm", qty: 200, price: 5.96, discount: 0, total: 1192, warehouse: "ERSA DEPO", available: 918 },
  { productId: 11010, name: "Folyolu Satin Beyaz", barcode: "11010", sku: "ERSA 010", variant: "Beyaz / Satin / 18 mm", qty: 200, price: 4.12, discount: 0, total: 823.6, warehouse: "ERSA DEPO", available: 1180 },
  { productId: 11015, name: "Folyolu Satin Kaya Gri", barcode: "11015", sku: "ERSA 015", variant: "Kaya gri / Satin / 18 mm", qty: 200, price: 4.26, discount: 0, total: 852, warehouse: "ERSA ANTREPO", available: 385 },
];

const activityProductLines: Record<number, ProductLine[]> = {
  2363: defaultProductLines.slice(0, 3),
  2362: defaultProductLines.slice(3, 4),
  2361: defaultProductLines.slice(4, 5),
  2359: defaultProductLines.slice(0, 4).map((line, index) => ({ ...line, qty: [40, 25, 18, 12][index], total: [130.8, 106.5, 107.28, 71.52][index] })),
  2358: defaultProductLines.map((line, index) => ({ ...line, qty: [18, 24, 12, 16, 20, 8][index], total: 0 })),
  2357: defaultProductLines.map((line, index) => ({ ...line, qty: [120, 80, 60, 75, 95, 40][index], price: [2.9, 3.8, 5.1, 5.1, 3.6, 3.8][index], total: [348, 304, 306, 382.5, 342, 152][index] })),
};
void rows;
void defaultProductLines;
void activityProductLines;

const money = (value: number) =>
  value.toLocaleString("az-Latn-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const printDefaultOptions: DocumentPrintOptions = {
  formMode: "standard",
  palletMode: "withPallets",
  detailMode: "compact",
  paperMode: "portrait",
  packingStrategy: "keepSelection",
};

const kindLabel = (kind: ActivityKind) =>
  kind === "sale" ? "Satış" : kind === "purchase" ? "Alış" : kind === "transfer" ? "Transfer" : "Düzəliş";

const activityAccent = (row: ActivityRow) => {
  if (row.status === "Ləğv edilib") return "bg-rose-500";

  const type = row.documentType || row.kind;
  if (type === "sale") return "bg-teal-500";
  if (type === "purchase") return "bg-violet-500";
  if (type === "saleReturn") return "bg-amber-500";
  if (type === "purchaseReturn") return "bg-rose-500";
  if (type === "movement" || type === "transfer") return "bg-sky-500";
  if (type === "inventory") return "bg-fuchsia-500";
  if (type === "openingBalance") return "bg-cyan-500";
  if (type === "writeOff") return "bg-orange-500";
  return "bg-amber-500";
};

const emptyFilters: ActivityFilters = {
  date: "",
  status: "",
  payment: "",
  kind: "",
  author: "",
  fiscal: "",
  orderStatus: "",
  recipient: "",
  sender: "",
};

const filterLabels: Record<FilterKey, string> = {
  date: "Tarix",
  status: "Status",
  payment: "Ödəniş",
  kind: "Tip",
  author: "Müəllif",
  fiscal: "Fiscal receipt",
  orderStatus: "Sifariş statusu",
  recipient: "Alan",
  sender: "Göndərən",
};

const peopleOptions = ["Ekrem Tiryaki", "Serkan Şeremet", "Sami", "Mustafa Yazman", "Arif Mahmud", "Sistem"];
const entityGroups = [
  { title: "Anbarlar", options: ["ERSA ANTREPO", "ERSA DEPO"] },
  { title: "Təchizatçılar", options: ["Shanghai Colorful Industry Co., LTD", "Orchard Decorative Materials", "Global Textile"] },
  { title: "Müştərilər", options: ["Global Design", "Kocayusuf", "Harun Tuncer", "DURU PVC ORMAN ÜRÜNLERİ", "SILKA COMPANY"] },
];

const fiscalValue = (row: ActivityRow) => (row.id % 2 === 0 ? "Bəli" : "Xeyr");

void peopleOptions;
void entityGroups;

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const htmlCell = (value: unknown, align: "left" | "right" = "left") =>
  `<td class="${align === "right" ? "right" : ""}">${escapeHtml(value)}</td>`;

const renderPrintTable = (headers: string[], rows: (string | number)[][]) => `
  <table class="arix-table">
    <thead>
      <tr>${headers.map((header, index) => `<th class="${index > 0 ? "right" : ""}">${escapeHtml(header)}</th>`).join("")}</tr>
    </thead>
    <tbody>
      ${rows.map((row) => `<tr>${row.map((cell, index) => htmlCell(cell, index > 0 ? "right" : "left")).join("")}</tr>`).join("")}
    </tbody>
  </table>
`;

const renderPalletPrintHtml = (containers: ApiContainer[], products: ProductLine[], mode: PrintDetailMode) => {
  if (containers.length === 0) return "";

  return `
    <section class="block">
      <h2>Palet detalları</h2>
      ${containers.map((container, containerIndex) => {
        const containerRolls = (container.pallets ?? []).flatMap((pallet) => pallet.rolls ?? []);
        const totals = detailRollTotals(containerRolls);
        return `
          <div class="container-card">
            <div class="container-head">
              <div>
                <strong>${escapeHtml(container.number || `Konteyner ${containerIndex + 1}`)}</strong>
                <span>${container.invoice ? `Invoice / BL: ${escapeHtml(container.invoice)} · ` : ""}${container.customsStatus === "released" ? "Sərbəst" : "Antrepo"}</span>
              </div>
              <div class="chips">
                <span>${container.pallets?.length ?? 0} palet</span>
                <span>${containerRolls.length} rulo</span>
                <span>${totals.qty.toLocaleString("az-Latn-AZ")} miqdar</span>
              </div>
            </div>
            ${(container.pallets ?? []).map((pallet, palletIndex) => {
              const palletRolls = pallet.rolls ?? [];
              const palletTotals = detailRollTotals(palletRolls);
              const compactRows = compactRollGroups(palletRolls, products).map((group) => [
                group.productName,
                group.rollCount,
                group.lengthLabel,
                group.thicknessLabel,
                group.qty.toLocaleString("az-Latn-AZ"),
                group.netKg.toLocaleString("az-Latn-AZ"),
                group.grossKg.toLocaleString("az-Latn-AZ"),
              ]);
              const detailRows = palletRolls.map((roll) => [
                rollProductName(roll, products),
                roll.rollNo || "-",
                roll.width || "-",
                roll.thickness || "-",
                toDetailNumber(roll.qty).toLocaleString("az-Latn-AZ"),
                toDetailNumber(roll.netKg).toLocaleString("az-Latn-AZ"),
                toDetailNumber(roll.grossKg).toLocaleString("az-Latn-AZ"),
              ]);
              return `
                <div class="pallet-card">
                  <div class="pallet-head">
                    <strong>${escapeHtml(palletDisplayName(pallet, palletIndex))}</strong>
                    <span>${palletRolls.length} rulo · ${palletTotals.qty.toLocaleString("az-Latn-AZ")} miqdar · ${palletTotals.netKg.toLocaleString("az-Latn-AZ")} / ${palletTotals.grossKg.toLocaleString("az-Latn-AZ")} kg</span>
                  </div>
                  ${mode === "compact"
                    ? renderPrintTable(["Məhsul", "Rulo sayı", "Uzunluq", "Qalınlıq", "Miqdar", "Net kg", "Gross kg"], compactRows)
                    : renderPrintTable(["Məhsul", "Rulo", "Uzunluq", "Qalınlıq", "Miqdar", "Net kg", "Gross kg"], detailRows)}
                </div>
              `;
            }).join("")}
          </div>
        `;
      }).join("")}
    </section>
  `;
};

type CustomsExportRow = {
  productId: number;
  productName: string;
  code: string;
  packageCount: number;
  qty: number;
  unitPrice: number;
  totalPrice: number;
  netKg: number;
  grossKg: number;
  pallet: string;
  rollNumbers: string;
  fullPallet: boolean;
  showPalletCell: boolean;
  palletRowSpan: number;
};

type CustomsDeclarationSheet = {
  declaration: string;
  containers: string[];
  rows: CustomsExportRow[];
  totals: {
    packageCount: number;
    qty: number;
    totalPrice: number;
    netKg: number;
    grossKg: number;
  };
};

const formatCustomsDate = (value?: string) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return value || "";
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
};

const shortPalletNumber = (value?: string) => {
  const text = String(value || "").trim();
  return text.match(/(\d+)\s*$/)?.[1] || text || "-";
};

const compressRollNumbers = (values: string[]) => {
  const numbers = Array.from(new Set(values
    .map((value) => String(value || "").trim().match(/(\d+)\s*$/)?.[1])
    .filter(Boolean)
    .map(Number)))
    .sort((a, b) => a - b);
  if (numbers.length === 0) return "-";
  const ranges: Array<[number, number]> = [];
  numbers.forEach((number) => {
    const last = ranges[ranges.length - 1];
    if (last && number === last[1] + 1) last[1] = number;
    else ranges.push([number, number]);
  });
  return ranges.map(([start, end]) => (
    start === end ? String(start) : `${start}–${end}`
  )).join(", ");
};

const buildCustomsSheets = (
  document: ApiDocument | undefined,
  products: ProductLine[],
): CustomsDeclarationSheet[] => {
  const declarations = new Map<string, { containers: Set<string>; rows: CustomsExportRow[] }>();

  for (const container of document?.movementSelection?.containers ?? []) {
    const declaration = String(container.declaration || container.number || "Bəyannaməsiz");
    const current = declarations.get(declaration) ?? { containers: new Set<string>(), rows: [] };
    if (container.number) current.containers.add(container.number);

    for (const pallet of container.pallets ?? []) {
      const grouped = new Map<string, { productIds: Set<number>; productName: string; codes: Set<string>; rolls: ApiMovementRoll[] }>();
      for (const roll of pallet.rolls ?? []) {
        const productId = Number(roll.productId ?? 0);
        const product = products.find((item) => item.productId === productId);
        const productName = product?.name ?? "Məhsul";
        const code = product?.sku || product?.barcode || String(productId || "");
        const key = productName.trim().toLocaleLowerCase("tr-TR");
        const group = grouped.get(key) ?? { productIds: new Set<number>(), productName, codes: new Set<string>(), rolls: [] };
        group.productIds.add(productId);
        if (code) group.codes.add(code);
        group.rolls.push(roll);
        grouped.set(key, group);
      }
      const palletGroups = Array.from(grouped.values());
      const palletRollNumbers = pallet.fullPallet
        ? "full"
        : compressRollNumbers((pallet.rolls ?? []).map((roll) => String(roll.rollNo || "")));
      palletGroups.forEach((group, groupIndex) => {
        const productId = Array.from(group.productIds)[0] ?? 0;
        const rolls = group.rolls;
        const product = products.find((item) => item.productId === productId);
        const qty = rolls.reduce((sum, roll) => sum + toDetailNumber(roll.qty), 0);
        const unitPrice = Number(product?.price ?? 0);
        current.rows.push({
          productId,
          productName: group.productName,
          code: Array.from(group.codes).join(", "),
          packageCount: rolls.length,
          qty,
          unitPrice,
          totalPrice: qty * unitPrice,
          netKg: rolls.reduce((sum, roll) => sum + toDetailNumber(roll.netKg), 0),
          grossKg: rolls.reduce((sum, roll) => sum + toDetailNumber(roll.grossKg), 0),
          pallet: shortPalletNumber(pallet.number),
          rollNumbers: palletRollNumbers,
          fullPallet: Boolean(pallet.fullPallet),
          showPalletCell: groupIndex === 0,
          palletRowSpan: palletGroups.length,
        });
      });
    }
    declarations.set(declaration, current);
  }

  return Array.from(declarations.entries()).map(([declaration, value]) => ({
    declaration,
    containers: Array.from(value.containers),
    rows: value.rows,
    totals: value.rows.reduce(
      (sum, row) => ({
        packageCount: sum.packageCount + row.packageCount,
        qty: sum.qty + row.qty,
        totalPrice: sum.totalPrice + row.totalPrice,
        netKg: sum.netKg + row.netKg,
        grossKg: sum.grossKg + row.grossKg,
      }),
      { packageCount: 0, qty: 0, totalPrice: 0, netKg: 0, grossKg: 0 }
    ),
  }));
};

const renderCustomsPrintHtml = (
  row: ActivityRow,
  document: ApiDocument | undefined,
  products: ProductLine[],
  printSettings: PrintSettings,
) => {
  const sheets = buildCustomsSheets(document, products);
  const formNumber = String(row.order || row.documentId || row.id).replace(/^Yerdəyişmə\s*/i, "");
  const form = printSettings.forms.customs;

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8" />
  <title>AriX Gömrük Forması ${escapeHtml(formNumber)}</title>
  <style>
    @page { size: A4 landscape; margin: 9mm; }
    ${arixPrintBaseCss}
    .sheet { min-height: 185mm; page-break-after: always; }
    .sheet:last-child { page-break-after: auto; }
    .customs-declaration { margin-bottom: 7px; border: 1px solid var(--arix-line); border-left: 3px solid var(--arix-primary); background: var(--arix-soft); color: var(--arix-ink); padding: 7px 9px; font-size: 9px; font-weight: 600; }
    td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
    td.center, th.center { text-align: center; }
    td.pallet { background: var(--arix-soft-indigo); color: var(--arix-ink); font-size: 9px; font-weight: 600; vertical-align: middle; }
    td.full { background: var(--arix-soft); color: var(--arix-ink); font-size: 9px; font-weight: 600; vertical-align: middle; text-align: center; }
    .empty { padding: 30px; text-align: center; border: 1px solid var(--arix-line); color: var(--arix-muted); }
  </style>
</head>
<body>
  ${sheets.length === 0 ? `<div class="empty">Bu sənəddə gömrük forması üçün seçilmiş rulo yoxdur.</div>` : sheets.map((sheet) => `
    <section class="sheet">
      ${renderArixPrintHeader({
        title: form.title,
        subtitle: form.subtitle,
        documentNo: formNumber,
        date: formatCustomsDate(document?.documentDate || row.documentDate),
        status: row.status,
        source: sheet.containers.join(", ") || "-",
        settings: printSettings,
        form,
      })}
      <div class="customs-declaration">Bəyannamə · ${escapeHtml(sheet.declaration)}</div>
      <table class="arix-table">
        <thead><tr>
          <th class="center">No</th><th>Ürün</th><th>Kod</th><th class="center">Kap</th><th class="num">MT</th>
          <th class="num">Birim Fiyat</th><th class="num">Toplam Fiyat</th><th class="num">Net Weight</th>
          <th class="num">Gross Weight</th><th class="center">Palet</th><th>Rulo</th>
        </tr></thead>
        <tbody>
          ${sheet.rows.map((item, index) => `<tr>
            <td class="center">${index + 1}</td><td>${escapeHtml(item.productName)}</td><td>${escapeHtml(item.code)}</td>
            <td class="center">${item.packageCount} kap</td><td class="num">${money(item.qty)} mt</td>
            <td class="num">$${money(item.unitPrice)}</td><td class="num">$${money(item.totalPrice)}</td>
            <td class="num">${money(item.netKg)} kg</td><td class="num">${money(item.grossKg)} kg</td>
            ${item.showPalletCell ? `<td class="center pallet" rowspan="${item.palletRowSpan}">${escapeHtml(item.pallet)}</td><td class="${item.fullPallet ? "full" : ""}" rowspan="${item.palletRowSpan}">${escapeHtml(item.rollNumbers)}</td>` : ""}
          </tr>`).join("")}
        </tbody>
        <tfoot><tr>
          <td colspan="3" class="num">TOPLAM</td><td class="center">${sheet.totals.packageCount} kap</td>
          <td class="num">${money(sheet.totals.qty)} mt</td><td></td><td class="num">$${money(sheet.totals.totalPrice)}</td>
          <td class="num">${money(sheet.totals.netKg)} kg</td><td class="num">${money(sheet.totals.grossKg)} kg</td><td colspan="2"></td>
        </tr></tfoot>
      </table>
      ${renderArixPrintFooter(`${formNumber} · ${sheet.declaration}`, printSettings, form)}
    </section>
  `).join("")}
  <script>window.addEventListener("load", () => setTimeout(() => window.print(), 250));</script>
</body>
</html>`;
};

const xmlCell = (value: string | number, style = "Text", type: "String" | "Number" = "String") =>
  `<Cell ss:StyleID="${style}"><Data ss:Type="${type}">${escapeHtml(value)}</Data></Cell>`;

const xmlMergeDownCell = (value: string | number, mergeDown: number, style = "Text") =>
  `<Cell ss:StyleID="${style}"${mergeDown > 0 ? ` ss:MergeDown="${mergeDown}"` : ""}><Data ss:Type="String">${escapeHtml(value)}</Data></Cell>`;

const safeWorksheetName = (value: string, index: number) =>
  (value.replace(/[\\/:?*\[\]]/g, " ").trim() || `Bəyannamə ${index + 1}`).slice(0, 31);

const buildCustomsExcelXml = (
  row: ActivityRow,
  document: ApiDocument | undefined,
  products: ProductLine[],
  printSettings: PrintSettings,
) => {
  const sheets = buildCustomsSheets(document, products);
  const formNumber = String(row.order || row.documentId || row.id).replace(/^Yerdəyişmə\s*/i, "");
  const form = printSettings.forms.customs;
  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Arial" ss:Size="10" ss:Color="#1E293B"/><Alignment ss:Vertical="Center"/></Style>
  <Style ss:ID="Text"><Font ss:FontName="Arial" ss:Size="10" ss:Color="#1E293B"/><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/></Borders></Style>
  <Style ss:ID="Title"><Font ss:FontName="Arial" ss:Bold="1" ss:Size="14" ss:Color="#1E293B"/><Alignment ss:Horizontal="Right" ss:Vertical="Center"/></Style>
  <Style ss:ID="Company"><Font ss:FontName="Arial" ss:Bold="1" ss:Size="15" ss:Color="#4F46E5"/><Alignment ss:WrapText="1" ss:Vertical="Center"/></Style>
  <Style ss:ID="Meta"><Font ss:FontName="Arial" ss:Size="10" ss:Color="#475569"/><Interior ss:Color="#F7F8FB" ss:Pattern="Solid"/><Alignment ss:Vertical="Center"/></Style>
  <Style ss:ID="Header"><Font ss:FontName="Arial" ss:Bold="1" ss:Size="10" ss:Color="#475569"/><Interior ss:Color="#F3F4F8" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/></Borders></Style>
  <Style ss:ID="Number"><Font ss:FontName="Arial" ss:Size="10" ss:Color="#1E293B"/><NumberFormat ss:Format="#,##0.00"/><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/></Borders></Style>
  <Style ss:ID="Pallet"><Font ss:FontName="Arial" ss:Bold="1" ss:Size="10" ss:Color="#1E293B"/><Interior ss:Color="#F3F3FF" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/></Borders></Style>
  <Style ss:ID="Full"><Font ss:FontName="Arial" ss:Bold="1" ss:Size="10" ss:Color="#1E293B"/><Interior ss:Color="#F7F8FB" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/></Borders></Style>
  <Style ss:ID="Total"><Font ss:FontName="Arial" ss:Bold="1" ss:Size="10" ss:Color="#1E293B"/><Interior ss:Color="#F3F4F8" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/></Borders></Style>
 </Styles>
 ${sheets.map((sheet, sheetIndex) => `
 <Worksheet ss:Name="${escapeHtml(safeWorksheetName(sheet.declaration, sheetIndex))}">
  <Table>
   ${[42, 180, 95, 65, 80, 85, 100, 95, 100, 65, 180].map((width) => `<Column ss:Width="${width}"/>`).join("")}
   <Row ss:Height="34"><Cell ss:MergeAcross="3" ss:StyleID="Company"><Data ss:Type="String">AriX</Data></Cell><Cell ss:MergeAcross="6" ss:StyleID="Title"><Data ss:Type="String">${escapeHtml(form.title)}</Data></Cell></Row>
   <Row><Cell ss:MergeAcross="3" ss:StyleID="Meta"><Data ss:Type="String">Konteyner: ${escapeHtml(sheet.containers.join(", ") || "-")}</Data></Cell><Cell ss:MergeAcross="3" ss:StyleID="Meta"><Data ss:Type="String">Sənəd: ${escapeHtml(formNumber)}</Data></Cell><Cell ss:MergeAcross="2" ss:StyleID="Meta"><Data ss:Type="String">Tarix: ${escapeHtml(formatCustomsDate(document?.documentDate || row.documentDate))}</Data></Cell></Row>
   <Row><Cell ss:MergeAcross="10" ss:StyleID="Header"><Data ss:Type="String">${escapeHtml(sheet.declaration)}</Data></Cell></Row>
   <Row>${["No", "Ürün", "Kod", "Kap", "MT", "Birim Fiyat", "Toplam Fiyat", "Net Weight", "Gross Weight", "Palet", "Rulo"].map((value) => xmlCell(value, "Header")).join("")}</Row>
   ${sheet.rows.map((item, index) => `<Row>${[
     xmlCell(index + 1, "Text", "Number"),
     xmlCell(item.productName),
     xmlCell(item.code),
     xmlCell(item.packageCount, "Text", "Number"),
     xmlCell(item.qty, "Number", "Number"),
     xmlCell(item.unitPrice, "Number", "Number"),
     xmlCell(item.totalPrice, "Number", "Number"),
     xmlCell(item.netKg, "Number", "Number"),
     xmlCell(item.grossKg, "Number", "Number"),
     item.showPalletCell ? xmlMergeDownCell(item.pallet, item.palletRowSpan - 1, "Pallet") : "",
     item.showPalletCell ? xmlMergeDownCell(item.rollNumbers, item.palletRowSpan - 1, item.fullPallet ? "Full" : "Text") : "",
   ].join("")}</Row>`).join("")}
   <Row>${[
     `<Cell ss:MergeAcross="2" ss:StyleID="Total"><Data ss:Type="String">TOPLAM</Data></Cell>`,
     xmlCell(sheet.totals.packageCount, "Total", "Number"),
     xmlCell(sheet.totals.qty, "Total", "Number"),
     xmlCell("", "Total"),
     xmlCell(sheet.totals.totalPrice, "Total", "Number"),
     xmlCell(sheet.totals.netKg, "Total", "Number"),
     xmlCell(sheet.totals.grossKg, "Total", "Number"),
     xmlCell("", "Total"),
     xmlCell("", "Total"),
   ].join("")}</Row>
   ${form.showFooter && (form.footerInfo || form.footerNote) ? `<Row><Cell ss:MergeAcross="10" ss:StyleID="Meta"><Data ss:Type="String">${escapeHtml([form.footerInfo, form.footerNote].filter(Boolean).join(" · "))}</Data></Cell></Row>` : ""}
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>5</SplitHorizontal><TopRowBottomPane>5</TopRowBottomPane><PageSetup><Layout x:Orientation="Landscape"/></PageSetup></WorksheetOptions>
 </Worksheet>`).join("")}
</Workbook>`;
};

const buildPackingExcelXml = (
  row: ActivityRow,
  document: ApiDocument | undefined,
  products: ProductLine[],
  options: DocumentPrintOptions,
  printSettings: PrintSettings,
) => {
  const rows = applyPackingStrategy(buildPackingRows(document, products), options);
  const form = printSettings.forms.packingList;
  const docNo = String(row.documentId || row.id);
  const date = formatCustomsDate(document?.documentDate || row.documentDate);
  const totals = rows.reduce(
    (sum, item) => ({
      pallets: sum.pallets.add(item.pallet),
      roll: sum.roll + item.rollCount,
      qty: sum.qty + item.qty,
      sqm: sum.sqm + item.sqm,
      netKg: sum.netKg + item.netKg,
      grossKg: sum.grossKg + item.grossKg,
    }),
    { pallets: new Set<string>(), roll: 0, qty: 0, sqm: 0, netKg: 0, grossKg: 0 }
  );
  const strategyText = options.packingStrategy === "splitTen"
    ? "20 rulo hallarında 10/10 bölgü tətbiq oluna bilər"
    : options.packingStrategy === "keepPartial"
      ? "Parçalı palet olduğu kimi saxlanılır"
      : "Tam paletlər parçalanmır, eyni bəyannamə ruloları birlikdə saxlanılır";

  return `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Styles>
  <Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Arial" ss:Size="10" ss:Color="#1E293B"/><Alignment ss:Vertical="Center"/></Style>
  <Style ss:ID="Text"><Font ss:FontName="Arial" ss:Size="10" ss:Color="#1E293B"/><Alignment ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/></Borders></Style>
  <Style ss:ID="Title"><Font ss:FontName="Arial" ss:Bold="1" ss:Size="16" ss:Color="#2F6973"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/></Style>
  <Style ss:ID="Meta"><Font ss:FontName="Arial" ss:Size="10" ss:Color="#475569"/><Interior ss:Color="#F7F8FB" ss:Pattern="Solid"/><Alignment ss:Vertical="Center"/></Style>
  <Style ss:ID="Header"><Font ss:FontName="Arial" ss:Bold="1" ss:Size="10" ss:Color="#2F6973"/><Interior ss:Color="#EEF5F6" ss:Pattern="Solid"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/></Borders></Style>
  <Style ss:ID="Number"><Font ss:FontName="Arial" ss:Size="10" ss:Color="#1E293B"/><NumberFormat ss:Format="#,##0.00"/><Alignment ss:Horizontal="Right" ss:Vertical="Center"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/></Borders></Style>
  <Style ss:ID="Total"><Font ss:FontName="Arial" ss:Bold="1" ss:Size="10" ss:Color="#1E293B"/><Interior ss:Color="#F7F8FB" ss:Pattern="Solid"/><NumberFormat ss:Format="#,##0.00"/><Borders><Border ss:Position="Bottom" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Left" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Right" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/><Border ss:Position="Top" ss:LineStyle="Continuous" ss:Weight="1" ss:Color="#DFE5EE"/></Borders></Style>
 </Styles>
 <Worksheet ss:Name="Packing List">
  <Table>
   ${[42, 70, 220, 95, 70, 85, 85, 105, 115, 160].map((width) => `<Column ss:Width="${width}"/>`).join("")}
   <Row ss:Height="34"><Cell ss:MergeAcross="9" ss:StyleID="Title"><Data ss:Type="String">${escapeHtml(form.title)}</Data></Cell></Row>
   <Row><Cell ss:MergeAcross="2" ss:StyleID="Meta"><Data ss:Type="String">Sənəd: ${escapeHtml(docNo)}</Data></Cell><Cell ss:MergeAcross="2" ss:StyleID="Meta"><Data ss:Type="String">Tarix: ${escapeHtml(date)}</Data></Cell><Cell ss:MergeAcross="4" ss:StyleID="Meta"><Data ss:Type="String">Müştəri: ${escapeHtml(row.recipient)}</Data></Cell></Row>
   <Row><Cell ss:MergeAcross="9" ss:StyleID="Meta"><Data ss:Type="String">${escapeHtml(strategyText)}</Data></Cell></Row>
   <Row>${["No", "Palet", "Məhsul", "Kod", "Rulo", "LM", "SQM", "Net KG", "Gross KG", "Qeyd"].map((value) => xmlCell(value, "Header")).join("")}</Row>
   ${rows.map((item, index) => `<Row>${[
     xmlCell(index + 1, "Text", "Number"),
     xmlCell(item.pallet),
     xmlCell(item.productName),
     xmlCell(item.code),
     xmlCell(item.rollCount, "Text", "Number"),
     xmlCell(item.qty, "Number", "Number"),
     xmlCell(item.sqm, "Number", "Number"),
     xmlCell(item.netKg, "Number", "Number"),
     xmlCell(item.grossKg, "Number", "Number"),
     xmlCell(item.full ? "FULL PALET" : item.rollNumbers),
   ].join("")}</Row>`).join("")}
   <Row>${[
     `<Cell ss:MergeAcross="3" ss:StyleID="Total"><Data ss:Type="String">TOTAL</Data></Cell>`,
     xmlCell(totals.roll, "Total", "Number"),
     xmlCell(totals.qty, "Total", "Number"),
     xmlCell(totals.sqm, "Total", "Number"),
     xmlCell(totals.netKg, "Total", "Number"),
     xmlCell(totals.grossKg, "Total", "Number"),
     xmlCell(`${totals.pallets.size} palet`, "Total"),
   ].join("")}</Row>
  </Table>
  <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>4</SplitHorizontal><TopRowBottomPane>4</TopRowBottomPane><PageSetup><Layout x:Orientation="Landscape"/></PageSetup></WorksheetOptions>
 </Worksheet>
</Workbook>`;
};

const downloadTextFile = (content: string, fileName: string, type: string) => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = window.document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

const sqmFactor = 1.42;
const isExportPrintMode = (mode: PrintFormMode) => ["proforma", "commercial", "packingList"].includes(mode);
const salesPrintFormKey = (mode: PrintFormMode): PrintFormKey => {
  if (mode === "orderConfirmation") return "orderConfirmation";
  if (mode === "proforma") return "proforma";
  if (mode === "commercial") return "commercial";
  if (mode === "packingList") return "packingList";
  return "sale";
};
const salesPrintTitle = (mode: PrintFormMode) => {
  if (mode === "orderConfirmation") return { title: "Sipariş Onay", subtitle: "Formu" };
  if (mode === "proforma") return { title: "Proforma", subtitle: "Invoice" };
  if (mode === "commercial") return { title: "Commercial", subtitle: "Invoice" };
  if (mode === "packingList") return { title: "Packing", subtitle: "List" };
  return { title: "Satış", subtitle: "Sənədi" };
};
const printCurrency = (row: ActivityRow, mode: PrintFormMode) => {
  if (!isExportPrintMode(mode)) return "₺";
  return /euro|eur/i.test(row.recipient) ? "€" : "$";
};
const printDocumentNumberLabel = (mode: PrintFormMode) => {
  if (mode === "proforma") return "Proforma Number";
  if (mode === "commercial") return "Commercial Invoice Number";
  if (mode === "packingList") return "Commercial Invoice Number";
  if (mode === "orderConfirmation") return "Form Numarası";
  return "Sənəd nömrəsi";
};
const printDocumentDateLabel = (mode: PrintFormMode) => {
  if (mode === "proforma") return "Proforma Date";
  if (mode === "commercial" || mode === "packingList") return "Commercial Invoice Date";
  if (mode === "orderConfirmation") return "Sipariş tarixi";
  return "Tarix";
};

type PackingRow = {
  pallet: string;
  productName: string;
  code: string;
  rollCount: number;
  qty: number;
  sqm: number;
  netKg: number;
  grossKg: number;
  rollNumbers: string;
  full: boolean;
};

const buildPackingRows = (document: ApiDocument | undefined, products: ProductLine[]): PackingRow[] => {
  const rows: PackingRow[] = [];
  for (const container of document?.movementSelection?.containers ?? []) {
    for (const pallet of container.pallets ?? []) {
      const groups = new Map<string, PackingRow>();
      for (const roll of pallet.rolls ?? []) {
        const product = products.find((item) => item.productId === Number(roll.productId ?? 0));
        const productName = product?.name ?? rollProductName(roll, products);
        const code = product?.sku || product?.barcode || String(roll.productId ?? "");
        const length = String(roll.width ?? "");
        const thickness = String(roll.thickness ?? "");
        const key = [pallet.number, productName, code, length, thickness].join("|");
        const current = groups.get(key) ?? {
          pallet: shortPalletNumber(pallet.number),
          productName,
          code,
          rollCount: 0,
          qty: 0,
          sqm: 0,
          netKg: 0,
          grossKg: 0,
          rollNumbers: "",
          full: Boolean(pallet.fullPallet),
        };
        current.rollCount += 1;
        current.qty += toDetailNumber(roll.qty);
        current.sqm += toDetailNumber(roll.qty) * sqmFactor;
        current.netKg += toDetailNumber(roll.netKg);
        current.grossKg += toDetailNumber(roll.grossKg);
        current.rollNumbers = compressRollNumbers([
          ...current.rollNumbers.split(",").map((value) => value.trim()).filter(Boolean),
          String(roll.rollNo || ""),
        ]);
        groups.set(key, current);
      }
      rows.push(...groups.values());
    }
  }
  if (rows.length > 0) return rows;
  return products.map((product, index) => ({
    pallet: String(index + 1),
    productName: product.name,
    code: product.sku || product.barcode,
    rollCount: Math.max(1, Math.round(product.qty / 100)),
    qty: product.qty,
    sqm: product.qty * sqmFactor,
    netKg: 0,
    grossKg: 0,
    rollNumbers: "-",
    full: false,
  }));
};

const splitSequentialRollRange = (value: string, firstCount: number) => {
  const match = value.trim().match(/^(\d+)\s*-\s*(\d+)$/);
  if (!match) return [`1-${firstCount}`, `${firstCount + 1}-${firstCount * 2}`];
  const start = Number(match[1]);
  const end = Number(match[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [`1-${firstCount}`, `${firstCount + 1}-${firstCount * 2}`];
  return [`${start}-${start + firstCount - 1}`, `${start + firstCount}-${end}`];
};

const applyPackingStrategy = (rows: PackingRow[], options: DocumentPrintOptions): PackingRow[] => {
  if (options.packingStrategy !== "splitTen") return rows;
  return rows.flatMap((row) => {
    if (row.full || row.rollCount !== 20) return [row];
    const [firstRolls, secondRolls] = splitSequentialRollRange(row.rollNumbers, 10);
    const half = (suffix: string, rollNumbers: string): PackingRow => ({
      ...row,
      pallet: `${row.pallet}${suffix}`,
      rollCount: 10,
      qty: row.qty / 2,
      sqm: row.sqm / 2,
      netKg: row.netKg / 2,
      grossKg: row.grossKg / 2,
      rollNumbers,
    });
    return [half("A", firstRolls), half("B", secondRolls)];
  });
};

const buildSalesExportPrintHtml = (
  row: ActivityRow,
  products: ProductLine[],
  document: ApiDocument | undefined,
  options: DocumentPrintOptions,
  printSettings: PrintSettings,
) => {
  const formKey = salesPrintFormKey(options.formMode);
  const form = printSettings.forms[formKey];
  const title = salesPrintTitle(options.formMode);
  const currency = printCurrency(row, options.formMode);
  const docNo = String(row.documentId || row.id);
  const date = formatCustomsDate(document?.documentDate || row.documentDate);
  const isExport = isExportPrintMode(options.formMode);
  const showVat = options.formMode === "orderConfirmation";
  const packingRows = applyPackingStrategy(buildPackingRows(document, products), options);
  const productRows = products.map((product, index) => {
    const qty = Number(product.qty || 0);
    const sqm = qty * sqmFactor;
    const amount = qty * Number(product.price || 0);
    const vat = showVat ? amount * 0.2 : 0;
    return { index: index + 1, product, qty, sqm, amount, vat, total: amount + vat };
  });
  const totals = productRows.reduce((sum, item) => ({
    roll: sum.roll + Math.max(1, Math.round(item.qty / 100)),
    qty: sum.qty + item.qty,
    sqm: sum.sqm + item.sqm,
    amount: sum.amount + item.amount,
    vat: sum.vat + item.vat,
    total: sum.total + item.total,
  }), { roll: 0, qty: 0, sqm: 0, amount: 0, vat: 0, total: 0 });
  const packingTotals = packingRows.reduce((sum, item) => ({
    pallets: sum.pallets.add(item.pallet),
    roll: sum.roll + item.rollCount,
    qty: sum.qty + item.qty,
    sqm: sum.sqm + item.sqm,
    netKg: sum.netKg + item.netKg,
    grossKg: sum.grossKg + item.grossKg,
  }), { pallets: new Set<string>(), roll: 0, qty: 0, sqm: 0, netKg: 0, grossKg: 0 });

  return `<!doctype html>
<html lang="${isExport ? "en" : "tr"}">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title.title)} ${escapeHtml(docNo)}</title>
  <style>
    @page { size: A4 ${options.formMode === "packingList" ? "portrait" : options.paperMode}; margin: 10mm; }
    ${arixPrintBaseCss}
    body { color: #172033; }
    .doc-title { margin: 16mm 0 9mm; text-align: center; }
    .doc-title h1 { margin: 0; color: #2f6973; font-size: 54px; font-weight: 300; letter-spacing: 0; line-height: .9; }
    .doc-title div { color: #a8c4c8; font-size: 28px; font-weight: 700; line-height: 1; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 18mm; font-size: 10px; }
    .to strong { display: block; margin: 6px 0; color: #2f6973; font-size: 18px; }
    .meta-lines { justify-self: end; align-self: end; min-width: 260px; }
    .meta-lines div { display: grid; grid-template-columns: 1fr auto; gap: 18px; padding: 3px 0; }
    table.sales { width: 100%; border-collapse: collapse; font-size: 9px; }
    table.sales th { background: #eef5f6; color: #2f6973; border: 1px solid #d7e4e7; padding: 6px; font-weight: 700; }
    table.sales td { border: 1px solid #d7e4e7; padding: 5px 6px; }
    .center { text-align: center; }
    .right { text-align: right; font-variant-numeric: tabular-nums; }
    tfoot td { background: #f7fafb; font-weight: 700; }
    .terms { display: grid; grid-template-columns: 190px 1fr; gap: 6px; margin-top: 18mm; font-size: 10px; }
    .note { margin-top: 10mm; color: #52647a; font-size: 9px; line-height: 1.6; }
    .bank { margin-top: 10mm; border: 1px solid #d7e4e7; font-size: 9px; }
    .bank div { display: grid; grid-template-columns: 1.2fr .9fr .9fr 1.1fr 2fr; }
    .bank span { padding: 6px; border-right: 1px solid #d7e4e7; }
    .bank span:last-child { border-right: 0; }
    .packing-summary { margin-top: 12mm; display: grid; grid-template-columns: 220px 1fr; gap: 5px; font-size: 10px; }
    .strategy { margin: 8mm 0 3mm; color: #52647a; font-size: 9px; }
  </style>
</head>
<body>
  ${renderArixPrintHeader({
    title: form.title,
    subtitle: form.subtitle,
    documentNo: docNo,
    date,
    status: row.status,
    source: row.sender,
    settings: printSettings,
    form,
  })}
  <section class="doc-title"><h1>${escapeHtml(title.title)}</h1><div>${escapeHtml(title.subtitle)}</div></section>
  <section class="parties">
    <div class="to"><span>TO</span><strong>${escapeHtml(row.recipient)}</strong><div>Phone:</div><div>Address:</div></div>
    <div class="meta-lines">
      <div><span>${printDocumentDateLabel(options.formMode)}:</span><strong>${escapeHtml(date)}</strong></div>
      <div><span>${printDocumentNumberLabel(options.formMode)}:</span><strong>${escapeHtml(docNo)}</strong></div>
      ${options.formMode === "orderConfirmation" ? `<div><span>Döviz kuru:</span><strong>TCMB - bir önceki iş günü 09:00</strong></div>` : ""}
    </div>
  </section>
  ${options.formMode === "packingList" ? `
    <table class="sales">
      <thead><tr><th>No</th><th>PALLET</th><th>PRODUCTS</th><th>CODE</th><th>ROLL</th><th>LM</th><th>SQM</th><th>Net Weight / KG</th><th>Gross Weight / KG</th><th>Qeyd</th></tr></thead>
      <tbody>${packingRows.map((item, index) => `<tr><td class="center">${index + 1}</td><td class="center">${escapeHtml(item.pallet)}</td><td>${escapeHtml(item.productName)}</td><td class="center">${escapeHtml(item.code)}</td><td class="center">${item.rollCount}</td><td class="right">${money(item.qty)}</td><td class="right">${money(item.sqm)}</td><td class="right">${money(item.netKg)}</td><td class="right">${money(item.grossKg)}</td><td class="center">${item.full ? "FULL PALET" : escapeHtml(item.rollNumbers)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="4" class="right">TOTAL</td><td class="center">${packingTotals.roll}</td><td class="right">${money(packingTotals.qty)}</td><td class="right">${money(packingTotals.sqm)}</td><td class="right">${money(packingTotals.netKg)}</td><td class="right">${money(packingTotals.grossKg)}</td><td></td></tr></tfoot>
    </table>
    <div class="strategy">Paletləmə: ${options.packingStrategy === "splitTen" ? "20 rulo kimi hallar 10/10 bölünə bilər." : options.packingStrategy === "keepPartial" ? "Parçalı palet olduğu kimi saxlanır." : "Tam paletlər parçalanmır, eyni bəyannamə ruloları birlikdə saxlanır."}</div>
    <div class="packing-summary"><span>TOTAL PALLET</span><strong>${packingTotals.pallets.size}</strong><span>TOTAL NET WEIGHT</span><strong>${money(packingTotals.netKg)} KG</strong><span>TOTAL GROSS WEIGHT</span><strong>${money(packingTotals.grossKg)} KG</strong></div>
  ` : `
    <table class="sales">
      <thead><tr><th>No</th><th>PRODUCTS</th><th>CODE</th><th>ROLL</th><th>LM</th><th>SQM</th><th>UNIT PRICE<br/>(${currency}/SQM)</th><th>AMOUNT<br/>${currency}</th>${showVat ? "<th>KDV 20%</th><th>Toplam KDV dahil</th>" : ""}</tr></thead>
      <tbody>${productRows.map((item) => `<tr><td class="center">${item.index}</td><td>${escapeHtml(item.product.name)}</td><td class="center">${escapeHtml(item.product.sku || item.product.barcode)}</td><td class="center">${Math.max(1, Math.round(item.qty / 100))}</td><td class="right">${money(item.qty)}</td><td class="right">${money(item.sqm)}</td><td class="right">${currency}${money(item.product.price)}</td><td class="right">${currency}${money(item.amount)}</td>${showVat ? `<td class="right">${currency}${money(item.vat)}</td><td class="right">${currency}${money(item.total)}</td>` : ""}</tr>`).join("")}</tbody>
      <tfoot><tr><td colspan="3" class="right">TOTAL</td><td class="center">${totals.roll}</td><td class="right">${money(totals.qty)}</td><td class="right">${money(totals.sqm)}</td><td></td><td class="right">${currency}${money(totals.amount)}</td>${showVat ? `<td class="right">${currency}${money(totals.vat)}</td><td class="right">${currency}${money(totals.total)}</td>` : ""}</tr></tfoot>
    </table>
    <div class="terms"><span>PACKAGE</span><strong>STANDART EXPORT PACKAGE</strong><span>DESCRIPTION</span><strong>PVC FOIL</strong><span>PAYMENT</span><strong>BANK PAYMENT</strong><span>DELIVERY TERM</span><strong>FCA. ISTANBUL</strong><span>SHIPMENT PORT</span><strong>ISTANBUL / TURKEY</strong><span>DESTINATION</span><strong>${escapeHtml(row.recipient)}</strong><span>ORIGIN</span><strong>GOODS OF CHINA</strong></div>
    ${options.formMode === "orderConfirmation" ? `<div class="note">Faturadakı döviz kuru, bir önceki iş gününün TCMB kapanış satış kuru olacak şekilde alınacaktır.</div>` : ""}
    ${isExport ? `<div class="bank"><div><span>BANK</span><span>SWIFT CODE</span><span>BRANCH CODE</span><span>ACCOUNT NO</span><span>${currency === "€" ? "EUR" : "USD"} IBAN</span></div><div><span>ALBARAKA TURK PARTICIPATION BANK</span><span>BTFHTRISXXX</span><span>26-MERTER</span><span>26-9987324-2</span><span>TR56 0020 3000 0998 7324 0000 02</span></div></div>` : ""}
  `}
  ${renderArixPrintFooter(docNo, printSettings, form)}
  <script>window.addEventListener("load", () => setTimeout(() => window.print(), 250));</script>
</body>
</html>`;
};

const buildDocumentPrintHtml = (
  row: ActivityRow,
  products: ProductLine[],
  document: ApiDocument | undefined,
  options: DocumentPrintOptions,
  printSettings: PrintSettings,
) => {
  const productsTotal = products.reduce((sum, item) => sum + item.total, 0);
  const qtyTotal = products.reduce((sum, item) => sum + item.qty, 0);
  const containers = document?.bondedStock?.containers ?? [];
  const productRows = products.map((product) => [
    product.name,
    product.variant,
    product.barcode,
    product.sku,
    product.qty.toLocaleString("az-Latn-AZ"),
    money(product.price),
    money(product.discount),
    money(product.total),
  ]);
  productRows.push(["Ümumi nəticə", "", "", "", qtyTotal.toLocaleString("az-Latn-AZ"), "-", "0.00", money(productsTotal)]);
  const formKey: PrintFormKey =
    row.kind === "sale"
      ? "sale"
      : row.kind === "purchase"
        ? "purchase"
        : row.kind === "transfer"
          ? "movement"
          : row.documentType === "writeOff"
            ? "writeOff"
            : "inventory";
  const form = printSettings.forms[formKey];

  return `<!doctype html>
<html lang="az">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(row.order)}</title>
  <style>
    @page { size: A4 ${options.paperMode}; margin: 11mm; }
    ${arixPrintBaseCss}
    .arix-info-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 9px; }
    .arix-info { min-width: 0; overflow: hidden; border: 1px solid var(--arix-line); border-radius: 8px; padding: 8px 10px; background: #fff; }
    .arix-info span, .arix-summary-item span { display: block; color: var(--arix-muted); font-size: 8px; font-weight: 400; }
    .arix-info strong { display: block; overflow: hidden; margin-top: 3px; font-size: 10px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
    .arix-summary { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
    .arix-summary-item { min-width: 0; border: 1px solid var(--arix-line); border-radius: 8px; padding: 8px 10px; background: var(--arix-soft); }
    .arix-summary-item strong { display: block; margin-top: 3px; color: var(--arix-ink); font-size: 11px; font-weight: 600; text-align: right; font-variant-numeric: tabular-nums; }
    .block { margin-top: 12px; }
    .block > h2 { display: flex; align-items: center; gap: 9px; margin: 15px 0 7px; color: var(--arix-ink); font-size: 10px; font-weight: 600; }
    .block > h2:after { content: ""; height: 1px; flex: 1; background: var(--arix-line); }
    .container-card { overflow: hidden; margin-bottom: 12px; border: 1px solid var(--arix-line); border-radius: 8px; page-break-inside: avoid; background: #fff; }
    .container-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 10px; border-bottom: 1px solid var(--arix-line); background: var(--arix-soft); color: var(--arix-ink); }
    .container-head strong, .pallet-head strong { display: block; font-size: 10px; }
    .container-head span, .pallet-head span { color: var(--arix-muted); font-size: 8px; }
    .chips { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 5px; }
    .chips span { border: 1px solid var(--arix-line); border-radius: 999px; padding: 3px 7px; background: #fff; color: var(--arix-muted); font-size: 8px; font-weight: 600; }
    .pallet-card { overflow: hidden; margin: 8px; border: 1px solid var(--arix-line); border-radius: 7px; page-break-inside: avoid; }
    .pallet-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 7px 9px; border-bottom: 1px solid var(--arix-line); background: var(--arix-soft); }
    .pallet-card .arix-table { border: 0; }
    .right { text-align: right; font-variant-numeric: tabular-nums; }
  </style>
</head>
<body>
  ${renderArixPrintHeader({
    title: form.title,
    subtitle: form.subtitle,
    documentNo: String(row.documentId || row.id),
    date: `${row.date}, ${row.time}`,
    status: row.status,
    source: row.sender,
    settings: printSettings,
    form,
  })}
  <div class="arix-info-grid">
    <div class="arix-info"><span>${row.kind === "purchase" ? "Təchizatçı" : "Göndərən"}</span><strong>${escapeHtml(row.sender)}</strong></div>
    <div class="arix-info"><span>${row.kind === "purchase" ? "Qəbul edən mağaza" : "Qəbul edən"}</span><strong>${escapeHtml(row.recipient)}</strong></div>
    <div class="arix-info"><span>Müəllif</span><strong>${escapeHtml(row.author)}</strong></div>
  </div>
  <div class="arix-summary">
    <div class="arix-summary-item"><span>Məbləğ</span><strong>${money(row.total)} ₼</strong></div>
    <div class="arix-summary-item"><span>Ödənilib</span><strong>${money(row.paid)} ₼</strong></div>
    <div class="arix-summary-item"><span>Qalıq</span><strong>${money(Math.max(row.total - row.paid, 0))} ₼</strong></div>
    <div class="arix-summary-item"><span>Fiscal</span><strong>${escapeHtml(fiscalValue(row))}</strong></div>
  </div>
  <section class="block">
    <h2>Məhsullar</h2>
    ${renderPrintTable(["Ad", "Variasiya", "Bar-kod", "Artikul", "Miqdar", "Qiymət", "Endirim", "Ümumi"], productRows)}
  </section>
  ${options.palletMode === "withPallets" ? renderPalletPrintHtml(containers, products, options.detailMode) : ""}
  ${renderArixPrintFooter(row.order, printSettings, form)}
  <script>
    window.addEventListener("load", () => setTimeout(() => window.print(), 250));
  </script>
</body>
</html>`;
};

const openDocumentPrint = (
  row: ActivityRow,
  products: ProductLine[],
  document: ApiDocument | undefined,
  options: DocumentPrintOptions,
  printSettings: PrintSettings,
) => {
  const html = options.formMode === "customs"
    ? renderCustomsPrintHtml(row, document, products, printSettings)
    : ["orderConfirmation", "proforma", "commercial", "packingList"].includes(options.formMode)
      ? buildSalesExportPrintHtml(row, products, document, options, printSettings)
      : buildDocumentPrintHtml(row, products, document, options, printSettings);
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const popup = window.open(url, "_blank", "width=1100,height=850");
  if (!popup) return false;
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
};

const documentKind = (type = ""): ActivityKind | null => {
  if (type === "sale" || type === "saleReturn") return "sale";
  if (type === "purchase" || type === "purchaseReturn") return "purchase";
  if (type === "movement") return "transfer";
  if (["inventory", "openingBalance", "writeOff"].includes(type)) return "adjustment";
  return null;
};

const rowIdFromDocument = (document: ApiDocument, index: number) => {
  const digits = String(document.id ?? "").replace(/\D/g, "");
  return Number(digits.slice(-8)) || index + 1;
};

const monthNames = [
  "yanvar",
  "fevral",
  "mart",
  "aprel",
  "may",
  "iyun",
  "iyul",
  "avqust",
  "sentyabr",
  "oktyabr",
  "noyabr",
  "dekabr",
];

const dateParts = (dateValue?: string) => {
  const value = dateValue ? new Date(dateValue) : new Date();
  const safe = Number.isNaN(value.getTime()) ? new Date() : value;
  return {
    date: `${safe.getDate()} ${monthNames[safe.getMonth()]} ${safe.getFullYear()}`,
    time: `${String(safe.getHours()).padStart(2, "0")}:${String(safe.getMinutes()).padStart(2, "0")}`,
  };
};

const documentTitle = (document: ApiDocument, id: number) => {
  if (document.type === "sale" && (document.saleMode === "export" || document.exportMode)) {
    return `İxracat sənədi #${id}`;
  }
  const titles: Record<string, string> = {
    sale: "Satış sənədi",
    purchase: "Alış sənədi",
    saleReturn: "Satış qaytarması",
    purchaseReturn: "Alış qaytarması",
    inventory: "İnventarlaşma",
    openingBalance: "Əvvələ qalıq",
    writeOff: "Silinmə",
    movement: "Yerdəyişmə",
  };
  return `${titles[document.type ?? ""] ?? "Sənəd"} #${id}`;
};

const statusFromDocument = (document: ApiDocument): ActivityRow["status"] => {
  if (document.status === "cancelled") return "Ləğv edilib" as ActivityRow["status"];
  if (document.status === "draft" || document.posted === false) return "Hazırlanır" as ActivityRow["status"];
  return "Təsdiqlənib" as ActivityRow["status"];
};

const paymentFromDocument = (document: ApiDocument): PaymentStatus => {
  const total = Number(document.paymentSummary?.total ?? document.total ?? 0);
  const paid = Number(document.paymentSummary?.paid ?? document.paid ?? total);
  if (total <= 0 || paid <= 0) return "Gözləyir";
  if (paid < total) return "Qismən";
  return "Ödənilib";
};

const mapDocumentLines = (document: ApiDocument): ProductLine[] =>
  (document.lines ?? []).map((line, index) => {
    const qty = Number(line.qty ?? 0);
    const price = Number(line.price ?? 0);
    const discount = Number(line.discount ?? 0);
    return {
      productId: Number(line.productId ?? index + 1),
      name: line.name ?? "Məhsul",
      barcode: String(line.barcode ?? line.productId ?? ""),
      sku: String(line.sku ?? ""),
      variant: line.variant ?? "Standart",
      qty,
      price,
      discount,
      total: Number(line.total ?? Math.max(0, qty * price - discount)),
      warehouse: line.warehouse ?? document.account ?? document.fromAccount ?? "",
      available: Number(line.available ?? 0),
    };
  });

const mapDocumentToActivity = (document: ApiDocument, index: number): ActivityRow | null => {
  const kind = documentKind(document.type);
  if (!kind) return null;
  const id = rowIdFromDocument(document, index);
  const { date, time } = dateParts(document.documentDate ?? document.createdAt);
  const counterparty = document.counterpartyName ?? "";
  const account = document.account ?? "";
  const sender = kind === "purchase" ? counterparty : document.fromAccount ?? account;
  const recipient = kind === "purchase" ? account : kind === "transfer" ? document.toAccount ?? "" : counterparty || document.toAccount || account;
  const total = Number(document.total ?? 0);
  return {
    id,
    documentId: String(document.id ?? ""),
    documentType: String(document.type ?? ""),
    documentDate: document.documentDate ?? document.createdAt,
    date,
    time,
    kind,
    status: statusFromDocument(document),
    order: documentTitle(document, id),
    items: document.lines?.length ?? 0,
    total,
    paid: Number(document.paymentSummary?.paid ?? document.paid ?? total),
    sender,
    recipient,
    author: document.author ?? "Arif Mahmud",
    payment: paymentFromDocument(document),
  };
};

export default function ProductActivity({ isDark = false }: { isDark?: boolean }) {
  const ui = makeUI(isDark);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<ActivityFilters>(emptyFilters);
  const [visibleFilters, setVisibleFilters] = useState<FilterKey[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterKey | null>(null);
  const [selectedActivity, setSelectedActivity] = useState<ActivityRow | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductLine | null>(null);
  const [editingActivity, setEditingActivity] = useState<ActivityRow | null>(null);
  const [activityRows, setActivityRows] = useState<ActivityRow[]>([]);
  const [activityLines, setActivityLines] = useState<Record<number, ProductLine[]>>({});
  const [documentsById, setDocumentsById] = useState<Record<string, ApiDocument>>({});
  const [printSettings, setPrintSettings] = useState<PrintSettings>(defaultPrintSettings);
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  useEffect(() => {
    let cancelled = false;
    const loadActivity = async () => {
      const payload = await requestJson<{ data: ApiDocument[] }>("/api/documents");
      if (cancelled || !Array.isArray(payload.data)) return;
      const nextRows: ActivityRow[] = [];
      const nextLines: Record<number, ProductLine[]> = {};
      const nextDocuments: Record<string, ApiDocument> = {};
      payload.data.forEach((document, index) => {
        const row = mapDocumentToActivity(document, index);
        if (!row) return;
        nextRows.push(row);
        nextLines[row.id] = mapDocumentLines(document);
        if (document.id) nextDocuments[String(document.id)] = document;
      });
      setActivityRows(nextRows);
      setActivityLines(nextLines);
      setDocumentsById(nextDocuments);
    };
    void loadActivity().catch(() => {
      if (!cancelled) {
        setActivityRows([]);
        setActivityLines({});
        setDocumentsById({});
      }
    });
    window.addEventListener("arix:documents-updated", loadActivity);
    return () => {
      cancelled = true;
      window.removeEventListener("arix:documents-updated", loadActivity);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadPrintSettings = async () => {
      const payload = await requestJson<{ data?: { printSettings?: Partial<PrintSettings> } }>("/api/company-settings");
      if (!cancelled) setPrintSettings(mergePrintSettings(payload.data?.printSettings));
    };
    const handlePrintSettingsUpdate = (event: Event) => {
      const detail = (event as CustomEvent<PrintSettings>).detail;
      if (detail) setPrintSettings(mergePrintSettings(detail));
      else void loadPrintSettings().catch(() => undefined);
    };
    void loadPrintSettings().catch(() => undefined);
    window.addEventListener("arix:print-settings-updated", handlePrintSettingsUpdate);
    window.addEventListener("arix:company-settings-updated", loadPrintSettings);
    return () => {
      cancelled = true;
      window.removeEventListener("arix:print-settings-updated", handlePrintSettingsUpdate);
      window.removeEventListener("arix:company-settings-updated", loadPrintSettings);
    };
  }, []);

  const activityAuthors = useMemo(
    () => Array.from(new Set(activityRows.map((row) => row.author).filter(Boolean))),
    [activityRows]
  );
  const activityEntityGroups = useMemo(
    () => [
      { title: "Göndərən", options: Array.from(new Set(activityRows.map((row) => row.sender).filter(Boolean))) },
      { title: "Alan", options: Array.from(new Set(activityRows.map((row) => row.recipient).filter(Boolean))) },
    ],
    [activityRows]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return activityRows.filter((row) => {
      const matchesKind = !filters.kind || row.kind === filters.kind;
      const matchesStatus = !filters.status || row.status === filters.status;
      const matchesPayment = !filters.payment || row.payment === filters.payment;
      const matchesAuthor = !filters.author || row.author === filters.author;
      const matchesFiscal = !filters.fiscal || fiscalValue(row) === filters.fiscal;
      const matchesOrderStatus =
        !filters.orderStatus ||
        (filters.orderStatus === "Yeni" && row.status === "Hazırlanır") ||
        (filters.orderStatus === "İşdə" && row.status === "Hazırlanır") ||
        (filters.orderStatus === "Bağlı" && row.status === "Təsdiqlənib") ||
        (filters.orderStatus === "Ləğv" && row.status === "Ləğv edilib");
      const matchesRecipient = !filters.recipient || row.recipient === filters.recipient;
      const matchesSender = !filters.sender || row.sender === filters.sender;
      const matchesQuery =
        !q ||
        [row.order, row.sender, row.recipient, row.author, row.payment, row.status].some((value) =>
          value.toLowerCase().includes(q)
        );
      return matchesKind && matchesStatus && matchesPayment && matchesAuthor && matchesFiscal && matchesOrderStatus && matchesRecipient && matchesSender && matchesQuery;
    });
  }, [activityRows, filters, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, ActivityRow[]>();
    for (const row of filtered) map.set(row.date, [...(map.get(row.date) ?? []), row]);
    return Array.from(map.entries());
  }, [filtered]);
  const editingDocument = editingActivity?.documentId ? documentsById[editingActivity.documentId] : null;
  const editingKind = (editingDocument?.type || editingActivity?.documentType || "purchase") as DocumentCreateKind;

  return (
    <>
    <div className="flex min-h-[calc(100dvh-12rem)] min-w-0 flex-col gap-3 md:h-[calc(100vh-8rem)] md:min-h-0">
      <div className={cx("relative z-30 flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between", ui.card, ui.ring)}>
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-[440px]">
            <I.Search className="absolute left-2 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="axtarış…"
              className={cx(ui.input, "pl-8 pr-12")}
            />
            <button
              type="button"
              onClick={() => setFilterOpen((value) => !value)}
              className={cx("absolute right-1 top-1/2 flex h-8 w-10 -translate-y-1/2 items-center justify-center rounded-lg", isDark ? "hover:bg-white/10" : "hover:bg-white/65")}
              aria-label="Filtrlər"
              aria-expanded={filterOpen}
            >
              <I.Filter className="h-5 w-5 text-slate-500" />
              {activeFilterCount > 0 && (
                <span className="absolute -right-1 -top-1 rounded-full bg-indigo-600 px-1.5 py-0.5 text-[10px] text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
            {filterOpen && (
              <ActivityFilterPanel
                filters={filters}
                setFilters={setFilters}
                visibleFilters={visibleFilters}
                setVisibleFilters={setVisibleFilters}
                activeFilter={activeFilter}
                setActiveFilter={setActiveFilter}
                peopleOptions={activityAuthors}
                entityGroups={activityEntityGroups}
                isDark={isDark}
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className={cx(ui.iconBtn, "border", ui.borderSoft)} title="İxrac">
            <I.Download className={cx("h-5 w-5", isDark ? "text-slate-200" : "text-slate-700")} />
          </button>
        </div>
      </div>

      <div className={cx("flex min-h-0 flex-1 flex-col overflow-hidden", ui.card, ui.ring)}>
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="space-y-3 p-3 md:hidden">
            {grouped.map(([date, dateRows]) => (
              <div key={date} className="space-y-2">
                <div className={cx("px-1 text-sm font-semibold", ui.subtle)}>{date}</div>
                {dateRows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => setSelectedActivity(row)}
                    className={cx("w-full rounded-2xl border p-3 text-left transition", ui.borderSoft, isDark ? "bg-white/5 hover:bg-white/10" : "bg-white hover:bg-slate-50")}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={cx("h-2.5 w-2.5 rounded-full", activityAccent(row))} />
                          <span className="truncate text-sm font-semibold">{row.order}</span>
                        </div>
                        <div className={cx("mt-1 truncate text-xs", ui.subtle)}>{row.sender} → {row.recipient}</div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-semibold tabular-nums">{money(row.total)}</div>
                        <div className={cx("text-xs", ui.subtle)}>{row.items} məhsul</div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className={cx("rounded-full px-2.5 py-1 text-xs", isDark ? "bg-white/7 text-slate-300" : "bg-slate-100 text-slate-600")}>{row.status}</span>
                      <span className={cx("rounded-full px-2.5 py-1 text-xs", isDark ? "bg-white/7 text-slate-300" : "bg-slate-100 text-slate-600")}>{row.payment}</span>
                      <span className={cx("ml-auto text-xs tabular-nums", ui.subtle)}>{row.time}</span>
                    </div>
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && <div className={cx("rounded-2xl border p-4 text-center text-sm", ui.borderSoft, ui.subtle)}>Heç nə tapılmadı.</div>}
          </div>
          <div className="hidden min-h-full md:block">
          <table className="w-full min-w-[1450px] border-separate border-spacing-0 text-[13px]">
            <thead className={ui.theadSticky}>
              <tr className={cx("text-xs font-semibold", ui.subtle)}>
                <th className={cx("border-b px-4 py-3 text-left", ui.borderSoft)}>STATUS</th>
                <th className={cx("border-b px-4 py-3 text-left", ui.borderSoft)}>SƏNƏD</th>
                <th className={cx("border-b px-4 py-3 text-left", ui.borderSoft)}>TARİX / SAAT</th>
                <th className={cx("border-b px-4 py-3 text-right", ui.borderSoft)}>MƏHSUL</th>
                <th className={cx("border-b px-4 py-3 text-right", ui.borderSoft)}>CƏMİ</th>
                <th className={cx("border-b px-4 py-3 text-right", ui.borderSoft)}>ÖDƏNİLİB</th>
                <th className={cx("border-b px-4 py-3 text-left", ui.borderSoft)}>GÖNDƏRƏN</th>
                <th className={cx("border-b px-4 py-3 text-left", ui.borderSoft)}>ALAN</th>
                <th className={cx("border-b px-4 py-3 text-left", ui.borderSoft)}>MÜƏLLİF</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([date, dateRows]) => (
                <FragmentGroup key={date} date={date} rows={dateRows} isDark={isDark} border={ui.borderSoft} rowHover={ui.rowHover} onOpen={setSelectedActivity} />
              ))}
            </tbody>
          </table>
          </div>
        </div>

        <div className={cx("flex h-11 items-center justify-between border-t px-4 text-sm", ui.borderSoft)}>
          <div className={ui.subtle}>{filtered.length} əməliyyat göstərilir</div>
          <div className={cx("text-sm font-medium tabular-nums", isDark ? "text-slate-200" : "text-slate-700")}>
            {money(filtered.reduce((sum, row) => sum + row.total, 0))}
          </div>
        </div>
      </div>
    </div>
    {selectedActivity && (
      <ActivityDetailPanel
        row={selectedActivity}
        products={activityLines[selectedActivity.id] ?? []}
        document={selectedActivity.documentId ? documentsById[selectedActivity.documentId] : undefined}
        printSettings={printSettings}
        isDark={isDark}
        onClose={() => {
          setSelectedActivity(null);
          setSelectedProduct(null);
        }}
        onEdit={(row) => setEditingActivity(row)}
        onProductOpen={setSelectedProduct}
      />
    )}
    {editingActivity && (
      <DocumentCreatePanel
        kind={editingKind}
        editingDocument={editingDocument as ApiDocumentDraft | null}
        isDark={isDark}
        onClose={() => setEditingActivity(null)}
        onSaved={() => {
          setEditingActivity(null);
          setSelectedActivity(null);
          window.dispatchEvent(new CustomEvent("arix:documents-updated"));
        }}
      />
    )}
    {selectedProduct && (
      <ProductPreviewPanel product={selectedProduct} isDark={isDark} onClose={() => setSelectedProduct(null)} />
    )}
    </>
  );
}

function ActivityFilterPanel({
  filters,
  setFilters,
  visibleFilters,
  setVisibleFilters,
  activeFilter,
  setActiveFilter,
  peopleOptions,
  entityGroups,
  isDark,
}: {
  filters: ActivityFilters;
  setFilters: Dispatch<SetStateAction<ActivityFilters>>;
  visibleFilters: FilterKey[];
  setVisibleFilters: Dispatch<SetStateAction<FilterKey[]>>;
  activeFilter: FilterKey | null;
  setActiveFilter: (key: FilterKey | null) => void;
  peopleOptions: string[];
  entityGroups: Array<{ title: string; options: string[] }>;
  isDark: boolean;
}) {
  const border = isDark ? "border-white/10" : "border-white/60";
  const surface = isDark ? "glass-control-dark" : "glass-control";
  const dropdown = isDark ? "glass-panel-dark ring-1 ring-white/10" : "glass-panel ring-1 ring-white/55";
  const subtle = isDark ? "text-slate-400" : "text-slate-500";
  const fieldKeys: FilterKey[] = ["date", "status", "payment", "kind", "author", "fiscal", "orderStatus", "recipient", "sender"];
  const availableKeys = fieldKeys.filter((key) => !visibleFilters.includes(key));
  const optionSets: Partial<Record<FilterKey, Array<{ label: string; value: string; color?: string }>>> = {
    status: [
      { label: "Təsdiqlənib", value: "Təsdiqlənib" },
      { label: "Hazırlanır", value: "Hazırlanır" },
      { label: "Ləğv edilib", value: "Ləğv edilib" },
    ],
    payment: [
      { label: "Ödənilib", value: "Ödənilib" },
      { label: "Qismən", value: "Qismən" },
      { label: "Gözləyir", value: "Gözləyir" },
    ],
    kind: [
      { label: "Satış sifarişi", value: "sale" },
      { label: "Alış", value: "purchase" },
      { label: "Transfer", value: "transfer" },
      { label: "Sayım düzəlişi", value: "adjustment" },
    ],
    author: peopleOptions.map((name) => ({ label: name, value: name })),
    fiscal: [
      { label: "Bəli", value: "Bəli" },
      { label: "Xeyr", value: "Xeyr" },
    ],
    orderStatus: [
      { label: "Yeni", value: "Yeni", color: "bg-violet-500" },
      { label: "İşdə", value: "İşdə", color: "bg-sky-500" },
      { label: "Bağlı", value: "Bağlı", color: "bg-emerald-500" },
      { label: "Ləğv", value: "Ləğv", color: "bg-rose-500" },
    ],
  };

  const setValue = (key: FilterKey, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setActiveFilter(null);
  };
  const clearValue = (key: FilterKey) => {
    setFilters((current) => ({ ...current, [key]: "" }));
    if (activeFilter === key) setActiveFilter(null);
  };
  const addCondition = (key: FilterKey) => {
    setVisibleFilters((current) => current.includes(key) ? current : [...current, key]);
    setActiveFilter(key);
  };
  const removeCondition = (key: FilterKey) => {
    clearValue(key);
    setVisibleFilters((current) => current.filter((item) => item !== key));
  };
  const valueLabel = (key: FilterKey) => {
    if (key === "kind" && filters.kind) return kindLabel(filters.kind);
    return filters[key] || "Seçim edin";
  };

  return (
    <div className={cx("surface-popover absolute left-0 top-12 z-50 w-[560px] max-w-[calc(100vw-3rem)] rounded-2xl p-4 shadow-xl", isDark ? "glass-panel-dark ring-1 ring-white/10" : "glass-panel ring-1 ring-white/55")}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className={cx("text-sm font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>Şərt filtri</div>
          <div className={cx("text-xs", subtle)}>Əvvəl şərti əlavə edin, sonra dəyərini seçin.</div>
        </div>
        <select
          value=""
          disabled={availableKeys.length === 0}
          onChange={(event) => {
            if (!event.target.value) return;
            addCondition(event.target.value as FilterKey);
          }}
          className={cx("h-10 min-w-44 rounded-xl border px-3 text-sm outline-none", border, surface)}
        >
          <option value="">{availableKeys.length ? "Şərt əlavə et" : "Bütün şərtlər əlavə olunub"}</option>
          {availableKeys.map((key) => (
            <option key={key} value={key}>{filterLabels[key]}</option>
          ))}
        </select>
      </div>

      {visibleFilters.length === 0 ? (
        <div className={cx("rounded-xl border p-3 text-sm", border, isDark ? "bg-slate-900/35 text-slate-400" : "bg-slate-50/70 text-slate-500")}>
          Şərt əlavə etdikcə burada kompakt sətirlər açılacaq.
        </div>
      ) : (
        <div className="space-y-2">
          {visibleFilters.map((key) => (
            <div key={key} className={cx("relative rounded-xl border p-3", border, isDark ? "bg-slate-900/35" : "bg-slate-50/70")}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className={cx("text-base font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>{filterLabels[key]}</div>
                <button
                  type="button"
                  onClick={() => removeCondition(key)}
                  className={cx("rounded-lg px-2 py-1 text-xs", isDark ? "text-slate-300 hover:bg-white/10" : "text-slate-500 hover:bg-white")}
                  aria-label={`${filterLabels[key]} şərtini sil`}
                >
                  Sil
                </button>
              </div>
              <div className={cx("relative grid items-center gap-3", key === "date" ? "grid-cols-[1fr_90px]" : "grid-cols-[1fr_1fr]")}>
                <select
                  value="eq"
                  onChange={() => undefined}
                  className={cx("h-9 rounded-lg border px-3 text-sm outline-none", border, isDark ? "bg-slate-900 text-slate-100" : "bg-white text-slate-800")}
                >
                  <option value="eq">bərabərdir</option>
                  <option value="contains">daxildir</option>
                </select>
                <button
                  type="button"
                  onClick={() => setActiveFilter(activeFilter === key ? null : key)}
                  className={cx("flex h-9 min-w-0 items-center justify-between border-0 border-b bg-transparent px-2 text-left text-sm outline-none", isDark ? "border-slate-600 hover:border-slate-400" : "border-slate-300 hover:border-slate-500")}
                >
                  <span className={cx("truncate", filters[key] ? isDark ? "text-slate-100" : "text-slate-800" : "text-slate-400")}>{valueLabel(key)}</span>
                  <span className={subtle}>▾</span>
                </button>

                {activeFilter === key && (
                  <div className={cx("surface-popover absolute left-0 top-11 z-50 min-w-full overflow-hidden rounded-xl p-2 shadow-xl", dropdown, key === "date" ? "w-[720px] max-w-[calc(100vw-4rem)]" : key === "recipient" || key === "sender" ? "w-[430px]" : "w-64")}>
                    {key === "date" ? (
                      <DateFilterPanel onPick={(value) => setValue("date", value)} isDark={isDark} />
                    ) : key === "recipient" || key === "sender" ? (
                      <GroupedEntityOptions groups={entityGroups} onPick={(value) => setValue(key, value)} isDark={isDark} />
                    ) : (
                      <OptionList
                        options={optionSets[key] ?? []}
                        value={String(filters[key])}
                        onPick={(value) => setValue(key, value)}
                        isDark={isDark}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => {
            setFilters(emptyFilters);
            setVisibleFilters([]);
            setActiveFilter(null);
          }}
          className={cx("h-9 rounded-xl px-3 text-sm", isDark ? "text-slate-300 hover:bg-white/10" : "text-slate-600 hover:bg-white/70")}
        >
          Filtrləri təmizlə
        </button>
        <div className={cx("text-xs", subtle)}>Şərtlər cədvələ dərhal tətbiq olunur</div>
      </div>
    </div>
  );
}

function OptionList({
  options,
  value,
  onPick,
  isDark,
}: {
  options: Array<{ label: string; value: string; color?: string }>;
  value: string;
  onPick: (value: string) => void;
  isDark: boolean;
}) {
  return (
    <div className="space-y-1">
      {options.map((option) => (
        <button
          key={`${option.label}-${option.value}`}
          type="button"
          onClick={() => onPick(option.value)}
          className={cx("flex h-10 w-full items-center justify-between gap-3 rounded-xl px-3 text-sm", value === option.value ? isDark ? "surface-nav-active text-slate-100" : "surface-nav-active text-indigo-700" : isDark ? "text-slate-300 hover:bg-white/7" : "text-slate-700 hover:bg-white/70")}
        >
          <span className="flex items-center gap-2">
            {option.color && <span className={cx("h-3 w-3 rounded-full", option.color)} />}
            {option.label}
          </span>
          {value === option.value && <I.Check className="h-4 w-4" />}
        </button>
      ))}
    </div>
  );
}

function GroupedEntityOptions({ groups, onPick, isDark }: { groups: Array<{ title: string; options: string[] }>; onPick: (value: string) => void; isDark: boolean }) {
  return (
    <div className="max-h-[420px] overflow-y-auto p-1">
      {groups.filter((group) => group.options.length > 0).map((group) => (
        <div key={group.title} className="mb-3 last:mb-0">
          <div className={cx("mb-1 flex items-center gap-2 px-2 text-xs font-semibold uppercase", isDark ? "text-slate-400" : "text-slate-500")}>
            <I.Tag className="h-4 w-4" />
            {group.title}
          </div>
          <div className="space-y-1">
            {group.options.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => onPick(option)}
                className={cx("block w-full rounded-xl px-3 py-2 text-left text-sm", isDark ? "text-slate-200 hover:bg-white/7" : "text-slate-700 hover:bg-white/70")}
              >
                {option}
              </button>
            ))}
          </div>
        </div>
      ))}
      {groups.every((group) => group.options.length === 0) && (
        <div className={cx("px-3 py-2 text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Seçim yoxdur</div>
      )}
    </div>
  );
}

function DateFilterPanel({ onPick, isDark }: { onPick: (value: string) => void; isDark: boolean }) {
  const quick = ["Bugün", "Dünən", "7 gün", "30 gün", "Bu ay", "Keçən ay", "Rüb"];
  const daysMay = Array.from({ length: 31 }, (_, index) => index + 1);
  const daysJune = Array.from({ length: 30 }, (_, index) => index + 1);
  const dayClass = (day: number) =>
    cx(
      "flex h-8 w-8 items-center justify-center rounded-lg text-sm",
      day === 14 || day === 20
        ? "bg-indigo-600 text-white"
        : day > 14 && day < 20
          ? isDark ? "bg-indigo-500/15 text-indigo-100" : "bg-indigo-50 text-indigo-700"
          : isDark ? "text-slate-300 hover:bg-white/7" : "text-slate-600 hover:bg-white/70"
    );

  return (
    <div>
      <div className="grid gap-4 md:grid-cols-[150px_1fr_1fr]">
        <div className={cx("border-r pr-2", isDark ? "border-white/10" : "border-slate-200")}>
          {quick.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onPick(item)}
              className={cx("block h-10 w-full rounded-xl px-3 text-left text-sm", isDark ? "text-slate-300 hover:bg-white/7" : "text-slate-600 hover:bg-white/70")}
            >
              {item}
            </button>
          ))}
        </div>
        {[
          ["May 2026", daysMay],
          ["İyun 2026", daysJune],
        ].map(([title, days]) => (
          <div key={String(title)}>
            <div className={cx("mb-2 text-center text-sm font-semibold", isDark ? "text-slate-100" : "text-slate-700")}>{String(title)}</div>
            <div className={cx("mb-1 grid grid-cols-7 gap-1 text-center text-xs font-medium", isDark ? "text-slate-400" : "text-slate-500")}>
              {["B.e", "Ç.a", "Ç", "C.a", "C", "Ş", "B"].map((day) => <span key={day}>{day}</span>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {(days as number[]).map((day) => (
                <button key={day} type="button" onClick={() => onPick(`${day} ${String(title).split(" ")[0]}`)} className={dayClass(day)}>
                  {day}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className={cx("mt-4 flex items-center justify-between border-t pt-3 text-sm", isDark ? "border-white/10 text-slate-300" : "border-slate-200 text-slate-600")}>
        <span className="font-medium">2026-05-14 - 2026-05-20 (7 gün)</span>
        <button type="button" onClick={() => onPick("14 May - 20 May")} className="surface-primary h-9 rounded-xl px-4 text-sm">
          Seç
        </button>
      </div>
    </div>
  );
}

function ActivityDetailPanel({
  row,
  products,
  document,
  printSettings,
  isDark,
  onClose,
  onEdit,
  onProductOpen,
}: {
  row: ActivityRow;
  products: ProductLine[];
  document?: ApiDocument;
  printSettings: PrintSettings;
  isDark: boolean;
  onClose: () => void;
  onEdit: (row: ActivityRow) => void;
  onProductOpen: (product: ProductLine) => void;
}) {
  const border = isDark ? "border-white/10" : "border-slate-200";
  const panel = isDark ? "bg-slate-950/92 text-slate-100 ring-white/10" : "bg-white/92 text-slate-900 ring-slate-200";
  const soft = isDark ? "bg-white/7" : "bg-slate-50";
  const subtle = isDark ? "text-slate-400" : "text-slate-500";
  const productsTotal = products.reduce((sum, item) => sum + item.total, 0);
  const qtyTotal = products.reduce((sum, item) => sum + item.qty, 0);
  const containers = document?.bondedStock?.containers ?? [];
  const hasCustomsSelection = (document?.movementSelection?.containers?.length ?? 0) > 0;
  const [printOpen, setPrintOpen] = useState(false);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-md">
      <section className={cx("flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[26px] shadow-2xl ring-1", panel)}>
        <div className={cx("flex items-center justify-between gap-3 border-b p-3", border)}>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className={cx("flex h-11 w-11 items-center justify-center rounded-xl border", border, isDark ? "hover:bg-white/10" : "hover:bg-slate-50")} aria-label="Bağla">
              <I.X className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => onEdit(row)} className="surface-primary inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold">
              <I.Edit className="h-4 w-4" />
              Redaktə
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setPrintOpen(true);
              }}
              className={cx("flex h-11 w-11 items-center justify-center rounded-xl border", border, isDark ? "hover:bg-white/10" : "hover:bg-slate-50")}
              title="Çap et"
              aria-label="Çap et"
            >
              <I.Printer className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => setPrintOpen(true)} className={cx("flex h-11 w-11 items-center justify-center rounded-xl border", border, isDark ? "hover:bg-white/10" : "hover:bg-slate-50")} title="İxrac">
              <I.Download className="h-5 w-5" />
            </button>
            <button type="button" className={cx("flex h-11 w-11 items-center justify-center rounded-xl border", border, isDark ? "hover:bg-white/10" : "hover:bg-slate-50")} title="Geri qaytar">
              <I.Undo className="h-5 w-5" />
            </button>
          </div>
          <button type="button" className="h-11 rounded-xl border border-rose-300 px-5 text-sm font-semibold text-rose-600 hover:bg-rose-50">
            Sil
          </button>
        </div>

        <div className="min-h-0 overflow-auto p-5">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-3xl font-semibold tracking-normal">{row.order}</h2>
                <span className={cx("rounded-full px-3 py-1 text-sm font-medium", row.kind === "sale" ? "bg-emerald-500/12 text-emerald-600" : row.kind === "purchase" ? "bg-indigo-500/12 text-indigo-600" : row.kind === "transfer" ? "bg-sky-500/12 text-sky-600" : "bg-amber-500/12 text-amber-600")}>
                  {kindLabel(row.kind)}
                </span>
              </div>
              <div className={cx("mt-2 flex flex-wrap items-center gap-2 text-sm", subtle)}>
                <span className={cx("inline-flex items-center gap-2 rounded-xl border px-3 py-2", border, soft)}>
                  <I.Calendar className="h-4 w-4" />
                  {row.date}, {row.time}
                </span>
                <span className={cx("rounded-xl border px-3 py-2", border, soft)}>{row.status}</span>
                <span className={cx("rounded-xl border px-3 py-2", border, soft)}>Fiscal: {fiscalValue(row)}</span>
              </div>
            </div>
            <div className={cx("grid min-w-[280px] gap-2 rounded-2xl border p-4", border, soft)}>
              <SummaryLine label="Məbləğ" value={`${money(row.total)} ₼`} />
              <SummaryLine label="Ödənilib" value={`${money(row.paid)} ₼`} />
              <SummaryLine label="Qalıq" value={`${money(Math.max(row.total - row.paid, 0))} ₼`} danger={row.total > row.paid} />
              <SummaryLine label="Endirim" value="0%" />
            </div>
          </div>

          <div className="mb-6 grid gap-3 md:grid-cols-3">
            <InfoTile label="Hesab" value={row.sender} isDark={isDark} />
            <InfoTile label={row.kind === "purchase" ? "Təchizatçı" : "Müştəri"} value={row.recipient} isDark={isDark} />
            <InfoTile label="Müəllif" value={row.author} isDark={isDark} />
          </div>

          <SectionTitle title="Ödəniş" isDark={isDark} />
          <div className={cx("mb-8 overflow-hidden rounded-2xl border", border)}>
            <table className="w-full min-w-[720px] text-sm">
              <thead className={isDark ? "bg-white/5 text-slate-400" : "bg-slate-50 text-slate-500"}>
                <tr>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Hesab</th>
                  <th className="px-4 py-3 text-left">Kontragent</th>
                  <th className="px-4 py-3 text-left">Tarix</th>
                  <th className="px-4 py-3 text-right">Məbləğ</th>
                </tr>
              </thead>
              <tbody>
                <tr className={cx("border-t", border)}>
                  <td className="px-4 py-3"><span className="inline-flex h-3 w-3 rounded-full bg-sky-500" /></td>
                  <td className="px-4 py-3 font-medium text-indigo-600">{row.sender}</td>
                  <td className="px-4 py-3 font-medium text-indigo-600">{row.recipient}</td>
                  <td className="px-4 py-3">{row.date}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(row.paid)} ₼</td>
                </tr>
              </tbody>
            </table>
          </div>

          <SectionTitle title="Məhsullar" isDark={isDark} />
          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className={cx("flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border px-3", border, soft, subtle)}>
              <I.Search className="h-5 w-5" />
              Məhsul axtarışı
            </div>
            <button type="button" className={cx("h-11 rounded-xl border px-4 text-sm font-medium", border, soft)}>
              Məhsullar üzərində fəaliyyətlər
            </button>
          </div>

          <div className={cx("overflow-hidden rounded-2xl border", border)}>
            <table className="w-full min-w-[980px] text-sm">
              <thead className={isDark ? "bg-white/5 text-slate-400" : "bg-slate-50 text-slate-500"}>
                <tr>
                  <th className="px-4 py-3 text-left">Ad</th>
                  <th className="px-4 py-3 text-left">Variasiya</th>
                  <th className="px-4 py-3 text-left">Bar-kod</th>
                  <th className="px-4 py-3 text-left">Artikul</th>
                  <th className="px-4 py-3 text-right">Miqdar</th>
                  <th className="px-4 py-3 text-right">Qiymət</th>
                  <th className="px-4 py-3 text-right">Endirim</th>
                  <th className="px-4 py-3 text-right">Ümumi</th>
                </tr>
              </thead>
              <tbody>
                {products.map((product) => (
                  <tr key={`${row.id}-${product.productId}`} className={cx("border-t", border, isDark ? "hover:bg-white/5" : "hover:bg-slate-50")}>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => onProductOpen(product)} className="inline-flex items-center gap-2 font-medium text-indigo-600 hover:text-indigo-500">
                        <I.Box className="h-4 w-4 text-slate-400" />
                        {product.name}
                        <I.External className="h-3.5 w-3.5" />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cx("inline-flex rounded-full px-2.5 py-1 text-xs font-medium", isDark ? "bg-indigo-400/12 text-indigo-200" : "bg-indigo-50 text-indigo-700")}>{product.variant}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{product.barcode}</td>
                    <td className="px-4 py-3">{product.sku}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{product.qty.toLocaleString("az-Latn-AZ")}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(product.price)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{money(product.discount)}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{money(product.total)}</td>
                  </tr>
                ))}
                <tr className={cx("border-t font-semibold", border, isDark ? "bg-white/5" : "bg-slate-50")}>
                  <td className="px-4 py-3" colSpan={4}>Ümumi nəticə</td>
                  <td className="px-4 py-3 text-right tabular-nums">{qtyTotal.toLocaleString("az-Latn-AZ")}</td>
                  <td className="px-4 py-3 text-right">-</td>
                  <td className="px-4 py-3 text-right">0.00</td>
                  <td className="px-4 py-3 text-right tabular-nums">{money(productsTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {containers.length > 0 && (
            <PurchasePalletDetails containers={containers} products={products} isDark={isDark} />
          )}
        </div>
      </section>
      {printOpen && createPortal(
        <SmartPrintOptionsDialog
          row={row}
          products={products}
          document={document}
          printSettings={printSettings}
          isDark={isDark}
          hasPallets={containers.length > 0}
          hasCustomsSelection={hasCustomsSelection}
          onClose={() => setPrintOpen(false)}
        />,
        window.document.body
      )}
    </div>
  );
}

function SmartPrintOptionsDialog({
  row,
  products,
  document,
  printSettings,
  isDark,
  hasPallets,
  hasCustomsSelection,
  onClose,
}: {
  row: ActivityRow;
  products: ProductLine[];
  document?: ApiDocument;
  printSettings: PrintSettings;
  isDark: boolean;
  hasPallets: boolean;
  hasCustomsSelection: boolean;
  onClose: () => void;
}) {
  const border = isDark ? "border-white/10" : "border-slate-200";
  const panel = isDark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-900";
  const subtle = isDark ? "text-slate-400" : "text-slate-500";
  const isSaleDocument = row.kind === "sale" || row.documentType === "sale";
  const isExportSale = Boolean(document?.saleMode === "export" || document?.exportMode || hasCustomsSelection);
  const [options, setOptions] = useState<DocumentPrintOptions>({
    ...printDefaultOptions,
    formMode: isSaleDocument ? (isExportSale ? "proforma" : "orderConfirmation") : hasCustomsSelection ? "customs" : "standard",
    palletMode: hasPallets ? "withPallets" : "withoutPallets",
    paperMode: hasCustomsSelection || isExportSale ? "landscape" : "portrait",
  });
  const [message, setMessage] = useState("");

  const setOption = <K extends keyof DocumentPrintOptions>(key: K, value: DocumentPrintOptions[K]) => {
    setOptions((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const createPdf = () => {
    const ok = openDocumentPrint(row, products, document, options, printSettings);
    if (!ok) {
      setMessage("Brauzer yeni pəncərəni blokladı. Popup icazəsini açıb yenidən yoxla.");
      return;
    }
    onClose();
  };

  const createExcel = () => {
    const safeId = String(row.documentId || row.id).replace(/[^\w-]+/g, "-");
    if (options.formMode === "packingList") {
      const rows = buildPackingRows(document, products);
      if (rows.length === 0) {
        setMessage("Packing List üçün palet və rulo məlumatı tapılmadı.");
        return;
      }
      downloadTextFile(
        buildPackingExcelXml(row, document, products, options, printSettings),
        `packing-list-${safeId}.xls`,
        "application/vnd.ms-excel;charset=utf-8"
      );
      onClose();
      return;
    }
    if (options.formMode === "customs") {
      const sheets = buildCustomsSheets(document, products);
      if (sheets.length === 0) {
        setMessage("Antrepo düşüm üçün seçilmiş bəyannamə, palet və rulo tapılmadı.");
        return;
      }
      downloadTextFile(
        buildCustomsExcelXml(row, document, products, printSettings),
        `antrepo-dusum-${safeId}.xls`,
        "application/vnd.ms-excel;charset=utf-8"
      );
      onClose();
      return;
    }
    setMessage("Excel çıxışı yalnız Antrepo düşüm və Packing List formaları üçün yaradılır.");
  };

  const formChoices = isSaleDocument
    ? [
        { value: "orderConfirmation", label: "Sipariş onay formu", description: "Adi satış üçün KDV və döviz qeydi olan təsdiq forması." },
        { value: "proforma", label: "Proforma invoice", description: "İxracat üçün ilkin invoice. KDV göstərilmir.", disabled: !isExportSale },
        { value: "commercial", label: "Commercial invoice", description: "Rəsmi ixrac invoice forması. GIB/fatura nömrəsi üçün.", disabled: !isExportSale },
        { value: "packingList", label: "Packing list", description: "Göndərilən palet, rulo, LM və çəkilərin siyahısı.", disabled: !isExportSale },
        { value: "customs", label: "Antrepo düşüm", description: "Bəyannamə üzrə kap, MT, çəki, palet və rulo forması.", disabled: !hasCustomsSelection },
        { value: "standard", label: "ERP satış sənədi", description: "Sistemdəki standart satış sənədi görünüşü." },
      ]
    : [
        { value: "standard", label: "Standart sənəd", description: "ERP sənədinin məhsul və palet görünüşü." },
        { value: "customs", label: "Antrepo düşüm", description: "Bəyannamə üzrə kap, MT, çəki, palet və rulo forması.", disabled: !hasCustomsSelection },
      ];
  const canExportExcel = options.formMode === "customs" || options.formMode === "packingList";

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <section className={cx("w-full max-w-2xl rounded-[24px] border p-4 shadow-2xl", border, panel)} onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold">Çap forması</h3>
            <p className={cx("mt-1 text-sm", subtle)}>PDF və Excel üçün sənəd görünüşünü seç.</p>
          </div>
          <button type="button" onClick={onClose} className={cx("flex h-10 w-10 items-center justify-center rounded-xl border", border, isDark ? "hover:bg-white/10" : "hover:bg-slate-50")} aria-label="Bağla">
            <I.X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <PrintChoiceGroup
            title="Sənəd forması"
            value={options.formMode}
            options={formChoices}
            isDark={isDark}
            onChange={(value) => {
              const next = value as PrintFormMode;
              setOptions((current) => ({
                ...current,
                formMode: next,
                paperMode: next === "customs" || next === "orderConfirmation" || next === "proforma" || next === "commercial" ? "landscape" : current.paperMode,
              }));
              setMessage("");
            }}
          />

          {options.formMode === "packingList" && (
            <PrintChoiceGroup
              title="Paletləmə sualı"
              value={options.packingStrategy}
              options={[
                { value: "keepSelection", label: "Tam paletləri qoru", description: "Tam palet parçalanmır, eyni bəyannamə ruloları birlikdə saxlanır." },
                { value: "splitTen", label: "20 rulonu 10/10 böl", description: "20 rulo kimi hallarda iki balanslı palet təklifi üçün." },
                { value: "keepPartial", label: "Parçalı qalsın", description: "Seçilən rulolar palet bölgüsü dəyişmədən çıxır." },
              ]}
              isDark={isDark}
              onChange={(value) => setOption("packingStrategy", value as PackingStrategy)}
            />
          )}

          {options.formMode === "standard" && (
            <>
              <PrintChoiceGroup
                title="Stok detalları"
                value={options.palletMode}
                options={[
                  { value: "withPallets", label: "Paletli", description: "Konteyner, palet və rulo məlumatları daxil olsun.", disabled: !hasPallets },
                  { value: "withoutPallets", label: "Paletsiz", description: "Yalnız sənəd və məhsul cədvəli çıxsın." },
                ]}
                isDark={isDark}
                onChange={(value) => setOption("palletMode", value as PrintPalletMode)}
              />
              <PrintChoiceGroup
                title="Palet görünüşü"
                value={options.detailMode}
                options={[
                  { value: "compact", label: "Yığcam", description: "Eyni məhsul, uzunluq və qalınlıq üzrə toplam." },
                  { value: "detail", label: "Detallı", description: "Hər rulo ayrıca sətirdə görünsün." },
                ]}
                isDark={isDark}
                onChange={(value) => setOption("detailMode", value as PrintDetailMode)}
              />
            </>
          )}

          {options.formMode !== "packingList" && (
            <PrintChoiceGroup
              title="Kağız"
              value={options.paperMode}
              options={[
                { value: "portrait", label: "Şaquli", description: "Standart sənəd çapı." },
                { value: "landscape", label: "Üfüqi", description: "Geniş cədvəllər üçün rahat." },
              ]}
              isDark={isDark}
              onChange={(value) => setOption("paperMode", value as PrintPaperMode)}
            />
          )}
        </div>

        {message && <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">{message}</div>}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className={cx("text-xs", subtle)}>PDF yeni pəncərədə açılır; brauzerdə “Save as PDF” seçilə bilər.</div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={createExcel}
              disabled={!canExportExcel}
              className={cx("inline-flex h-11 items-center gap-2 rounded-xl border px-5 text-sm font-semibold", border, !canExportExcel && "cursor-not-allowed opacity-45")}
            >
              <I.Download className="h-4 w-4" />
              Excel yarat
            </button>
            <button type="button" onClick={createPdf} className="surface-primary inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold">
              <I.Printer className="h-4 w-4" />
              PDF yarat
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

export function PrintOptionsDialog({
  row,
  products,
  document,
  printSettings,
  isDark,
  hasPallets,
  hasCustomsSelection,
  onClose,
}: {
  row: ActivityRow;
  products: ProductLine[];
  document?: ApiDocument;
  printSettings: PrintSettings;
  isDark: boolean;
  hasPallets: boolean;
  hasCustomsSelection: boolean;
  onClose: () => void;
}) {
  const border = isDark ? "border-white/10" : "border-slate-200";
  const panel = isDark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-900";
  const subtle = isDark ? "text-slate-400" : "text-slate-500";
  const [options, setOptions] = useState<DocumentPrintOptions>({
    ...printDefaultOptions,
    formMode: hasCustomsSelection ? "customs" : "standard",
    palletMode: hasPallets ? "withPallets" : "withoutPallets",
    paperMode: hasCustomsSelection ? "landscape" : "portrait",
  });
  const [message, setMessage] = useState("");

  const setOption = <K extends keyof DocumentPrintOptions>(key: K, value: DocumentPrintOptions[K]) => {
    setOptions((current) => ({ ...current, [key]: value }));
    setMessage("");
  };

  const createPdf = () => {
    const ok = openDocumentPrint(row, products, document, options, printSettings);
    if (!ok) {
      setMessage("Brauzer yeni pəncərəni blokladı. Popup icazəsini açıb yenidən yoxla.");
      return;
    }
    onClose();
  };

  const createExcel = () => {
    if (options.formMode !== "customs") {
      setMessage("Excel çıxarışı gömrük üçün ithalat forması seçildikdə yaradılır.");
      return;
    }
    const sheets = buildCustomsSheets(document, products);
    if (sheets.length === 0) {
      setMessage("Excel üçün seçilmiş bəyannamə, palet və rulo tapılmadı.");
      return;
    }
    const safeId = String(row.documentId || row.id).replace(/[^\w-]+/g, "-");
    downloadTextFile(
      buildCustomsExcelXml(row, document, products, printSettings),
      `antrepo-dusum-${safeId}.xls`,
      "application/vnd.ms-excel;charset=utf-8"
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <section className={cx("w-full max-w-xl rounded-[24px] border p-4 shadow-2xl", border, panel)} onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold">Çap forması</h3>
            <p className={cx("mt-1 text-sm", subtle)}>PDF və Excel üçün sənəd görünüşünü seç.</p>
          </div>
          <button type="button" onClick={onClose} className={cx("flex h-10 w-10 items-center justify-center rounded-xl border", border, isDark ? "hover:bg-white/10" : "hover:bg-slate-50")} aria-label="Bağla">
            <I.X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <PrintChoiceGroup
            title="Sənəd forması"
            value={options.formMode}
            options={[
              { value: "standard", label: "Standart sənəd", description: "ERP sənədinin məhsul və palet görünüşü." },
              { value: "customs", label: "Antrepo düşüm", description: "Bəyannamə üzrə kap, MT, çəki, palet və rulo forması.", disabled: !hasCustomsSelection },
            ]}
            isDark={isDark}
            onChange={(value) => setOption("formMode", value as PrintFormMode)}
          />

          {options.formMode === "standard" && (
            <>
              <PrintChoiceGroup
                title="Stok detalları"
                value={options.palletMode}
                options={[
                  { value: "withPallets", label: "Paletli", description: "Konteyner, palet və rulo məlumatları daxil olsun.", disabled: !hasPallets },
                  { value: "withoutPallets", label: "Paletsiz", description: "Yalnız sənəd və məhsul cədvəli çıxsın." },
                ]}
                isDark={isDark}
                onChange={(value) => setOption("palletMode", value as PrintPalletMode)}
              />

              <PrintChoiceGroup
                title="Palet görünüşü"
                value={options.detailMode}
                options={[
                  { value: "compact", label: "Yığcam", description: "Eyni məhsul, uzunluq və qalınlıq üzrə toplam." },
                  { value: "detail", label: "Detallı", description: "Hər rulo ayrıca sətirdə görünsün." },
                ]}
                isDark={isDark}
                onChange={(value) => setOption("detailMode", value as PrintDetailMode)}
              />

              <PrintChoiceGroup
                title="Kağız"
                value={options.paperMode}
                options={[
                  { value: "portrait", label: "Şaquli", description: "Standart sənəd çapı." },
                  { value: "landscape", label: "Üfüqi", description: "Geniş cədvəllər üçün rahat." },
                ]}
                isDark={isDark}
                onChange={(value) => setOption("paperMode", value as PrintPaperMode)}
              />
            </>
          )}
        </div>

        {message && <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">{message}</div>}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className={cx("text-xs", subtle)}>Açılan pəncərədə printer kimi “Save as PDF” seç.</div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={createExcel}
              disabled={options.formMode !== "customs"}
              className={cx("inline-flex h-11 items-center gap-2 rounded-xl border px-5 text-sm font-semibold", border, options.formMode !== "customs" && "cursor-not-allowed opacity-45")}
            >
              <I.Download className="h-4 w-4" />
              Excel yarat
            </button>
            <button type="button" onClick={createPdf} className="surface-primary inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold">
              <I.Printer className="h-4 w-4" />
              PDF yarat
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

function PrintChoiceGroup({
  title,
  value,
  options,
  isDark,
  onChange,
}: {
  title: string;
  value: string;
  options: { value: string; label: string; description: string; disabled?: boolean }[];
  isDark: boolean;
  onChange: (value: string) => void;
}) {
  const border = isDark ? "border-white/10" : "border-slate-200";
  const subtle = isDark ? "text-slate-400" : "text-slate-500";
  return (
    <div>
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              disabled={option.disabled}
              onClick={() => onChange(option.value)}
              className={cx(
                "rounded-2xl border p-3 text-left transition",
                active ? "border-indigo-400 bg-indigo-500/10 text-indigo-600" : border,
                option.disabled
                  ? "cursor-not-allowed opacity-45"
                  : isDark
                    ? "hover:bg-white/7"
                    : "hover:bg-slate-50"
              )}
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                <span className={cx("h-2.5 w-2.5 rounded-full", active ? "bg-indigo-500" : isDark ? "bg-slate-600" : "bg-slate-300")} />
                {option.label}
              </span>
              <span className={cx("mt-1 block text-xs", subtle)}>{option.description}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const toDetailNumber = (value: unknown) => {
  const parsed = Number(String(value ?? "").replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};

const rollProductName = (roll: ApiRoll, products: ProductLine[]) =>
  products.find((product) => product.productId === Number(roll.productId))?.name ?? "Məhsul";

function detailRollTotals(rolls: ApiRoll[] = []): { qty: number; netKg: number; grossKg: number } {
  return rolls.reduce<{ qty: number; netKg: number; grossKg: number }>(
    (sum, roll) => ({
      qty: sum.qty + toDetailNumber(roll.qty),
      netKg: sum.netKg + toDetailNumber(roll.netKg),
      grossKg: sum.grossKg + toDetailNumber(roll.grossKg),
    }),
    { qty: 0, netKg: 0, grossKg: 0 }
  );
}

function compactRollGroups(rolls: ApiRoll[] = [], products: ProductLine[]) {
  const groups = new Map<
    string,
    {
      id: string;
      productName: string;
      rollCount: number;
      qty: number;
      netKg: number;
      grossKg: number;
      lengthLabel: string;
      thicknessLabel: string;
    }
  >();

  rolls.forEach((roll) => {
    const productKey = String(roll.productId ?? rollProductName(roll, products));
    const lengthLabel = String(roll.width || "-");
    const thicknessLabel = String(roll.thickness || "-");
    const key = `${productKey}|${lengthLabel}|${thicknessLabel}`;
    const current = groups.get(key) ?? {
      id: key,
      productName: rollProductName(roll, products),
      rollCount: 0,
      qty: 0,
      netKg: 0,
      grossKg: 0,
      lengthLabel,
      thicknessLabel,
    };
    current.rollCount += 1;
    current.qty += toDetailNumber(roll.qty);
    current.netKg += toDetailNumber(roll.netKg);
    current.grossKg += toDetailNumber(roll.grossKg);
    groups.set(key, current);
  });

  return Array.from(groups.values());
}

const palletDisplayName = (pallet: ApiPallet, index: number) => {
  const raw = pallet.number?.trim() || `Palet ${index + 1}`;
  return raw.match(/^(Palet\s+\S+)\s+-\s+.+$/i)?.[1] ?? raw;
};

function PurchasePalletDetails({
  containers,
  products,
  isDark,
}: {
  containers: ApiContainer[];
  products: ProductLine[];
  isDark: boolean;
}) {
  const border = isDark ? "border-white/10" : "border-slate-200";
  const soft = isDark ? "bg-white/7" : "bg-slate-50";
  const card = isDark ? "bg-slate-950/35" : "bg-white";
  const subtle = isDark ? "text-slate-400" : "text-slate-500";
  const [viewMode, setViewMode] = useState<"compact" | "detail">("compact");

  return (
    <section className="mt-8">
      <SectionTitle title="Palet detalları" isDark={isDark} />

      <div className="space-y-4">
        {containers.map((container, containerIndex) => {
          const containerRolls = (container.pallets ?? []).flatMap((pallet) => pallet.rolls ?? []);
          const containerTotals = detailRollTotals(containerRolls);
          return (
            <div key={container.id ?? `${container.number}-${containerIndex}`} className={cx("overflow-hidden rounded-2xl border", border, card)}>
              <div className={cx("flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between", border, soft)}>
                <div>
                  <div className="text-base font-semibold">{container.number || `Konteyner ${containerIndex + 1}`}</div>
                  <div className={cx("mt-1 flex flex-wrap gap-2 text-xs", subtle)}>
                    {container.invoice && <span>Invoice / BL: {container.invoice}</span>}
                    <span>{container.customsStatus === "released" ? "Sərbəst" : "Antrepo"}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-2 text-xs font-semibold">
                  <div className={cx("mr-1 inline-flex rounded-2xl border p-1", border, isDark ? "bg-white/5" : "bg-white")}>
                    {([
                      ["compact", "Yığcam"],
                      ["detail", "Detallı"],
                    ] as const).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setViewMode(id)}
                        className={cx(
                          "h-8 rounded-xl px-3 text-xs font-semibold transition",
                          viewMode === id
                            ? "surface-primary"
                            : isDark
                              ? "text-slate-300 hover:bg-white/10"
                              : "text-slate-600 hover:bg-slate-50"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className={cx("rounded-full px-3 py-1", isDark ? "bg-white/10" : "bg-white")}>{container.pallets?.length ?? 0} palet</span>
                  <span className={cx("rounded-full px-3 py-1", isDark ? "bg-white/10" : "bg-white")}>{containerRolls.length} rulo</span>
                  <span className={cx("rounded-full px-3 py-1", isDark ? "bg-white/10" : "bg-white")}>{containerTotals.qty.toLocaleString("az-Latn-AZ")} miqdar</span>
                </div>
              </div>

              <div className="space-y-3 p-3">
                {(container.pallets ?? []).map((pallet, palletIndex) => {
                  const palletRolls = pallet.rolls ?? [];
                  const palletTotals = detailRollTotals(palletRolls);
                  const palletGroups = compactRollGroups(palletRolls, products);
                  return (
                    <div key={pallet.id ?? `${pallet.number}-${palletIndex}`} className={cx("overflow-hidden rounded-xl border", border, isDark ? "bg-white/5" : "bg-slate-50/80")}>
                      <div className={cx("flex flex-col gap-2 border-b px-3 py-2 sm:flex-row sm:items-center sm:justify-between", border)}>
                        <div className="font-semibold">{palletDisplayName(pallet, palletIndex)}</div>
                        <div className={cx("text-xs font-semibold tabular-nums", subtle)}>
                          {palletRolls.length} rulo · {palletTotals.qty.toLocaleString("az-Latn-AZ")} miqdar · {palletTotals.netKg.toLocaleString("az-Latn-AZ")} / {palletTotals.grossKg.toLocaleString("az-Latn-AZ")} kg
                        </div>
                      </div>
                      {viewMode === "compact" ? (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[920px] text-sm">
                            <thead className={isDark ? "text-slate-400" : "text-slate-500"}>
                              <tr>
                                <th className="px-3 py-2 text-left">Məhsul</th>
                                <th className="px-3 py-2 text-right">Rulo sayı</th>
                                <th className="px-3 py-2 text-right">Uzunluq</th>
                                <th className="px-3 py-2 text-right">Qalınlıq</th>
                                <th className="px-3 py-2 text-right">Miqdar</th>
                                <th className="px-3 py-2 text-right">Net kg</th>
                                <th className="px-3 py-2 text-right">Gross kg</th>
                              </tr>
                            </thead>
                            <tbody>
                              {palletGroups.map((group) => (
                                <tr key={group.id} className={cx("border-t", border)}>
                                  <td className="px-3 py-2 font-medium text-indigo-600">{group.productName}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{group.rollCount}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{group.lengthLabel}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{group.thicknessLabel}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{group.qty.toLocaleString("az-Latn-AZ")}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{group.netKg.toLocaleString("az-Latn-AZ")}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{group.grossKg.toLocaleString("az-Latn-AZ")}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[920px] text-sm">
                            <thead className={isDark ? "text-slate-400" : "text-slate-500"}>
                              <tr>
                                <th className="px-3 py-2 text-left">Məhsul</th>
                                <th className="px-3 py-2 text-left">Rulo</th>
                                <th className="px-3 py-2 text-right">Uzunluq</th>
                                <th className="px-3 py-2 text-right">Qalınlıq</th>
                                <th className="px-3 py-2 text-right">Miqdar</th>
                                <th className="px-3 py-2 text-right">Net kg</th>
                                <th className="px-3 py-2 text-right">Gross kg</th>
                              </tr>
                            </thead>
                            <tbody>
                              {palletRolls.map((roll, rollIndex) => (
                                <tr key={roll.id ?? `${pallet.id}-${rollIndex}`} className={cx("border-t", border)}>
                                  <td className="px-3 py-2 font-medium text-indigo-600">{rollProductName(roll, products)}</td>
                                  <td className="px-3 py-2">{roll.rollNo || "-"}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{roll.width || "-"}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{roll.thickness || "-"}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{toDetailNumber(roll.qty).toLocaleString("az-Latn-AZ")}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{toDetailNumber(roll.netKg).toLocaleString("az-Latn-AZ")}</td>
                                  <td className="px-3 py-2 text-right tabular-nums">{toDetailNumber(roll.grossKg).toLocaleString("az-Latn-AZ")}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ActivityEditPanel({
  row,
  products,
  isDark,
  onClose,
  onSaved,
}: {
  row: ActivityRow;
  products: ProductLine[];
  isDark: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const border = isDark ? "border-white/10" : "border-slate-200";
  const panel = isDark ? "bg-slate-950/95 text-slate-100 ring-white/10" : "bg-white text-slate-900 ring-slate-200";
  const input = cx("h-10 rounded-xl border px-3 text-sm outline-none", border, isDark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-800");
  const [lines, setLines] = useState<ProductLine[]>(() => products.map((item) => ({ ...item })));
  const [paid, setPaid] = useState(String(row.paid));
  const [status, setStatus] = useState(row.status);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const total = lines.reduce((sum, item) => sum + Math.max(0, item.qty * item.price - item.discount), 0);
  const paidNumber = Math.max(0, Number(String(paid).replace(",", ".")) || 0);
  const remaining = Math.max(0, total - paidNumber);
  const paymentStatus = total <= 0 || paidNumber <= 0 ? "Gözləyir" : paidNumber < total ? "Qismən" : "Ödənilib";

  const updateLine = (productId: number, patch: Partial<ProductLine>) => {
    setLines((current) => current.map((item) => (
      item.productId === productId
        ? {
            ...item,
            ...patch,
            total: Math.max(0, (patch.qty ?? item.qty) * (patch.price ?? item.price) - (patch.discount ?? item.discount)),
          }
        : item
    )));
  };

  const save = async () => {
    if (!row.documentId) return;
    setSaving(true);
    setMessage("");
    try {
      await requestJson(`/api/documents/${row.documentId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          posted: status !== "Hazırlanır",
          status: status === "Hazırlanır" ? "draft" : "posted",
          total,
          paid: paidNumber,
          paymentSummary: {
            total,
            paid: paidNumber,
            remaining,
            status: paymentStatus,
          },
          lines: lines.map((item) => ({
            productId: item.productId,
            name: item.name,
            barcode: item.barcode,
            sku: item.sku,
            variant: item.variant,
            qty: item.qty,
            price: item.price,
            discount: item.discount,
            total: Math.max(0, item.qty * item.price - item.discount),
            warehouse: item.warehouse,
            available: item.available,
          })),
        }),
      });
      onSaved();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sənəd saxlanmadı");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-md">
      <section className={cx("flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-[26px] shadow-2xl ring-1", panel)}>
        <div className={cx("flex items-center justify-between gap-3 border-b p-3", border)}>
          <div className="flex items-center gap-3">
            <button type="button" onClick={onClose} className={cx("flex h-11 w-11 items-center justify-center rounded-xl border", border)} aria-label="Bağla">
              <I.X className="h-5 w-5" />
            </button>
            <div>
              <h3 className="text-lg font-semibold">{row.order}</h3>
              <p className={cx("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Sənəd redaktəsi</p>
            </div>
          </div>
          <button type="button" onClick={save} disabled={saving} className={cx("surface-primary h-11 rounded-xl px-5 text-sm font-semibold", saving && "opacity-70")}>
            {saving ? "Saxlanır..." : "Saxla"}
          </button>
        </div>

        <div className="min-h-0 overflow-auto p-5">
          {message && <div className="mb-4 rounded-xl bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-600">{message}</div>}
          <div className="mb-5 grid gap-4 md:grid-cols-3">
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-500">Status</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as ActivityRow["status"])} className={cx(input, "w-full")}>
                <option value="Təsdiqlənib">Təsdiqlənib</option>
                <option value="Hazırlanır">Hazırlanır</option>
                <option value="Ləğv edilib">Ləğv edilib</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm font-semibold text-slate-500">Ödənilib</span>
              <input type="number" min="0" step="0.01" value={paid} onChange={(event) => setPaid(event.target.value)} className={cx(input, "w-full text-right tabular-nums")} />
            </label>
            <div className={cx("rounded-2xl border p-3", border, isDark ? "bg-white/5" : "bg-slate-50")}>
              <div className="text-xs font-semibold text-slate-500">Yekun / qalıq</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{money(total)} ₼</div>
              <div className={cx("text-sm tabular-nums", remaining > 0 ? "text-amber-600" : "text-emerald-600")}>{paymentStatus} · {money(remaining)} ₼</div>
            </div>
          </div>

          <div className={cx("overflow-hidden rounded-2xl border", border)}>
            <table className="w-full min-w-[860px] text-sm">
              <thead className={isDark ? "bg-white/5 text-slate-400" : "bg-slate-50 text-slate-500"}>
                <tr>
                  <th className="px-4 py-3 text-left">Məhsul</th>
                  <th className="px-4 py-3 text-left">Variasiya</th>
                  <th className="px-4 py-3 text-right">Miqdar</th>
                  <th className="px-4 py-3 text-right">Qiymət</th>
                  <th className="px-4 py-3 text-right">Endirim</th>
                  <th className="px-4 py-3 text-right">Ümumi</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.productId} className={cx("border-t", border)}>
                    <td className="px-4 py-3 font-semibold text-indigo-600">{line.name}</td>
                    <td className="px-4 py-3">{line.variant}</td>
                    <td className="px-4 py-3 text-right"><EditNumber value={line.qty} onChange={(value) => updateLine(line.productId, { qty: value })} /></td>
                    <td className="px-4 py-3 text-right"><EditNumber value={line.price} step="0.01" onChange={(value) => updateLine(line.productId, { price: value })} /></td>
                    <td className="px-4 py-3 text-right"><EditNumber value={line.discount} step="0.01" onChange={(value) => updateLine(line.productId, { discount: value })} /></td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{money(Math.max(0, line.qty * line.price - line.discount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

function EditNumber({ value, onChange, step = "1" }: { value: number; onChange: (value: number) => void; step?: string }) {
  return (
    <input
      type="number"
      min="0"
      step={step}
      value={Number.isFinite(value) ? value : 0}
      onChange={(event) => onChange(Number(event.target.value) || 0)}
      className="h-9 w-24 rounded-lg border border-slate-200 bg-white px-2 text-right tabular-nums outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
    />
  );
}

void ActivityEditPanel;

function ProductPreviewPanel({ product, isDark, onClose }: { product: ProductLine; isDark: boolean; onClose: () => void }) {
  const border = isDark ? "border-white/10" : "border-slate-200";
  const panel = isDark ? "bg-slate-950/95 text-slate-100 ring-white/10" : "bg-white text-slate-900 ring-slate-200";
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/25 p-4 backdrop-blur-sm">
      <section className={cx("w-full max-w-xl overflow-hidden rounded-[24px] shadow-2xl ring-1", panel)}>
        <div className={cx("flex items-center justify-between border-b p-4", border)}>
          <div className="flex items-center gap-3">
            <span className={cx("flex h-11 w-11 items-center justify-center rounded-2xl", isDark ? "bg-white/10 text-indigo-200" : "bg-indigo-50 text-indigo-600")}>
              <I.Box className="h-6 w-6" />
            </span>
            <div>
              <h3 className="text-lg font-semibold">{product.name}</h3>
              <p className={cx("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>{product.variant}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className={cx("flex h-10 w-10 items-center justify-center rounded-xl border", border)} aria-label="Məhsul kartını bağla">
            <I.X className="h-5 w-5" />
          </button>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <InfoTile label="Bar-kod" value={product.barcode} isDark={isDark} />
          <InfoTile label="Artikul" value={product.sku} isDark={isDark} />
          <InfoTile label="Anbar" value={product.warehouse} isDark={isDark} />
          <InfoTile label="Qalıq" value={product.available.toLocaleString("az-Latn-AZ")} isDark={isDark} />
          <InfoTile label="Son qiymət" value={`${money(product.price)} ₼`} isDark={isDark} />
          <InfoTile label="Bu sənəddə" value={`${product.qty.toLocaleString("az-Latn-AZ")} ədəd`} isDark={isDark} />
        </div>
      </section>
    </div>
  );
}

function InfoTile({ label, value, isDark }: { label: string; value: string; isDark: boolean }) {
  return (
    <div className={cx("rounded-2xl border p-3", isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-slate-50")}>
      <div className={cx("text-xs font-medium", isDark ? "text-slate-400" : "text-slate-500")}>{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}

function SummaryLine({ label, value, danger = false }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-6 text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={cx("font-semibold tabular-nums", danger && "text-rose-600")}>{value}</span>
    </div>
  );
}

function SectionTitle({ title, isDark }: { title: string; isDark: boolean }) {
  return (
    <div className="mb-4 flex items-center gap-4">
      <div className={cx("h-px flex-1", isDark ? "bg-white/10" : "bg-slate-200")} />
      <h3 className="text-base font-bold uppercase tracking-wide">{title}</h3>
      <div className={cx("h-px flex-1", isDark ? "bg-white/10" : "bg-slate-200")} />
    </div>
  );
}

function FragmentGroup({
  date,
  rows,
  isDark,
  border,
  rowHover,
  onOpen,
}: {
  date: string;
  rows: ActivityRow[];
  isDark: boolean;
  border: string;
  rowHover: string;
  onOpen: (row: ActivityRow) => void;
}) {
  return (
    <>
      <tr>
        <td colSpan={9} className={cx("border-b px-4 py-3 text-lg font-semibold", border, isDark ? "text-slate-100" : "text-slate-800")}>
          {date}
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.id} className={cx("group cursor-pointer transition", rowHover)} onClick={() => onOpen(row)}>
          <td className={cx("border-b px-4 py-3", border)}>
            <div className="flex items-center gap-3">
              <span className={cx("h-8 w-1 rounded-full", activityAccent(row))} />
              <span className={cx("flex h-7 w-7 items-center justify-center rounded-full", isDark ? "bg-white/10 text-indigo-200" : "bg-indigo-50 text-indigo-600")}>
                <I.Check className="h-4 w-4" />
              </span>
            </div>
          </td>
          <td className={cx("border-b px-4 py-3", border)}>
            <div className="font-medium text-indigo-600">{row.order}</div>
            <div className={cx("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{kindLabel(row.kind)} · {row.payment}</div>
          </td>
          <td className={cx("border-b px-4 py-3 tabular-nums", border)}>{row.time}</td>
          <td className={cx("border-b px-4 py-3 text-right tabular-nums", border)}>{row.items}</td>
          <td className={cx("border-b px-4 py-3 text-right tabular-nums", border)}>{money(row.total)}</td>
          <td className={cx("border-b px-4 py-3 text-right tabular-nums", border)}>{money(row.paid)}</td>
          <td className={cx("border-b px-4 py-3 text-indigo-600", border)}>{row.sender}</td>
          <td className={cx("border-b px-4 py-3 text-indigo-600", border)}>{row.recipient}</td>
          <td className={cx("border-b px-4 py-3 text-indigo-600", border)}>{row.author}</td>
        </tr>
      ))}
    </>
  );
}
