import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { requestJson } from "../api";
import ProductCreatePanel, { type ProductFormValues } from "../components/ProductCreatePanel";

/* ------------------------------ helpers ------------------------------ */
const cx = (...s: (string | false | undefined)[]) => s.filter(Boolean).join(" ");
const toNum = (n?: number) => (n == null ? "—" : n.toLocaleString("az-Latn-AZ"));
const toCurrency = (n?: number) =>
  n == null ? "—" : n.toLocaleString("az-Latn-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const parseOptionalNumber = (value?: string) => {
  if (value == null || value.trim() === "") return undefined;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
};

/* ------------------------------ UI tokens ------------------------------ */
const makeUI = (isDark: boolean) => ({
  // Bütün panellər (action bar, breadcrumb, cədvəl qabığı)
  card: `rounded-2xl border ${isDark ? "glass-panel-dark" : "glass-panel"}`,

  // Overlay və popup elementlər üçün ring
  ring: isDark ? "ring-1 ring-white/10" : "ring-1 ring-white/55",

  // Düymələr
  iconBtn: `w-10 h-10 rounded-xl flex items-center justify-center ${
    isDark ? "hover:bg-white/10" : "hover:bg-white/65"
  }`,
  iconBtnDisabled: "opacity-50 cursor-not-allowed",

  // Input-lar
  input: [
    "w-full h-10 px-3 rounded-xl border outline-none placeholder-slate-400",
    isDark
      ? "glass-control-dark text-slate-100 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30"
      : "glass-control text-slate-800 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/25",
  ].join(" "),

  // Cədvəl header fonu
  theadSticky: `sticky top-0 z-10 ${isDark ? "bg-slate-950/35" : "bg-white/45"} backdrop-blur-xl`,
  headerRow: `${isDark ? "text-slate-400 border-b border-white/10" : "text-slate-500 border-b border-white/55"} text-xs font-semibold`,
  rowHover: isDark ? "glass-row-hover-dark" : "glass-row-hover",
  rowDivider: isDark ? "border-t border-white/10" : "border-t border-white/55",

  chip: isDark
    ? "h-10 inline-flex items-center gap-2 px-3 rounded-full border glass-control-dark text-indigo-200"
    : "h-10 inline-flex items-center gap-2 px-3 rounded-full border glass-control text-indigo-700",

  textSubtle: isDark ? "text-slate-400" : "text-slate-500",
  crumbBtn:   isDark ? "text-slate-300 hover:text-slate-100" : "text-slate-600 hover:text-slate-800",
  crumbRoot:  isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700",

  borderSoft: isDark ? "border-white/10" : "border-white/60",
  iconColor:  isDark ? "text-slate-200" : "text-slate-700",
  primaryBtn: "surface-primary",

  // Kiçik ikon qutuları (folder/photo)
  softBox: isDark ? "glass-control-dark ring-1 ring-inset ring-white/10" : "glass-control ring-1 ring-inset ring-white/70",
});

/* ------------------------------ icons ------------------------------ */
const I = {
  Search: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="11" cy="11" r="7" /><path d="M21 21l-3.5-3.5" />
    </svg>
  ),
  Filter: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 5h18" /><path d="M7 12h10" /><path d="M10 19h4" />
    </svg>
  ),
  Plus: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  ),
  Dots: (p: React.SVGProps<SVGSVGElement>) => (<svg viewBox="0 0 24 24" fill="currentColor" {...p}><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>),
  Sliders: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" />
      <circle cx="8" cy="6" r="2" /><circle cx="15" cy="12" r="2" /><circle cx="11" cy="18" r="2" />
    </svg>
  ),
  Trash: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
    </svg>
  ),
  Download: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 3v12" /><path d="M8 11l4 4 4-4" /><path d="M21 21H3" />
    </svg>
  ),
  Upload: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M12 21V9" /><path d="M8 13l4-4 4 4" /><path d="M21 3H3" />
    </svg>
  ),
  Folder: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
    </svg>
  ),
  FolderCheck: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v7a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
      <path d="M4.5 16.5l3 3 6-6" stroke="white" strokeWidth="4.6" />
      <path d="M4.5 16.5l3 3 6-6" stroke="#16a34a" strokeWidth="2.7" />
    </svg>
  ),
  MoveToFolder: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 7a2 2 0 012-2h5l2 2h7a2 2 0 012 2v7a2 2 0 01-2 2h-6" />
      <path d="M3 15h9" /><path d="M9 12l3 3-3 3" />
    </svg>
  ),
  Tag: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M20 13l-7 7-9-9V4h7l9 9z" /><circle cx="8.5" cy="8.5" r="1.5" />
    </svg>
  ),
  Bell: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" />
    </svg>
  ),
  Box: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m3 7 9-4 9 4-9 4-9-4Z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" />
    </svg>
  ),
  Briefcase: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M10 6V5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v1" /><path d="M4 7h16v12H4z" /><path d="M4 12h16" />
    </svg>
  ),
  Layers: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /><path d="m3 18 9 5 9-5" />
    </svg>
  ),
  Category: (p: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" />
      <rect x="4" y="14" width="6" height="6" rx="1.5" /><path d="M14 17h6M17 14v6" />
    </svg>
  ),
  ChevronR: (p: React.SVGProps<SVGSVGElement>) => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M9 6l6 6-6 6"/></svg>),
};

/* ------------------------------ demo data ------------------------------ */
type ProductType = "product" | "service" | "bundle";
type CreateTarget = ProductType | "folder" | "category" | "import" | "export";
type ProductCardProfile = {
  brand?: string;
  plu?: string;
  imageDataUrl?: string;
  secondaryUnit?: string;
  conversionRate?: number;
  lengthCm?: number;
  widthCm?: number;
  depthCm?: number;
  weightKg?: number;
  rollWidthMm?: number;
  defaultRollLengthMt?: number;
  netWeightKg?: number;
  grossWeightKg?: number;
  volumeM3?: number;
  barcodeType?: "fixed" | "weight" | "quantity" | "plu";
  barcodeDecimals?: number;
  wholesalePrice?: number;
  discountPercent?: number;
  taxRate?: number;
  taxFree?: boolean;
  useStorePrices?: boolean;
  weighted?: boolean;
  packageName?: string;
  packageQty?: number;
  maxStock?: number;
  minOrderQty?: number;
  maxOrderQty?: number;
  negativeStockAllowed?: boolean;
  shelfLocation?: string;
  shelfLifeDays?: number;
  leadTimeDays?: number;
  warrantyMonths?: number;
  tariffCode?: string;
  supplierCode?: string;
  supplierProductCode?: string;
  alternativeProductIds?: number[];
  features?: string;
  note?: string;
};
type Product = {
  id: number;
  type: ProductType;
  ad: string;
  groupId: number | null;    // qovluq id-si (null = root)
  kod?: string;
  artikel?: string;
  barcode?: string;
  vahid?: string;
  sale_price?: number;
  cost?: number;
  purchase_price?: number;
  categoryIds?: number[];
  description?: string;
  country?: string;
  supplier?: string;
  minStock?: number;
  expirationDate?: string;
  freePrice?: boolean;
  storePrices?: boolean;
  modified?: boolean;
  antrepo?: number;
  depo?: number;
  expiresInDays?: number;
  daysSinceChange?: number;
  daysSinceSold?: number;
  active?: boolean;
  createdAt?: string;
  warehouseStock?: Record<string, number>;
  cardProfile?: ProductCardProfile;
};
type ApiProduct = {
  id: number;
  name: string;
  code: string;
  sku: string;
  barcode?: string;
  type: ProductType;
  unit: string;
  groupId: number | null;
  categoryIds?: number[];
  salePrice?: number;
  cost?: number;
  purchasePrice?: number;
  description?: string;
  country?: string;
  supplier?: string;
  minStock?: number;
  expirationDate?: string;
  freePrice?: boolean;
  storePrices?: boolean;
  modified?: boolean;
  active?: boolean;
  createdAt?: string;
  warehouses?: Record<string, number>;
  cardProfile?: ProductCardProfile;
};
type CompanyStore = {
  id: number;
  key: string;
  name: string;
  type: string;
  status: "active" | "inactive";
  createdAt: string;
};
type Group = { id: number; name: string; parentId: number | null };
type Category = { id: number; name: string; parentId: number | null };
type FolderId = number | "unassigned" | null;
type FolderRow = { id: Exclude<FolderId, null>; kind: "group" | "unassigned"; name: string; products: Product[] };
type AuditEntry = { id: number; productId: number; action: string; detail: string; at: string };
type StockMovement = {
  id: number;
  productId: number;
  type: "purchase" | "sale" | "return" | "adjustment" | "transfer";
  qty: number;
  place?: "antrepo" | "depo";
  from?: "antrepo" | "depo";
  to?: "antrepo" | "depo";
  note?: string;
  at: string;
};
type ProductVariant = {
  id: number;
  productId: number;
  name: string;
  barcode?: string;
  antrepo: number;
  depo: number;
  purchase_price?: number;
  cost?: number;
  sale_price?: number;
};
type BundleItem = { id: number; bundleId: number; productId: number; qty: number };
type StockMode = "simple" | "bondedRolls";
type TraceRollStatus = "Bağlı" | "Açıq" | "Rezervdə" | "Bitib" | "Zədəli";
type TraceRoll = {
  barcode: string;
  container: string;
  pallet: string;
  roll: string;
  productName: string;
  warehouse: "ERSA ANTREPO" | "ERSA DEPO";
  location: string;
  status: TraceRollStatus;
  initialMt: number;
  remainingMt: number;
  reservedMt: number;
  netKg: number;
  grossKg: number;
  lastAction: string;
};
type TraceWarehouse = {
  name: "ERSA ANTREPO" | "ERSA DEPO";
  qty: number;
  closedRolls: number;
  openRolls: number;
  reservedMt: number;
};
type CompanySettings = {
  stockMode: StockMode;
  allowNegativeStock?: boolean;
  reserveBeforeBondedExit?: boolean;
  rollTracking?: boolean;
};

const DEFAULT_STORES: CompanyStore[] = [
  { id: 1, key: "depo", name: "ERSA DEPO", type: "Əsas mağaza", status: "active", createdAt: "2024-09-22" },
  { id: 2, key: "antrepo", name: "ERSA ANTREPO", type: "Anbar", status: "active", createdAt: "2024-11-05" },
];

const DEFAULT_COMPANY_SETTINGS: CompanySettings = {
  stockMode: "simple",
  allowNegativeStock: false,
  reserveBeforeBondedExit: true,
  rollTracking: false,
};

const UNASSIGNED_FOLDER_ID = "unassigned" as const;
const UNASSIGNED_FOLDER_NAME = "Qovluqsuz";

const DEMO_GROUPS: Group[] = [
  { id: 1, name: "Parlaq rənglər", parentId: null },
  { id: 2, name: "Mat rənglər", parentId: null },
  { id: 3, name: "Metalik", parentId: 1 },
];

const DEMO_SEED_ROWS: Product[] = [
  { id: 1, type: "product", ad: "Soft Touch Kubanit Göy", groupId: 1, kod: "00146", artikel: "ANT-ERSA 517", vahid: "mt", antrepo: 485, depo: 0, sale_price: 11.9 },
  { id: 2, type: "product", ad: "Soft Touch Kubanit Gri", groupId: 2, kod: "00180", artikel: "ERSA 517", vahid: "mt", antrepo: 756, depo: 0, sale_price: 12.5 },
  { id: 3, type: "product", ad: "HG Füme", groupId: null, kod: "00204", artikel: "ERSA C1311", vahid: "mt", antrepo: 0, depo: 0, sale_price: 10.1 },
  { id: 4, type: "product", ad: "Metal Night Blue", groupId: 3, kod: "00311", artikel: "ERSA M200", vahid: "mt", antrepo: 80, depo: 20, sale_price: 14.2 },
  { id: 5, type: "product", ad: "Silver Pearl", groupId: 1, kod: "00342", artikel: "ERSA S710", vahid: "mt", antrepo: 212, depo: 34, sale_price: 13.7 },
  { id: 6, type: "product", ad: "Ocean Mist", groupId: 2, kod: "00368", artikel: "ERSA O512", vahid: "mt", antrepo: 143, depo: 16, sale_price: 9.8 },
  { id: 7, type: "service", ad: "Kəsim xidməti", groupId: null, kod: "00401", artikel: "SRV-KSM", vahid: "əd", antrepo: 0, depo: 0, sale_price: 4.5 },
  { id: 8, type: "bundle", ad: "Premium rəng dəsti", groupId: 3, kod: "00429", artikel: "SET-PREM", vahid: "dəst", antrepo: 22, depo: 8, sale_price: 38.4 },
  { id: 9, type: "product", ad: "Graphite Mat", groupId: 2, kod: "00463", artikel: "ERSA G200", vahid: "mt", antrepo: 318, depo: 11, sale_price: 12.1 },
  { id: 10, type: "product", ad: "Rose Gold", groupId: 3, kod: "00488", artikel: "ERSA R610", vahid: "mt", antrepo: 68, depo: 6, sale_price: 15.6 },
];

const DEMO_CATEGORIES: Category[] = [
  { id: 1, name: "Rənglər", parentId: null },
  { id: 2, name: "Parlaq", parentId: 1 },
  { id: 3, name: "Mat", parentId: 1 },
  { id: 4, name: "Xidmətlər", parentId: null },
  { id: 5, name: "Dəstlər", parentId: null },
];

const DEMO_ROWS: Product[] = Array.from({ length: 100 }, (_, index) => {
  const seed = DEMO_SEED_ROWS[index % DEMO_SEED_ROWS.length];
  const batch = Math.floor(index / DEMO_SEED_ROWS.length);
  const total = (seed.antrepo ?? 0) + (seed.depo ?? 0);
  const salePrice = Number(((seed.sale_price ?? 10) + (index % 7) * 0.35 + batch * 0.08).toFixed(2));

  return {
    ...seed,
    id: index + 1,
    ad: batch === 0 ? seed.ad : `${seed.ad} ${batch + 1}`,
    kod: String(146 + index * 7).padStart(5, "0"),
    antrepo: Math.max(0, (seed.antrepo ?? 0) + (index % 9) * 12 - (batch % 3) * 8),
    depo: Math.max(0, (seed.depo ?? 0) + (index % 5) * 4 - (batch % 2) * 3),
    sale_price: salePrice,
    cost: Number((salePrice * (index % 11 === 0 ? 0 : 0.68)).toFixed(2)),
    purchase_price: Number((salePrice * 0.82).toFixed(2)),
    categoryIds: seed.type === "service" ? [4] : seed.type === "bundle" ? [5] : seed.groupId === 2 ? [3] : [2],
    minStock: 20 + (index % 4) * 10,
    supplier: index % 3 === 0 ? "ERSA" : "AriX təchizat",
    description: `${seed.ad} üçün demo məhsul kartı.`,
    modified: index % 10 === 0,
    expiresInDays: (index % 18) - 4,
    daysSinceChange: (index * 3) % 120,
    daysSinceSold: total === 0 ? 120 + index : (index * 5) % 150,
  };
});

const DEMO_VARIANTS: ProductVariant[] = [
  { id: 1, productId: 1, name: "Göy / standart", barcode: "200000000001", antrepo: 120, depo: 0, purchase_price: 8.9, cost: 9.35, sale_price: 11.9 },
  { id: 2, productId: 1, name: "Göy / yeni partiya", barcode: "200000000101", antrepo: 65, depo: 18, purchase_price: 9.15, cost: 9.7, sale_price: 12.4 },
  { id: 3, productId: 2, name: "Gri / standart", barcode: "200000000002", antrepo: 140, depo: 4, purchase_price: 9.2, cost: 9.85, sale_price: 12.5 },
];

const DEMO_BUNDLE_ITEMS: BundleItem[] = [
  { id: 1, bundleId: 8, productId: 1, qty: 1 },
  { id: 2, bundleId: 8, productId: 2, qty: 1 },
];

/* ------------------------------ columns/params ------------------------------ */
type ColId =
  | "foto" | "kod" | "taxes" | "barcode" | "artikel" | "vahid" | "plu"
  | "expiration" | "category" | "country" | "supplier"
  | "sale_price" | "cost" | "purchase_price" | "created" | "discount" | "min_stock";

type ColSettings = Record<ColId, boolean>;

const COLUMN_IDS: ColId[] = [
  "foto", "kod", "taxes", "barcode", "artikel", "vahid", "plu",
  "expiration", "category", "country", "supplier",
  "sale_price", "cost", "purchase_price", "created", "discount", "min_stock",
];
const FOLDER_SUMMARY_DISABLED_COLS = new Set<ColId>([
  "kod", "taxes", "barcode", "artikel", "vahid", "plu",
  "expiration", "category", "country", "supplier",
  "sale_price", "cost", "purchase_price", "created", "discount", "min_stock",
]);

const DEFAULT_COLS: ColSettings = {
  foto: true, kod: true, taxes: false, barcode: false, artikel: true, vahid: true, plu: false,
  expiration: false, category: false, country: false, supplier: false,
  sale_price: false, cost: false, purchase_price: false, created: false, discount: false, min_stock: false,
};

type RowDensity = "comfortable" | "compact";
type SearchScope = "current" | "all";

type ViewSettings = { density: RowDensity; stickyHeader: boolean; zebra: boolean; };
type NavSettings = { foldersEnabled: boolean };
type SearchSettings = { scope: SearchScope };

const STORAGE = {
  cols: "arix.products.cols.v3",
  storeCols: "arix.products.storeCols.v1",
  columnWidths: "arix.products.columnWidths.v1",
  view: "arix.products.view.v1",
  nav: "arix.products.nav.v1",
  search: "arix.products.search.v1",
  filters: "arix.products.filters.v2",
  folder: "arix.products.currentFolder.v1",
  rows: "arix.products.rows.v2",
  groups: "arix.products.groups.v1",
  categories: "arix.products.categories.v1",
  audit: "arix.products.audit.v1",
  movements: "arix.products.movements.v1",
  variants: "arix.products.variants.v2",
  bundleItems: "arix.products.bundleItems.v1",
};

const mapApiProduct = (product: ApiProduct): Product => ({
  id: product.id,
  type: product.type,
  ad: product.name,
  groupId: product.groupId,
  kod: product.code,
  artikel: product.sku,
  barcode: product.barcode,
  vahid: product.unit,
  sale_price: product.salePrice,
  cost: product.cost,
  purchase_price: product.purchasePrice ?? product.salePrice,
  categoryIds: product.categoryIds ?? [],
  description: product.description,
  country: product.country,
  supplier: product.supplier,
  minStock: product.minStock,
  expirationDate: product.expirationDate,
  freePrice: product.freePrice,
  storePrices: product.storePrices,
  modified: product.modified,
  active: product.active ?? true,
  createdAt: product.createdAt,
  warehouseStock: Object.fromEntries(Object.entries(product.warehouses ?? {}).map(([key, value]) => [key, Number(value ?? 0)])),
  antrepo: Number(product.warehouses?.antrepo ?? 0),
  depo: Number(product.warehouses?.depo ?? 0),
  cardProfile: product.cardProfile,
});

const toApiProductPatch = (patch: Partial<Product>) => {
  const payload: Record<string, unknown> = {};
  if ("ad" in patch) payload.name = patch.ad;
  if ("kod" in patch) payload.code = patch.kod;
  if ("artikel" in patch) payload.sku = patch.artikel;
  if ("barcode" in patch) payload.barcode = patch.barcode;
  if ("type" in patch) payload.type = patch.type;
  if ("vahid" in patch) payload.unit = patch.vahid;
  if ("groupId" in patch) payload.groupId = patch.groupId;
  if ("categoryIds" in patch) payload.categoryIds = patch.categoryIds;
  if ("sale_price" in patch) payload.salePrice = patch.sale_price;
  if ("cost" in patch) payload.cost = patch.cost;
  if ("purchase_price" in patch) payload.purchasePrice = patch.purchase_price;
  if ("description" in patch) payload.description = patch.description;
  if ("country" in patch) payload.country = patch.country;
  if ("supplier" in patch) payload.supplier = patch.supplier;
  if ("minStock" in patch) payload.minStock = patch.minStock;
  if ("expirationDate" in patch) payload.expirationDate = patch.expirationDate;
  if ("freePrice" in patch) payload.freePrice = patch.freePrice;
  if ("storePrices" in patch) payload.storePrices = patch.storePrices;
  if ("modified" in patch) payload.modified = patch.modified;
  if ("active" in patch) payload.active = patch.active;
  if ("cardProfile" in patch) payload.cardProfile = patch.cardProfile;
  if ("antrepo" in patch || "depo" in patch) {
    payload.warehouses = { antrepo: patch.antrepo, depo: patch.depo };
  }
  return payload;
};

const DEFAULT_VIEW: ViewSettings = { density: "comfortable", stickyHeader: true, zebra: false };
const DEFAULT_NAV: NavSettings = { foldersEnabled: true };
const DEFAULT_SEARCH: SearchSettings = { scope: "current" };

/* ------------------------------ filters ------------------------------ */
type StockOp = "gt" | "lt" | "eq";
type StockPlace = "total" | "antrepo" | "depo";
type PriceLevel = "esas" | "topdan" | "perakende";
type TimeUnit = "days" | "months";
type Filters = {
  types: Record<ProductType, boolean>;
  category: string | null;
  stock?: { place: StockPlace; op: StockOp; qty: number }[];
  price?: { level: PriceLevel; op?: StockOp; qty?: number; min?: number; max?: number };
  expiration?: { mode: "expire_in" | "expired"; days?: number };
  changes?: { mode: "changed_over" | "not_changed"; amount?: number; unit: TimeUnit };
  marketability?: { mode: "sold_during" | "not_sold"; amount?: number; unit: TimeUnit };
};
const FILTERS_DEFAULT: Filters = {
  types: { product: true, service: true, bundle: true },
  category: null,
  stock: [],
  price: { level: "esas" },
  expiration: { mode: "expire_in" },
  changes: { mode: "changed_over", unit: "days" },
  marketability: { mode: "sold_during", unit: "days" },
};

function ResizableTableHeader({
  columnKey,
  label,
  align,
  rowPad,
  width,
  minimum,
  onResizeStart,
  onReset,
  onStep,
}: {
  columnKey: string;
  label: string;
  align: "left" | "right";
  rowPad: string;
  width: number;
  minimum: number;
  onResizeStart: (key: string, event: React.PointerEvent<HTMLSpanElement>) => void;
  onReset: (key: string) => void;
  onStep: (key: string, delta: number) => void;
}) {
  return (
    <th className={cx("group/column relative px-3", rowPad, align === "right" ? "text-right" : "text-left")} style={{ width }}>
      <span className="block truncate pr-1">{label}</span>
      <span
        role="separator"
        aria-label={`${label} sütununun ölçüsünü dəyiş`}
        aria-orientation="vertical"
        aria-valuemin={minimum}
        aria-valuemax={640}
        aria-valuenow={width}
        tabIndex={0}
        title="Sürükləyərək ölçünü dəyiş · iki dəfə basaraq sıfırla"
        onPointerDown={(event) => onResizeStart(columnKey, event)}
        onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); onReset(columnKey); }}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            onStep(columnKey, event.key === "ArrowRight" ? 10 : -10);
          }
          if (event.key === "Home") {
            event.preventDefault();
            onReset(columnKey);
          }
        }}
        className="absolute -right-1 top-0 z-20 h-full w-2 cursor-col-resize touch-none select-none outline-none after:absolute after:bottom-1 after:left-1/2 after:top-1 after:w-px after:-translate-x-1/2 after:bg-slate-300 after:opacity-0 after:transition-opacity hover:after:opacity-100 focus-visible:after:bg-indigo-500 focus-visible:after:opacity-100 group-hover/column:after:opacity-70"
      />
    </th>
  );
}

const SYSTEM_FILTER_PRESETS = [
  { id: "discounted", label: "Endirimli məhsullar" },
  { id: "expires_7", label: "İstifadə müddəti 7 gün ərzində bitir" },
  { id: "zero_cost", label: "Sıfır dəyəri" },
  { id: "expired", label: "İstifadə müddəti bitib" },
  { id: "out_of_stock", label: "Stokda yoxdur" },
  { id: "not_sold_3m", label: "3 ay satılmır" },
  { id: "negative_balance", label: "Mənfi qalıq" },
  { id: "below_minimum", label: "Ümumi qalıq minimumdan azdır" },
];

type FilterSection = "price" | "stock" | "expiration" | "changes" | "marketability";

const FILTER_SECTION_OPTIONS: { id: FilterSection; label: string }[] = [
  { id: "price", label: "Qiymət" },
  { id: "stock", label: "Qalıqlar" },
  { id: "expiration", label: "İstifadə müddəti" },
  { id: "changes", label: "Məhsul dəyişiklikləri" },
  { id: "marketability", label: "Satış" },
];

const presetSections = (presetId: string): FilterSection[] => {
  if (["discounted", "zero_cost"].includes(presetId)) return ["price"];
  if (["expires_7", "expired"].includes(presetId)) return ["expiration"];
  if (["out_of_stock", "negative_balance", "below_minimum"].includes(presetId)) return ["stock"];
  if (presetId === "not_sold_3m") return ["marketability"];
  return [];
};

const deriveFilterSections = (filters: Filters): FilterSection[] => {
  const sections: FilterSection[] = [];
  if ((filters.price?.qty ?? null) != null || (filters.price?.min ?? null) != null || (filters.price?.max ?? null) != null) sections.push("price");
  if (filters.stock?.length) sections.push("stock");
  if ((filters.expiration?.days ?? null) != null || filters.expiration?.mode === "expired") sections.push("expiration");
  if ((filters.changes?.amount ?? null) != null) sections.push("changes");
  if ((filters.marketability?.amount ?? null) != null) sections.push("marketability");
  return sections;
};

/* ------------------------------ main component ------------------------------ */
export default function Products({ isDark = false }: { isDark?: boolean }) {
  const ui = makeUI(isDark);

  /* data */
  const [groups, setGroups] = useState<Group[]>(() => {
    try { const raw = localStorage.getItem(STORAGE.groups); return raw ? JSON.parse(raw) as Group[] : DEMO_GROUPS; }
    catch { return DEMO_GROUPS; }
  });
  const [rows, setRows] = useState<Product[]>(() => {
    try { const raw = localStorage.getItem(STORAGE.rows); return raw ? JSON.parse(raw) as Product[] : DEMO_ROWS; }
    catch { return DEMO_ROWS; }
  });
  const [categories, setCategories] = useState<Category[]>(() => {
    try { const raw = localStorage.getItem(STORAGE.categories); return raw ? JSON.parse(raw) as Category[] : DEMO_CATEGORIES; }
    catch { return DEMO_CATEGORIES; }
  });
  const [audit, setAudit] = useState<AuditEntry[]>(() => {
    try { const raw = localStorage.getItem(STORAGE.audit); return raw ? JSON.parse(raw) as AuditEntry[] : []; }
    catch { return []; }
  });
  const [movements, setMovements] = useState<StockMovement[]>(() => {
    try { const raw = localStorage.getItem(STORAGE.movements); return raw ? JSON.parse(raw) as StockMovement[] : []; }
    catch { return []; }
  });
  const [variants, setVariants] = useState<ProductVariant[]>(() => {
    try { const raw = localStorage.getItem(STORAGE.variants); return raw ? JSON.parse(raw) as ProductVariant[] : DEMO_VARIANTS; }
    catch { return DEMO_VARIANTS; }
  });
  const [bundleItems, setBundleItems] = useState<BundleItem[]>(() => {
    try { const raw = localStorage.getItem(STORAGE.bundleItems); return raw ? JSON.parse(raw) as BundleItem[] : DEMO_BUNDLE_ITEMS; }
    catch { return DEMO_BUNDLE_ITEMS; }
  });
  const [companySettings, setCompanySettings] = useState<CompanySettings>(DEFAULT_COMPANY_SETTINGS);
  const [stores, setStores] = useState<CompanyStore[]>(DEFAULT_STORES);
  const loadProductsFromApi = useCallback(async () => {
    try {
      const [productsPayload, groupsPayload, categoriesPayload, storesPayload] = await Promise.all([
        requestJson<{ data: ApiProduct[] }>("/api/products"),
        requestJson<{ data: Group[] }>("/api/product-groups"),
        requestJson<{ data: Category[] }>("/api/categories"),
        requestJson<{ data: CompanyStore[] }>("/api/stores"),
      ]);
      if (Array.isArray(productsPayload.data)) setRows(productsPayload.data.map(mapApiProduct));
      if (Array.isArray(groupsPayload.data)) setGroups(groupsPayload.data);
      if (Array.isArray(categoriesPayload.data)) setCategories(categoriesPayload.data.map((item) => ({ ...item, parentId: item.parentId ?? null })));
      if (Array.isArray(storesPayload.data) && storesPayload.data.length) setStores(storesPayload.data);
    } catch {
      /* keep local demo data when API is not running */
    }
  }, []);

  const loadCompanySettings = useCallback(async () => {
    try {
      const payload = await requestJson<{ data: CompanySettings }>("/api/company-settings");
      setCompanySettings({ ...DEFAULT_COMPANY_SETTINGS, ...payload.data });
    } catch {
      /* keep simple stock mode when API is unavailable */
    }
  }, []);

  useEffect(() => {
    void loadProductsFromApi();
    void loadCompanySettings();
    const onProductsUpdated = () => void loadProductsFromApi();
    const onStoresUpdated = () => void loadProductsFromApi();
    const onCompanySettingsUpdated = (event: Event) => {
      const detail = (event as CustomEvent<CompanySettings>).detail;
      if (detail) setCompanySettings({ ...DEFAULT_COMPANY_SETTINGS, ...detail });
      else void loadCompanySettings();
    };
    window.addEventListener("arix:products-updated", onProductsUpdated);
    window.addEventListener("arix:stores-updated", onStoresUpdated);
    window.addEventListener("arix:company-settings-updated", onCompanySettingsUpdated);
    return () => {
      window.removeEventListener("arix:products-updated", onProductsUpdated);
      window.removeEventListener("arix:stores-updated", onStoresUpdated);
      window.removeEventListener("arix:company-settings-updated", onCompanySettingsUpdated);
    };
  }, [loadCompanySettings, loadProductsFromApi]);

  /* state */
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [cols, setCols] = useState<ColSettings>(() => {
    try { const raw = localStorage.getItem(STORAGE.cols); return raw ? { ...DEFAULT_COLS, ...JSON.parse(raw) } : DEFAULT_COLS; }
    catch { return DEFAULT_COLS; }
  });
  const [storeCols, setStoreCols] = useState<Record<string, boolean>>(() => {
    try { const raw = localStorage.getItem(STORAGE.storeCols); return raw ? JSON.parse(raw) as Record<string, boolean> : {}; }
    catch { return {}; }
  });
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try { const raw = localStorage.getItem(STORAGE.columnWidths); return raw ? JSON.parse(raw) as Record<string, number> : {}; }
    catch { return {}; }
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
  const [currentFolder, setCurrentFolder] = useState<FolderId>(() => {
    try {
      const raw = localStorage.getItem(STORAGE.folder);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as unknown;
      return parsed === UNASSIGNED_FOLDER_ID || typeof parsed === "number" || parsed === null ? parsed : null;
    }
    catch { return null; }
  });
  /* persist */
  useEffect(() => { try { localStorage.setItem(STORAGE.cols, JSON.stringify(cols)); } catch { /* ignore */ } }, [cols]);
  useEffect(() => { try { localStorage.setItem(STORAGE.storeCols, JSON.stringify(storeCols)); } catch { /* ignore */ } }, [storeCols]);
  useEffect(() => { try { localStorage.setItem(STORAGE.columnWidths, JSON.stringify(columnWidths)); } catch { /* ignore */ } }, [columnWidths]);
  useEffect(() => { try { localStorage.setItem(STORAGE.view, JSON.stringify(view)); } catch { /* ignore */ } }, [view]);
  useEffect(() => { try { localStorage.setItem(STORAGE.nav, JSON.stringify(nav)); } catch { /* ignore */ } }, [nav]);
  useEffect(() => { try { localStorage.setItem(STORAGE.search, JSON.stringify(searchSet)); } catch { /* ignore */ } }, [searchSet]);
  useEffect(() => { try { localStorage.setItem(STORAGE.filters, JSON.stringify(filters)); } catch { /* ignore */ } }, [filters]);
  useEffect(() => { try { localStorage.setItem(STORAGE.folder, JSON.stringify(currentFolder)); } catch { /* ignore */ } }, [currentFolder]);
  useEffect(() => { try { localStorage.setItem(STORAGE.rows, JSON.stringify(rows)); } catch { /* ignore */ } }, [rows]);
  useEffect(() => { try { localStorage.setItem(STORAGE.groups, JSON.stringify(groups)); } catch { /* ignore */ } }, [groups]);
  useEffect(() => { try { localStorage.setItem(STORAGE.categories, JSON.stringify(categories)); } catch { /* ignore */ } }, [categories]);
  useEffect(() => { try { localStorage.setItem(STORAGE.audit, JSON.stringify(audit)); } catch { /* ignore */ } }, [audit]);
  useEffect(() => { try { localStorage.setItem(STORAGE.movements, JSON.stringify(movements)); } catch { /* ignore */ } }, [movements]);
  useEffect(() => { try { localStorage.setItem(STORAGE.variants, JSON.stringify(variants)); } catch { /* ignore */ } }, [variants]);
  useEffect(() => { try { localStorage.setItem(STORAGE.bundleItems, JSON.stringify(bundleItems)); } catch { /* ignore */ } }, [bundleItems]);

  /* visibility */
  const canSeeCosts = true;
  const colVisible = (id: ColId) => cols[id] && (canSeeCosts || (id !== "cost" && id !== "purchase_price"));
  const activeStores = useMemo(() => stores.filter((store) => store.status === "active"), [stores]);
  const visibleStores = useMemo(() => activeStores.filter((store) => storeCols[store.key] !== false), [activeStores, storeCols]);
  const storeQty = useCallback((product: Product, store: CompanyStore) => Number(
    product.warehouseStock?.[store.key]
      ?? (store.key === "antrepo" ? product.antrepo : store.key === "depo" ? product.depo : 0)
      ?? 0
  ), []);
  const totalStock = useCallback(
    (product: Product) => activeStores.reduce((sum, store) => sum + storeQty(product, store), 0),
    [activeStores, storeQty]
  );
  const categoryLabel = useCallback((product: Product) => {
    const names = (product.categoryIds ?? [])
      .map((id) => categories.find((category) => category.id === id)?.name)
      .filter(Boolean);
    return names.length ? names.join(", ") : "—";
  }, [categories]);
  const productCreatedLabel = (product: Product) => {
    if (product.createdAt) return new Date(product.createdAt).toLocaleDateString("az-Latn-AZ");
    const day = ((product.id - 1) % 28) + 1;
    return `2026-05-${String(day).padStart(2, "0")}`;
  };
  const barcodeLabel = (product: Product) => product.barcode || `${String(product.id).padStart(5, "0")}000${(product.kod ?? "").slice(-3)}`;
  const pluLabel = (product: Product) => product.cardProfile?.plu || `PLU-${String(product.id).padStart(4, "0")}`;
  const taxesLabel = (product: Product) => product.type === "service" ? "0%" : "18%";
  const discountLabel = (product: Product) => product.id % 9 === 0 ? "5%" : "—";
  const countryLabel = (product: Product) => product.country || "—";

  /* filtering */
  const filterByQ = useCallback(
    (list: Product[]) =>
      list.filter((r) => (r.ad + " " + (r.kod ?? "") + " " + (r.artikel ?? "") + " " + (r.barcode ?? "")).toLowerCase().includes(q.toLowerCase())),
    [q]
  );

    const filteredAll = useMemo(() => {
      // selected price getter
      const priceOf = (p: Product) => {
        const lvl = filters.price?.level ?? "esas";
        return lvl === "topdan" ? p.cost : lvl === "perakende" ? p.purchase_price : p.sale_price;
      };

      let items = filterByQ(rows);
      // types
      items = items.filter((r) => {
        if (r.type === "product" && !filters.types.product) return false;
        if (r.type === "service" && !filters.types.service) return false;
        if (r.type === "bundle" && !filters.types.bundle) return false;
        return true;
      });
      // category
      if (filters.category) {
        const categoryId = Number(filters.category);
        const categoryIds = new Set<number>();
        const visit = (id: number) => {
          categoryIds.add(id);
          categories.filter((g) => g.parentId === id).forEach((g) => visit(g.id));
        };
        if (Number.isFinite(categoryId)) visit(categoryId);
        items = items.filter((r) => (r.categoryIds ?? []).some((id) => categoryIds.has(id)));
      }
      // stock
      const stockFilters = filters.stock?.filter((s) => Number.isFinite(s.qty)) ?? [];
      if (stockFilters.length) {
        items = items.filter((r) =>
          stockFilters.every((s) => {
            const v = s.place === "antrepo" ? r.antrepo ?? 0 : s.place === "depo" ? r.depo ?? 0 : (r.antrepo ?? 0) + (r.depo ?? 0);
            if (s.op === "gt") return v > s.qty;
            if (s.op === "lt") return v < s.qty;
            return v === s.qty;
          })
        );
      }
      // price
      if ((filters.price?.qty ?? null) != null) {
        items = items.filter((r) => {
          const value = priceOf(r) ?? 0;
          const qty = filters.price!.qty as number;
          const op = filters.price?.op ?? "gt";
          if (op === "gt") return value > qty;
          if (op === "lt") return value < qty;
          return value === qty;
        });
      }
      if ((filters.price?.min ?? null) != null) items = items.filter((r) => (priceOf(r) ?? 0) >= (filters.price!.min as number));
      if ((filters.price?.max ?? null) != null) items = items.filter((r) => (priceOf(r) ?? 0) <= (filters.price!.max as number));
      // Demo tarix sahələri UI davranışını yoxlamaq üçün sadə gün ölçüsündə saxlanılır.
      if ((filters.expiration?.days ?? null) != null || filters.expiration?.mode === "expired") {
        items = items.filter((r) => {
          const days = r.expiresInDays;
          if (days == null) return false;
          if (filters.expiration?.mode === "expired") return days < 0;
          return days >= 0 && days <= (filters.expiration!.days as number);
        });
      }
      if ((filters.changes?.amount ?? null) != null) {
        items = items.filter((r) => {
          const limit = (filters.changes!.amount as number) * (filters.changes?.unit === "months" ? 30 : 1);
          const days = r.daysSinceChange;
          if (days == null) return false;
          return filters.changes?.mode === "not_changed" ? days > limit : days <= limit;
        });
      }
      if ((filters.marketability?.amount ?? null) != null) {
        items = items.filter((r) => {
          const limit = (filters.marketability!.amount as number) * (filters.marketability?.unit === "months" ? 30 : 1);
          const days = r.daysSinceSold;
          if (days == null) return false;
          return filters.marketability?.mode === "not_sold" ? days > limit : days <= limit;
        });
      }
      return items;
    }, [rows, categories, filters, filterByQ]);

  /* folder logic */
  const groupTreeIds = useCallback((groupId: number) => {
    const ids = new Set<number>();
    const visit = (id: number) => {
      ids.add(id);
      groups.filter((g) => g.parentId === id).forEach((g) => visit(g.id));
    };
    visit(groupId);
    return ids;
  }, [groups]);

  const productsInFolder = useCallback((folderId: FolderId) => {
    if (folderId === UNASSIGNED_FOLDER_ID) return filteredAll.filter((r) => r.groupId == null);
    if (typeof folderId === "number") {
      const ids = groupTreeIds(folderId);
      return filteredAll.filter((r) => r.groupId != null && ids.has(r.groupId));
    }
    return [];
  }, [filteredAll, groupTreeIds]);

  const childGroups = useMemo(
    () => currentFolder === UNASSIGNED_FOLDER_ID ? [] : groups.filter((g) => g.parentId === currentFolder),
    [groups, currentFolder]
  );

  const folderRows = useMemo(() => {
    if (!nav.foldersEnabled || searchSet.scope !== "current") return [];
    const next: FolderRow[] = childGroups.map((g) => ({
      id: g.id,
      kind: "group" as const,
      name: g.name,
      products: productsInFolder(g.id),
    }));

    if (currentFolder === null) {
      const unassignedProducts = productsInFolder(UNASSIGNED_FOLDER_ID);
      if (unassignedProducts.length > 0) {
        next.push({
          id: UNASSIGNED_FOLDER_ID,
          kind: "unassigned" as const,
          name: UNASSIGNED_FOLDER_NAME,
          products: unassignedProducts,
        });
      }
    }

    return next;
  }, [childGroups, currentFolder, nav.foldersEnabled, productsInFolder, searchSet.scope]);

  const visibleProducts: Product[] = useMemo(() => {
    if (!nav.foldersEnabled) return filteredAll;
    if (searchSet.scope === "all") return filteredAll;
    if (currentFolder === UNASSIGNED_FOLDER_ID) return filteredAll.filter((r) => r.groupId == null);
    if (currentFolder === null) return [];
    return filteredAll.filter((r) => r.groupId === currentFolder);
  }, [filteredAll, nav.foldersEnabled, searchSet.scope, currentFolder]);

  /* selection */
  const pageSelectableIds = useMemo(
    () => Array.from(new Set([...folderRows.flatMap((r) => r.products.map((p) => p.id)), ...visibleProducts.map((r) => r.id)])),
    [folderRows, visibleProducts]
  );
  const setProductIdsSelected = useCallback((ids: number[], checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => {
        if (checked) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });
  }, []);
  const toggleRow = (id: number) =>
    setSelected((prev) => {
      const s = new Set(prev);
      if (s.has(id)) {
        s.delete(id);
      } else {
        s.add(id);
      }
      return s;
    });
  const clearSelection = () => setSelected(new Set());
  const headerAllChecked = pageSelectableIds.length > 0 && pageSelectableIds.every((id) => selected.has(id));
  const headerIndeterminate = pageSelectableIds.some((id) => selected.has(id)) && !headerAllChecked;

  /* breadcrumbs */
  const crumbs = useMemo(() => {
    const list: { id: Exclude<FolderId, null>; name: string }[] = [];
    if (currentFolder === UNASSIGNED_FOLDER_ID) return [{ id: UNASSIGNED_FOLDER_ID, name: UNASSIGNED_FOLDER_NAME }];
    let id = currentFolder;
    while (typeof id === "number") {
      const g = groups.find((x) => x.id === id);
      if (!g) break;
      list.unshift({ id: g.id, name: g.name });
      id = g.parentId;
    }
    return list;
  }, [groups, currentFolder]);

  const warnings = useMemo(() => {
    const missingPrice = rows.filter((r) => r.type !== "service" && r.sale_price == null).length;
    const outOfStock = rows.filter((r) => r.type !== "service" && ((r.antrepo ?? 0) + (r.depo ?? 0)) <= 0).length;
    const lowStock = rows.filter((r) => r.type !== "service" && r.minStock != null && ((r.antrepo ?? 0) + (r.depo ?? 0)) < r.minStock).length;
    const expired = rows.filter((r) => (r.expiresInDays ?? 1) < 0).length;
    return [
      { label: "Qiymətsiz", count: missingPrice },
      { label: "Stokda yoxdur", count: outOfStock },
      { label: "Minimumdan az", count: lowStock },
      { label: "Müddəti bitib", count: expired },
    ].filter((item) => item.count > 0);
  }, [rows]);

  const logAudit = useCallback((productId: number, action: string, detail: string) => {
    setAudit((prev) => [
      { id: Date.now() + Math.floor(Math.random() * 1000), productId, action, detail, at: new Date().toISOString() },
      ...prev,
    ].slice(0, 300));
  }, []);

  /* create panel */
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<ProductType>("product");
  const [groupCreateKind, setGroupCreateKind] = useState<"folder" | "category" | null>(null);
  const [detailProductId, setDetailProductId] = useState<number | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const createMenuRef = useRef<HTMLDivElement | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const nextProductCode = useMemo(() => String(Math.max(0, ...rows.map((row) => row.id)) + 1).padStart(5, "0"), [rows]);
  const detailProduct = useMemo(() => rows.find((row) => row.id === detailProductId) ?? null, [detailProductId, rows]);

  const defaultCreateGroupId = typeof currentFolder === "number" ? currentFolder : null;
  const openCreate = (target: CreateTarget) => {
    setCreateMenuOpen(false);
    if (target === "import") {
      csvInputRef.current?.click();
      return;
    }
    if (target === "export") {
      exportCsv(false);
      return;
    }
    if (target === "folder" || target === "category") {
      setGroupCreateKind(target);
      return;
    }
    setCreateType(target);
    setCreateOpen(true);
  };

  const handleCreate = async (values: ProductFormValues) => {
    const id = Math.max(0, ...rows.map((row) => row.id)) + 1;
    const purchasePrice = parseOptionalNumber(values.alis);
    const markup = parseOptionalNumber(values.markup);
    const salePrice = parseOptionalNumber(values.qiymet) ?? (
      purchasePrice != null && markup != null
        ? Number((purchasePrice * (1 + markup / 100)).toFixed(2))
        : undefined
    );
    const groupId = values.groupId ? Number(values.groupId) : null;
    let nextCategories = categories;
    const categoryIds = values.kateqoriyalar
      .split(",")
      .map((name) => name.trim())
      .filter(Boolean)
      .map((name) => {
        const found = nextCategories.find((category) => category.name.toLowerCase() === name.toLowerCase());
        if (found) return found.id;
        const category = { id: Math.max(0, ...nextCategories.map((item) => item.id)) + 1, name, parentId: null };
        nextCategories = [...nextCategories, category];
        return category.id;
      });
    if (nextCategories !== categories) setCategories(nextCategories);
    const warehouseStock = Object.fromEntries(
      stores
        .filter((store) => store.status === "active")
        .map((store) => [store.key, values.type === "service" ? 0 : parseOptionalNumber(values.warehouseStocks[store.key]) ?? 0])
    );
    const cardProfile: ProductCardProfile = {
      brand: values.brand.trim() || undefined,
      plu: values.plu.trim() || undefined,
      imageDataUrl: values.sekil || undefined,
      secondaryUnit: values.secondaryUnit || undefined,
      conversionRate: parseOptionalNumber(values.conversionRate),
      lengthCm: parseOptionalNumber(values.lengthCm),
      widthCm: parseOptionalNumber(values.widthCm),
      depthCm: parseOptionalNumber(values.depthCm),
      weightKg: parseOptionalNumber(values.weightKg),
      rollWidthMm: parseOptionalNumber(values.rollWidthMm),
      defaultRollLengthMt: parseOptionalNumber(values.defaultRollLengthMt),
      netWeightKg: parseOptionalNumber(values.netWeightKg),
      grossWeightKg: parseOptionalNumber(values.grossWeightKg),
      volumeM3: parseOptionalNumber(values.volumeM3),
      barcodeType: values.barcodeType,
      barcodeDecimals: parseOptionalNumber(values.barcodeDecimals),
      wholesalePrice: parseOptionalNumber(values.wholesalePrice),
      discountPercent: parseOptionalNumber(values.endirim),
      taxRate: parseOptionalNumber(values.vergi),
      taxFree: values.taxFree,
      useStorePrices: values.storePrices,
      weighted: values.weighted,
      packageName: values.packageEnabled ? values.packageName.trim() || undefined : undefined,
      packageQty: values.packageEnabled ? parseOptionalNumber(values.packageQty) : undefined,
      maxStock: parseOptionalNumber(values.maxStock),
      minOrderQty: parseOptionalNumber(values.minOrderQty),
      maxOrderQty: parseOptionalNumber(values.maxOrderQty),
      negativeStockAllowed: values.negativeStockAllowed,
      shelfLocation: values.shelfLocation.trim() || undefined,
      shelfLifeDays: parseOptionalNumber(values.shelfLifeDays),
      leadTimeDays: parseOptionalNumber(values.leadTimeDays),
      warrantyMonths: parseOptionalNumber(values.warrantyMonths),
      tariffCode: values.tariffCode.trim() || undefined,
      supplierCode: values.supplierCode.trim() || undefined,
      supplierProductCode: values.supplierProductCode.trim() || undefined,
      alternativeProductIds: values.alternativeProductIds.map(Number).filter(Number.isFinite),
      features: values.xususiyyetler.trim() || undefined,
      note: values.note.trim() || undefined,
    };
    const newProduct: Product = {
      id,
      type: values.type,
      ad: values.ad.trim() || `${values.type === "service" ? "Yeni xidmət" : values.type === "bundle" ? "Yeni dəst" : "Yeni məhsul"} ${id}`,
      groupId: Number.isFinite(groupId) ? groupId : null,
      kod: values.kod.trim() || nextProductCode,
      artikel: values.artikel.trim() || undefined,
      barcode: values.barkod.trim() || values.gtin.trim() || undefined,
      vahid: values.vahid.trim() || (values.type === "service" ? "xidmət" : "əd"),
      sale_price: salePrice,
      cost: parseOptionalNumber(values.maya) ?? purchasePrice,
      purchase_price: purchasePrice,
      categoryIds,
      country: values.country.trim() || undefined,
      supplier: values.supplier.trim() || undefined,
      description: values.description.trim() || values.xususiyyetler.trim() || undefined,
      minStock: parseOptionalNumber(values.minimalQalq),
      expirationDate: values.expirationDate || undefined,
      freePrice: values.freePrice,
      storePrices: values.storePrices,
      modified: values.modifikasiya,
      antrepo: Number(warehouseStock.antrepo ?? 0),
      depo: Number(warehouseStock.depo ?? 0),
      warehouseStock,
      cardProfile,
      expiresInDays: 30,
      daysSinceChange: 0,
      daysSinceSold: values.type === "service" ? 0 : 30,
      active: values.status === "active",
      createdAt: new Date().toISOString(),
    };

    try {
      const payload = await requestJson<{ data: ApiProduct }>("/api/products", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: newProduct.ad,
          code: newProduct.kod,
          sku: newProduct.artikel ?? "",
          barcode: newProduct.barcode,
          type: newProduct.type,
          unit: newProduct.vahid,
          groupId: newProduct.groupId,
          categoryIds: newProduct.categoryIds ?? [],
          salePrice: newProduct.sale_price,
          cost: newProduct.cost,
          purchasePrice: newProduct.purchase_price,
          warehouses: newProduct.warehouseStock,
          description: newProduct.description,
          country: newProduct.country,
          supplier: newProduct.supplier,
          minStock: newProduct.minStock,
          expirationDate: newProduct.expirationDate,
          freePrice: newProduct.freePrice,
          modified: newProduct.modified,
          cardProfile: newProduct.cardProfile,
          active: newProduct.active,
        }),
      });
      setRows((prev) => [mapApiProduct(payload.data), ...prev]);
    } catch {
      setRows((prev) => [newProduct, ...prev]);
    }
    logAudit(id, "Yaradıldı", `${newProduct.ad} kartı yaradıldı`);
    setSelected(new Set());
    setCreateOpen(false);
  };

  const handleCreateGroup = async ({ name, parentId }: { name: string; parentId: number | null }) => {
    if (groupCreateKind === "category") {
      const fallback = { id: Math.max(0, ...categories.map((category) => category.id)) + 1, name: name.trim(), parentId };
      try {
        const payload = await requestJson<{ data: Category }>("/api/categories", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: name.trim(), parentId }),
        });
        setCategories((prev) => [...prev, payload.data]);
      } catch {
        setCategories((prev) => [...prev, fallback]);
      }
    } else {
      const fallback = { id: Math.max(0, ...groups.map((group) => group.id)) + 1, name: name.trim(), parentId };
      try {
        const payload = await requestJson<{ data: Group }>("/api/product-groups", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: name.trim(), parentId }),
        });
        setGroups((prev) => [...prev, payload.data]);
      } catch {
        setGroups((prev) => [...prev, fallback]);
      }
      setCurrentFolder(parentId);
      setNav((v) => ({ ...v, foldersEnabled: true }));
      setSearchSet({ scope: "current" });
    }
    setGroupCreateKind(null);
  };

  const updateProduct = async (productId: number, patch: Partial<Product>, auditDetail = "Məhsul kartı yeniləndi") => {
    const current = rows.find((row) => row.id === productId);
    const next = current ? {
      ...current,
      ...patch,
      warehouseStock: {
        ...(current.warehouseStock ?? {}),
        ...(patch.warehouseStock ?? {}),
        ...("antrepo" in patch ? { antrepo: patch.antrepo ?? 0 } : {}),
        ...("depo" in patch ? { depo: patch.depo ?? 0 } : {}),
      },
      daysSinceChange: 0,
    } : null;
    setRows((prev) => prev.map((row) => row.id === productId && next ? next : row));
    if (next) {
      try {
        const payload = await requestJson<{ data: ApiProduct }>(`/api/products/${productId}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...toApiProductPatch(patch),
            ...(("antrepo" in patch || "depo" in patch) ? {
              warehouses: { ...(next.warehouseStock ?? {}), antrepo: next.antrepo ?? 0, depo: next.depo ?? 0 },
            } : {}),
          }),
        });
        setRows((prev) => prev.map((row) => row.id === productId ? { ...row, ...mapApiProduct(payload.data) } : row));
      } catch {
        // Local state remains available when the API is temporarily offline.
      }
    }
    logAudit(productId, "Redaktə", auditDetail);
  };

  const deleteProducts = async (ids: number[]) => {
    if (ids.length === 0) return;
    await Promise.allSettled(ids.map((id) => requestJson(`/api/products/${id}`, { method: "DELETE" })));
    setRows((prev) => prev.filter((row) => !ids.includes(row.id)));
    setVariants((prev) => prev.filter((variant) => !ids.includes(variant.productId)));
    setBundleItems((prev) => prev.filter((item) => !ids.includes(item.bundleId) && !ids.includes(item.productId)));
    setSelected(new Set());
    if (detailProductId != null && ids.includes(detailProductId)) setDetailProductId(null);
  };

  const applyMovement = (input: Omit<StockMovement, "id" | "at">) => {
    const movement: StockMovement = { ...input, id: Date.now(), at: new Date().toISOString() };
    const applyToProduct = (row: Product) => {
      const next = { ...row };
      const place = input.place ?? "antrepo";
      if (input.type === "purchase" || input.type === "return") next[place] = (next[place] ?? 0) + input.qty;
      if (input.type === "sale") next[place] = (next[place] ?? 0) - input.qty;
      if (input.type === "adjustment") next[place] = input.qty;
      if (input.type === "transfer" && input.from && input.to) {
        next[input.from] = (next[input.from] ?? 0) - input.qty;
        next[input.to] = (next[input.to] ?? 0) + input.qty;
      }
      next.warehouseStock = {
        ...(next.warehouseStock ?? {}),
        antrepo: next.antrepo ?? 0,
        depo: next.depo ?? 0,
      };
      next.daysSinceChange = 0;
      if (input.type === "sale") next.daysSinceSold = 0;
      return next;
    };
    const currentProduct = rows.find((row) => row.id === input.productId);
    const updatedProduct = currentProduct ? applyToProduct(currentProduct) : null;
    setRows((prev) => prev.map((row) => row.id === input.productId ? applyToProduct(row) : row));
    if (updatedProduct) {
      void requestJson(`/api/products/${input.productId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          warehouses: {
            ...(updatedProduct.warehouseStock ?? {}),
            antrepo: updatedProduct.antrepo ?? 0,
            depo: updatedProduct.depo ?? 0,
          },
        }),
      }).catch(() => undefined);
    }
    setMovements((prev) => [movement, ...prev].slice(0, 300));
    logAudit(input.productId, "Anbar", `${input.type} · ${input.qty}`);
  };

  const addVariant = (productId: number, variant: Omit<ProductVariant, "id" | "productId">) => {
    setVariants((prev) => [{ ...variant, id: Date.now(), productId }, ...prev]);
    logAudit(productId, "Variant", `${variant.name} əlavə edildi`);
  };

  const addBundleItem = (bundleId: number, productId: number, qty: number) => {
    if (!productId || qty <= 0) return;
    setBundleItems((prev) => [{ id: Date.now(), bundleId, productId, qty }, ...prev]);
    logAudit(bundleId, "Dəst", "Dəstə məhsul əlavə edildi");
  };

  const removeBundleItem = (id: number, bundleId: number) => {
    setBundleItems((prev) => prev.filter((item) => item.id !== id));
    logAudit(bundleId, "Dəst", "Dəst tərkibindən məhsul silindi");
  };

  const exportCsv = (onlySelected = false) => {
    const selectedIds = selected;
    const source = onlySelected && selectedIds.size > 0 ? rows.filter((row) => selectedIds.has(row.id)) : rows;
    const header = ["id", "ad", "kod", "artikel", "vahid", "sale_price", "cost", "purchase_price", "antrepo", "depo"];
    const csv = [
      header.join(","),
      ...source.map((row) => header.map((key) => {
        const value = row[key as keyof Product] ?? "";
        return `"${String(value).replaceAll('"', '""')}"`;
      }).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = onlySelected ? "selected-products.csv" : "products.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const importCsv = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const lines = text.split(/\r?\n/).filter(Boolean);
      const parseLine = (line: string) => {
        const cells: string[] = [];
        let current = "";
        let quoted = false;
        for (let i = 0; i < line.length; i += 1) {
          const char = line[i];
          if (char === '"' && line[i + 1] === '"') {
            current += '"';
            i += 1;
          } else if (char === '"') {
            quoted = !quoted;
          } else if (char === "," && !quoted) {
            cells.push(current.trim());
            current = "";
          } else {
            current += char;
          }
        }
        cells.push(current.trim());
        return cells;
      };
      const headers = parseLine(lines[0] ?? "").map((cell) => cell.toLowerCase());
      const body = headers.includes("ad") ? lines.slice(1) : lines;
      const startId = Math.max(0, ...rows.map((row) => row.id));
      const imported = body.map((line, idx) => {
        const cells = parseLine(line);
        const get = (name: string, fallbackIndex: number) => {
          const index = headers.indexOf(name);
          return cells[index >= 0 ? index : fallbackIndex] ?? "";
        };
        const ad = get("ad", 0);
        const kod = get("kod", 1);
        const artikel = get("artikel", 2);
        const vahid = get("vahid", 3);
        const sale = get("sale_price", 4);
        const antrepo = get("antrepo", 5);
        const depo = get("depo", 6);
        return {
          id: startId + idx + 1,
          type: "product" as ProductType,
          ad: ad || `Import məhsul ${idx + 1}`,
          kod: kod || String(startId + idx + 1).padStart(5, "0"),
          artikel: artikel || undefined,
          vahid: vahid || "əd",
          groupId: null,
          sale_price: parseOptionalNumber(sale),
          antrepo: parseOptionalNumber(antrepo) ?? 0,
          depo: parseOptionalNumber(depo) ?? 0,
          categoryIds: [],
          minStock: 0,
          daysSinceChange: 0,
          daysSinceSold: 0,
        };
      });
      if (imported.length) setRows((prev) => [...imported, ...prev]);
    };
    reader.readAsText(file);
  };

  /* filter panel popover */
  const [showFilter, setShowFilter] = useState(false);
  const [presetsOpen, setPresetsOpen] = useState(false);
  const [selectedPreset, setSelectedPreset] = useState("");
  const [visibleFilterSections, setVisibleFilterSections] = useState<FilterSection[]>(() => deriveFilterSections(filters));
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
    if (nav.foldersEnabled && searchSet.scope === "all") n++;
    if (!filters.types.product || !filters.types.service || !filters.types.bundle) n++;
    if (filters.category) n++;
    n += filters.stock?.filter((s) => Number.isFinite(s.qty)).length ?? 0;
    if ((filters.price?.min ?? null) != null || (filters.price?.max ?? null) != null) n++;
    if ((filters.price?.qty ?? null) != null) n++;
    if ((filters.expiration?.days ?? null) != null || filters.expiration?.mode === "expired") n++;
    if ((filters.changes?.amount ?? null) != null) n++;
    if ((filters.marketability?.amount ?? null) != null) n++;
    return n;
  }, [filters, nav.foldersEnabled, searchSet.scope]);

  const applyPreset = (presetId: string) => {
    setSelectedPreset(presetId);
    setPresetsOpen(false);
    setVisibleFilterSections((prev) => Array.from(new Set([...prev, ...presetSections(presetId)])));

    if (presetId === "zero_cost") {
      setFilters((f) => ({ ...f, price: { level: "topdan", op: "eq", qty: 0 } }));
    } else if (presetId === "expires_7") {
      setFilters((f) => ({ ...f, expiration: { mode: "expire_in", days: 7 } }));
    } else if (presetId === "expired") {
      setFilters((f) => ({ ...f, expiration: { mode: "expired" } }));
    } else if (presetId === "out_of_stock") {
      setFilters((f) => ({ ...f, stock: [{ place: "total", op: "eq", qty: 0 }] }));
    } else if (presetId === "not_sold_3m") {
      setFilters((f) => ({ ...f, marketability: { mode: "not_sold", amount: 3, unit: "months" } }));
    } else if (presetId === "negative_balance") {
      setFilters((f) => ({ ...f, stock: [{ place: "total", op: "lt", qty: 0 }] }));
    } else if (presetId === "below_minimum") {
      setFilters((f) => ({ ...f, stock: [{ place: "total", op: "lt", qty: 10 }] }));
    } else if (presetId === "discounted") {
      setFilters((f) => ({ ...f, price: { level: "esas", op: "lt", qty: 12 } }));
    }
  };

  const clearFilters = () => {
    setFilters(FILTERS_DEFAULT);
    setSearchSet(DEFAULT_SEARCH);
    setSelectedPreset("");
    setPresetsOpen(false);
    setVisibleFilterSections([]);
  };

  /* menus */
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement | null>(null);
  const [colsOpen, setColsOpen] = useState(false);
  const colsRef = useRef<HTMLDivElement | null>(null);
  const [warningsOpen, setWarningsOpen] = useState(false);
  const warningsRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (moreRef.current && !moreRef.current.contains(t)) setMoreOpen(false);
      if (colsRef.current && !colsRef.current.contains(t)) setColsOpen(false);
      if (warningsRef.current && !warningsRef.current.contains(t)) setWarningsOpen(false);
      if (createMenuRef.current && !createMenuRef.current.contains(t)) setCreateMenuOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === "Escape") { setMoreOpen(false); setColsOpen(false); setWarningsOpen(false); setCreateMenuOpen(false); } };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onEsc);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onEsc); };
  }, []);
  useEffect(() => {
    if (selected.size === 0) setMoreOpen(false);
    if (selected.size > 0) {
      setCreateMenuOpen(false);
    }
  }, [selected.size]);

  /* ui helpers */
  const moduleSummary = useMemo(() => {
    const stockItems = rows.filter((row) => row.type !== "service");
    return {
      products: rows.filter((row) => row.type === "product").length,
      services: rows.filter((row) => row.type === "service").length,
      bundles: rows.filter((row) => row.type === "bundle").length,
      negative: stockItems.filter((row) => activeStores.some((store) => storeQty(row, store) < 0)).length,
      low: stockItems.filter((row) => {
        const minimum = row.minStock ?? 0;
        return minimum > 0 && totalStock(row) < minimum;
      }).length,
    };
  }, [activeStores, rows, storeQty, totalStock]);
  const enabledTypes = (Object.entries(filters.types) as [ProductType, boolean][]).filter(([, enabled]) => enabled).map(([type]) => type);
  const activeTypeScope: ProductType | "all" | "custom" = enabledTypes.length === 3 ? "all" : enabledTypes.length === 1 ? enabledTypes[0] : "custom";
  const setTypeScope = (scope: ProductType | "all") => {
    setFilters((current) => ({
      ...current,
      types: scope === "all"
        ? { product: true, service: true, bundle: true }
        : { product: scope === "product", service: scope === "service", bundle: scope === "bundle" },
    }));
  };
  const rowPad = view.density === "compact" ? "py-1.5" : "py-2.5";
  const folderSummaryMode = nav.foldersEnabled && searchSet.scope === "current" && visibleProducts.length === 0;
  const showProductDetailCols = !folderSummaryMode;
  const showProductMedia = colVisible("foto");
  const detailColVisible = (id: ColId) => showProductDetailCols && colVisible(id);
  const visibleStandardCols = COLUMN_IDS.filter((id) => id !== "foto" && colVisible(id) && (!FOLDER_SUMMARY_DISABLED_COLS.has(id) || showProductDetailCols));
  const defaultColumnWidth = (key: string) => key === "name" ? 280 : 132;
  const minimumColumnWidth = (key: string) => {
    if (key === "name") return 160;
    if (key === "vahid" || key === "kod" || key === "total") return 88;
    return 96;
  };
  const columnWidth = (key: string) => Math.max(minimumColumnWidth(key), Number(columnWidths[key] ?? defaultColumnWidth(key)));
  const visibleTableColumnKeys = [
    "name",
    ...visibleStandardCols,
    ...visibleStores.map((store) => `store:${store.key}`),
    "total",
  ];
  const tableMinWidthPx = 48 + visibleTableColumnKeys.reduce((sum, key) => sum + columnWidth(key), 0);
  const tableColSpan = 2 + visibleStandardCols.length + visibleStores.length + 1;
  const startColumnResize = (key: string, event: React.PointerEvent<HTMLSpanElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startWidth = columnWidth(key);
    const previousCursor = document.body.style.cursor;
    const previousSelection = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    const move = (moveEvent: PointerEvent) => {
      const nextWidth = Math.min(640, Math.max(minimumColumnWidth(key), startWidth + moveEvent.clientX - startX));
      setColumnWidths((current) => ({ ...current, [key]: Math.round(nextWidth) }));
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelection;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };
  const resetColumnWidth = (key: string) => {
    setColumnWidths((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const stepColumnWidth = (key: string, delta: number) => {
    setColumnWidths((current) => ({
      ...current,
      [key]: Math.min(640, Math.max(minimumColumnWidth(key), Number(current[key] ?? defaultColumnWidth(key)) + delta)),
    }));
  };
  const renderHeader = (key: string, label: string, align: "left" | "right" = "left") => (
    <ResizableTableHeader
      key={key}
      columnKey={key}
      label={label}
      align={align}
      rowPad={rowPad}
      width={columnWidth(key)}
      minimum={minimumColumnWidth(key)}
      onResizeStart={startColumnResize}
      onReset={resetColumnWidth}
      onStep={stepColumnWidth}
    />
  );
  const folderSummaryText = [
    folderRows.length > 0 ? `${folderRows.length} qovluq` : false,
    `${pageSelectableIds.length} məhsul`,
  ].filter(Boolean).join(" · ");
  const allFoldersScope = nav.foldersEnabled && searchSet.scope === "all";
  const toggleFolderView = () => {
    const nextEnabled = !nav.foldersEnabled;
    setNav((v) => ({ ...v, foldersEnabled: nextEnabled }));
    if (nextEnabled) setSearchSet({ scope: "current" });
  };

  /* ------------------------------ render ------------------------------ */
  /* const visibleTabs = stockMode === "bondedRolls"
    ? ([
        ["overview", "Kart"],
        ["stock", "Stok"],
        ["containers", "Konteynerlər"],
        ["rolls", "Rulolar"],
        ["variants", "Variantlar"],
        ["inventory", "Hərəkətlər"],
        ["history", "Tarixçə"],
      ] as const)
    : tabs;
  const bondedSummary = {
    antrepo: product.antrepo ?? 0,
    reserved: 0,
    depo: product.depo ?? 0,
    exported: 0,
    netKg: 0,
    grossKg: 0,
  };
  const bondedContainerRows: string[][] = [];
  const bondedRollRows: string[][] = []; */

  return (
    <>
    <div className="flex min-h-[calc(100dvh-12rem)] min-w-0 flex-col gap-3 md:h-[calc(100vh-8rem)] md:min-h-0">
      <div className="flex flex-col gap-3 px-1 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className={cx("text-2xl font-semibold", isDark ? "text-slate-50" : "text-slate-900")}>Məhsullar və xidmətlər</h1>
          <p className={cx("mt-1 text-sm", ui.textSubtle)}>Kartlar, qiymətlər və anbar qalıqları bir görünüşdə idarə olunur.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            ["all", "Hamısı", rows.length],
            ["product", "Məhsullar", moduleSummary.products],
            ["service", "Xidmətlər", moduleSummary.services],
            ["bundle", "Dəstlər", moduleSummary.bundles],
          ].map(([id, label, count]) => (
            <button
              key={String(id)}
              type="button"
              onClick={() => setTypeScope(id as ProductType | "all")}
              className={cx(
                "h-9 rounded-lg border px-3 text-sm font-medium transition",
                activeTypeScope === id
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                  : cx(ui.borderSoft, isDark ? "bg-white/5 text-slate-300 hover:bg-white/10" : "bg-white/60 text-slate-600 hover:bg-white")
              )}
            >
              {label} <span className={cx("ml-1 tabular-nums", activeTypeScope === id ? "text-indigo-100" : ui.textSubtle)}>{count}</span>
            </button>
          ))}
          {(moduleSummary.negative > 0 || moduleSummary.low > 0) && (
            <span className={cx("ml-1 text-xs font-medium", moduleSummary.negative > 0 ? "text-rose-600" : "text-amber-600")}>
              {moduleSummary.negative > 0 ? `${moduleSummary.negative} mənfi qalıq` : `${moduleSummary.low} minimumdan az`}
            </span>
          )}
        </div>
      </div>
      {/* ACTION BAR */}
      <div className={cx("relative z-30 p-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between", ui.card, ui.ring)}>
        {/* search + filter */}
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <div ref={filterRef} className="relative w-full sm:w-[440px]">
            <I.Search className="absolute left-2 top-1/2 -translate-y-1/2 h-5 w-5 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ad, kod, barkod və ya artikul üzrə axtar"
              className={cx(ui.input, "pl-8 pr-12")}
            />
            <button
              onClick={() => setShowFilter((v) => !v)}
              className={cx("absolute right-1 top-1/2 -translate-y-1/2 w-10 h-8 rounded-lg flex items-center justify-center",
                            isDark ? "hover:bg-white/10" : "hover:bg-white/65")}
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
              <FilterPanel
                filters={filters}
                setFilters={setFilters}
                categories={categories}
                nav={nav}
                searchSet={searchSet}
                setSearchSet={setSearchSet}
                presetsOpen={presetsOpen}
                setPresetsOpen={setPresetsOpen}
                selectedPreset={selectedPreset}
                applyPreset={applyPreset}
                clearFilters={clearFilters}
                visibleFilterSections={visibleFilterSections}
                setVisibleFilterSections={setVisibleFilterSections}
                onClose={() => setShowFilter(false)}
                isDark={isDark}
              />
            )}
          </div>
        </div>

        {/* right actions */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {selected.size > 0 && (
            <div className={cx("flex h-10 w-full max-w-full items-center justify-between gap-1 rounded-xl border px-1.5 sm:w-auto sm:min-w-[360px]", ui.borderSoft, isDark ? "glass-control-dark" : "glass-control")}>
              <span className={cx("px-2 text-sm font-medium", isDark ? "text-indigo-200" : "text-indigo-700")}>
                <strong className="tabular-nums">{selected.size}</strong> seçildi
              </span>
              <div className="flex items-center gap-1">
                <button type="button" title="Sil" className={ui.iconBtn} onClick={() => deleteProducts(Array.from(selected))}>
                  <I.Trash className={cx("h-5 w-5", ui.iconColor)} />
                </button>
                <button type="button" title="Daşı" className={ui.iconBtn} onClick={() => setMoveOpen(true)}>
                  <I.MoveToFolder className={cx("h-5 w-5", ui.iconColor)} />
                </button>
                <button type="button" title="İxrac" className={ui.iconBtn} onClick={() => exportCsv(true)}>
                  <I.Download className={cx("h-5 w-5", ui.iconColor)} />
                </button>
                <div ref={moreRef} className="relative">
                  <button
                    type="button"
                    onClick={()=>setMoreOpen((v)=>!v)}
                    className={ui.iconBtn}
                    title="Seçilmiş məhsul əməliyyatları"
                    aria-haspopup="menu"
                    aria-expanded={moreOpen}
                  >
                    <I.Dots className={cx("h-5 w-5", ui.iconColor)} />
                  </button>
                  {moreOpen && <OverflowMenu onClose={()=>setMoreOpen(false)} selectedCount={selected.size} isDark={isDark} />}
                </div>
                <button type="button" onClick={clearSelection} className={cx("h-8 rounded-lg px-3 text-sm", isDark ? "hover:bg-white/10 text-slate-300" : "hover:bg-white/70 text-slate-600")}>
                  Təmizlə
                </button>
              </div>
            </div>
          )}

          {selected.size === 0 && (
            <div ref={createMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setCreateMenuOpen((v) => !v)}
                className={cx("px-3 h-10 rounded-xl inline-flex items-center gap-2", ui.primaryBtn)}
                aria-haspopup="menu"
                aria-expanded={createMenuOpen}
              >
                <I.Plus className="h-4 w-4" /> Yarat
              </button>
              {createMenuOpen && (
                <CreateMenu
                  onPick={openCreate}
                  isDark={isDark}
                />
              )}
            </div>
          )}

          <div className={cx("flex h-10 items-center gap-1 rounded-xl border px-1", ui.borderSoft)}>
            <div ref={warningsRef} className="relative">
              <button
                type="button"
                title="Bildirişlər"
                aria-label="Bildirişlər"
                aria-expanded={warningsOpen}
                onClick={() => setWarningsOpen((v) => !v)}
                className={cx(ui.iconBtn, "relative")}
              >
                <I.Bell className={cx("h-5 w-5", ui.iconColor)} />
                {warnings.length > 0 && (
                  <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-amber-500 ring-2 ring-white" />
                )}
              </button>
              {warningsOpen && <WarningsPopover warnings={warnings} isDark={isDark} />}
            </div>
            <button
              type="button"
              title="Qovluq görünüşü"
              aria-label="Qovluq görünüşü"
              aria-pressed={nav.foldersEnabled}
              onClick={toggleFolderView}
              className={ui.iconBtn}
            >
              {nav.foldersEnabled ? (
                <I.FolderCheck className={cx("h-6 w-6", ui.iconColor)} />
              ) : (
                <I.Folder className={cx("h-5 w-5", ui.iconColor)} />
              )}
            </button>

            {/* settings */}
            <div ref={colsRef} className="relative">
              <button
                type="button"
                onClick={()=>setColsOpen((v)=>!v)}
                className={ui.iconBtn}
                title="Cədvəl parametrləri"
                aria-expanded={colsOpen}
              >
                <I.Sliders className={cx("h-5 w-5", ui.iconColor)} />
              </button>
              {colsOpen && (
                <ParamsPanel
                  cols={cols}
                  setCols={setCols}
                  storeCols={storeCols}
                  setStoreCols={setStoreCols}
                  view={view}
                  setView={setView}
                  nav={nav}
                  setNav={setNav}
                  setSearchSet={setSearchSet}
                  onResetAll={()=>{
                    setCols(DEFAULT_COLS);
                    setStoreCols({});
                    setColumnWidths({});
                    setView(DEFAULT_VIEW);
                    setNav(DEFAULT_NAV);
                    setSearchSet(DEFAULT_SEARCH);
                  }}
                  onResetCols={()=>{ setCols(DEFAULT_COLS); setStoreCols({}); }}
                  onResetWidths={()=>setColumnWidths({})}
                  folderSummaryMode={folderSummaryMode}
                  isDark={isDark}
                  stores={activeStores}
                />
              )}
            </div>
          </div>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              importCsv(e.target.files?.[0]);
              e.currentTarget.value = "";
            }}
          />
        </div>
      </div>

      {/* TABLE */}
      <div className={cx("relative z-0 flex min-h-0 flex-1 flex-col overflow-hidden", ui.card, ui.ring)}>
        {nav.foldersEnabled && (
          <div className={cx("flex min-h-[44px] items-center justify-between gap-3 border-b px-4 py-2", ui.borderSoft)}>
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
              {allFoldersScope ? (
                <span className={cx("font-medium", isDark ? "text-slate-100" : "text-slate-700")}>Bütün məhsullar</span>
              ) : (
                <button
                  onClick={() => setCurrentFolder(null)}
                  className={cx("font-medium", currentFolder == null ? (isDark ? "text-slate-100" : "text-slate-700") : ui.crumbRoot)}
                >
                  Qovluqlar
                </button>
              )}
              {!allFoldersScope && crumbs.map((c) => (
                <React.Fragment key={c.id}>
                  <I.ChevronR className="h-4 w-4 shrink-0 text-slate-400" />
                  <button
                    onClick={() => setCurrentFolder(c.id)}
                    className={cx("truncate", ui.crumbBtn)}
                  >
                    {c.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <span className={cx("text-xs", ui.textSubtle)}>{folderSummaryText}</span>
              {!allFoldersScope && currentFolder != null && (
                <button
                  onClick={() => setCurrentFolder(currentFolder === UNASSIGNED_FOLDER_ID ? null : groups.find((g) => g.id === currentFolder)?.parentId ?? null)}
                  className={cx("h-8 shrink-0 rounded-lg border px-3 text-sm", ui.borderSoft, isDark ? "hover:bg-white/10" : "hover:bg-white/65")}
                  title="Yuxarı"
                >
                  Yuxarı
                </button>
              )}
            </div>
          </div>
        )}
        <div className="space-y-3 overflow-auto p-3 md:hidden">
          {folderRows.map((folder) => (
            <button
              key={folder.id}
              type="button"
              onClick={() => setCurrentFolder(folder.id)}
              className={cx("w-full rounded-2xl border p-3 text-left transition", ui.borderSoft, isDark ? "bg-white/5 hover:bg-white/10" : "bg-white hover:bg-slate-50")}
            >
              <div className="flex items-center gap-3">
                <div className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", ui.softBox)}>
                  <I.Folder className="h-5 w-5 text-blue-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{folder.name}</div>
                  <div className={cx("text-xs", ui.textSubtle)}>Məhsul: {folder.products.length}</div>
                </div>
                <I.ChevronR className={cx("h-4 w-4", ui.iconColor)} />
              </div>
            </button>
          ))}
          {visibleProducts.map((r) => {
            const isSel = selected.has(r.id);
            const total = totalStock(r);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setDetailProductId(r.id)}
                className={cx("w-full rounded-2xl border p-3 text-left transition", ui.borderSoft, isSel ? "bg-indigo-500/10" : isDark ? "bg-white/5 hover:bg-white/10" : "bg-white hover:bg-slate-50")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate text-sm font-semibold">{r.ad}</div>
                      {r.type !== "product" && (
                        <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", r.type === "service" ? "bg-sky-50 text-sky-700" : "bg-violet-50 text-violet-700")}>
                          {r.type === "service" ? "Xidmət" : "Dəst"}
                        </span>
                      )}
                    </div>
                    <div className={cx("mt-1 truncate text-xs", ui.textSubtle)}>{r.kod ?? "Kod yoxdur"} · {r.artikel ?? "Artikul yoxdur"}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className={cx("text-sm font-semibold tabular-nums", total < 0 && "text-rose-600")}>{r.type === "service" ? "—" : toNum(total)}</div>
                    <div className={cx("text-xs", ui.textSubtle)}>{r.vahid ?? "əd"}</div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  {activeStores.map((store) => (
                    <div key={store.id} className={cx("rounded-xl px-2 py-2", isDark ? "bg-white/7" : "bg-slate-50")}>
                      <div className={cx("truncate", ui.textSubtle)}>{store.name}</div>
                      <div className="font-semibold tabular-nums">{r.type === "service" ? "—" : toNum(storeQty(r, store))}</div>
                    </div>
                  ))}
                  <div className={cx("rounded-xl px-2 py-2", isDark ? "bg-white/7" : "bg-slate-50")}>
                    <div className={ui.textSubtle}>Satış</div>
                    <div className="font-semibold tabular-nums">{toCurrency(r.sale_price)}</div>
                  </div>
                </div>
              </button>
            );
          })}
          {visibleProducts.length === 0 && folderRows.length === 0 && (
            <div className={cx("rounded-2xl border p-4 text-center text-sm", ui.borderSoft, ui.textSubtle)}>Heç nə tapılmadı.</div>
          )}
        </div>
        <div className="erp-panel-body hidden md:block">
        <table className="erp-data-table text-[13px]" style={{ width: `max(100%, ${tableMinWidthPx}px)` }}>
          <colgroup>
            <col className="erp-col-select" />
            <col style={{ width: columnWidth("name") }} />
            {detailColVisible("kod") && <col style={{ width: columnWidth("kod") }} />}
            {detailColVisible("taxes") && <col style={{ width: columnWidth("taxes") }} />}
            {detailColVisible("barcode") && <col style={{ width: columnWidth("barcode") }} />}
            {detailColVisible("artikel") && <col style={{ width: columnWidth("artikel") }} />}
            {detailColVisible("vahid") && <col style={{ width: columnWidth("vahid") }} />}
            {detailColVisible("plu") && <col style={{ width: columnWidth("plu") }} />}
            {detailColVisible("expiration") && <col style={{ width: columnWidth("expiration") }} />}
            {detailColVisible("category") && <col style={{ width: columnWidth("category") }} />}
            {detailColVisible("country") && <col style={{ width: columnWidth("country") }} />}
            {detailColVisible("supplier") && <col style={{ width: columnWidth("supplier") }} />}
            {detailColVisible("sale_price") && <col style={{ width: columnWidth("sale_price") }} />}
            {detailColVisible("cost") && <col style={{ width: columnWidth("cost") }} />}
            {detailColVisible("purchase_price") && <col style={{ width: columnWidth("purchase_price") }} />}
            {detailColVisible("created") && <col style={{ width: columnWidth("created") }} />}
            {detailColVisible("discount") && <col style={{ width: columnWidth("discount") }} />}
            {detailColVisible("min_stock") && <col style={{ width: columnWidth("min_stock") }} />}
            {visibleStores.map((store) => <col key={store.id} style={{ width: columnWidth(`store:${store.key}`) }} />)}
            <col style={{ width: columnWidth("total") }} />
          </colgroup>
          <thead className={cx(view.stickyHeader && ui.theadSticky)}>
            <tr className={ui.headerRow}>
              <th className="erp-select-cell py-2">
                <input
                  type="checkbox"
                  className="erp-select-checkbox"
                  aria-label="Hamısını seç"
                  checked={headerAllChecked}
                  ref={(el) => { if (el) el.indeterminate = headerIndeterminate; }}
                  onChange={(e)=>setProductIdsSelected(pageSelectableIds, e.target.checked)}
                />
              </th>
              {renderHeader("name", "AD")}
              {detailColVisible("kod") && renderHeader("kod", "KOD")}
              {detailColVisible("taxes") && renderHeader("taxes", "VERGİ")}
              {detailColVisible("barcode") && renderHeader("barcode", "BAR-KOD")}
              {detailColVisible("artikel") && renderHeader("artikel", "SKU / ARTIKUL")}
              {detailColVisible("vahid") && renderHeader("vahid", "ÖLÇÜ VAHİDİ")}
              {detailColVisible("plu") && renderHeader("plu", "PLU KOD")}
              {detailColVisible("expiration") && renderHeader("expiration", "İSTİFADƏ MÜDDƏTİ")}
              {detailColVisible("category") && renderHeader("category", "KATEQORİYA")}
              {detailColVisible("country") && renderHeader("country", "ÖLKƏ")}
              {detailColVisible("supplier") && renderHeader("supplier", "TƏCHİZATÇI")}
              {detailColVisible("sale_price") && renderHeader("sale_price", "SATIŞ QİYMƏTİ", "right")}
              {detailColVisible("cost") && renderHeader("cost", "MAYA DƏYƏRİ", "right")}
              {detailColVisible("purchase_price") && renderHeader("purchase_price", "ALIŞ QİYMƏTİ", "right")}
              {detailColVisible("created") && renderHeader("created", "YARADILDI")}
              {detailColVisible("discount") && renderHeader("discount", "ENDİRİM", "right")}
              {detailColVisible("min_stock") && renderHeader("min_stock", "MİN. QALIQ", "right")}
              {visibleStores.map((store) => renderHeader(`store:${store.key}`, store.name, "right"))}
              {renderHeader("total", "QALIQ", "right")}
            </tr>
          </thead>

          <tbody>
            {/* folder rows */}
            {folderRows.map((folder) => {
              const folderProductIds = folder.products.map((p) => p.id);
              const selectedInFolder = folderProductIds.filter((id) => selected.has(id)).length;
              const folderChecked = folderProductIds.length > 0 && selectedInFolder === folderProductIds.length;
              const folderIndeterminate = selectedInFolder > 0 && selectedInFolder < folderProductIds.length;
              const prodCount = folder.products.length;
              const storeTotals = Object.fromEntries(
                activeStores.map((store) => [store.key, folder.products.reduce((sum, product) => sum + storeQty(product, store), 0)])
              );
              const sTot = Object.values(storeTotals).reduce((sum, qty) => sum + qty, 0);
              const openFolder = () => setCurrentFolder(folder.id);
              return (
                <tr
                  key={"folder-"+folder.id}
                  tabIndex={0}
                  onClick={openFolder}
                  onKeyDown={(e) => {
                    const target = e.target as HTMLElement;
                    if (target.tagName === "INPUT" || target.tagName === "BUTTON") return;
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openFolder();
                    }
                  }}
                  className={cx(
                    "group cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50",
                    ui.rowDivider,
                    isDark ? "bg-white/[.035] hover:bg-white/10" : "bg-white/35 hover:bg-white/65"
                  )}
                >
                  <td className="erp-select-cell">
                    <input
                      type="checkbox"
                      className="erp-select-checkbox"
                      checked={folderChecked}
                      disabled={folderProductIds.length === 0}
                      ref={(el) => { if (el) el.indeterminate = folderIndeterminate; }}
                      onClick={(e)=>e.stopPropagation()}
                      onChange={(e)=>setProductIdsSelected(folderProductIds, e.target.checked)}
                      aria-label={`Seç: ${folder.name}`}
                    />
                  </td>
                  <td className={cx("px-3", rowPad)}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-md", ui.softBox)}>
                        <I.Folder className={cx("h-5 w-5", folder.kind === "unassigned" ? "text-slate-500" : "text-blue-600")}/>
                      </div>
                      <button
                        onClick={(e)=>{ e.stopPropagation(); openFolder(); }}
                        className={cx("shrink-0 font-medium", isDark ? "text-slate-200" : "text-slate-600")}
                      >
                        {folder.name}
                      </button>
                      <span className={cx(
                        "rounded-full px-2 py-0.5 text-xs",
                        isDark ? "glass-control-dark text-slate-300" : "glass-control text-slate-500"
                      )}>
                        Məhsul: {prodCount}
                      </span>
                      <I.ChevronR className={cx("ml-auto h-4 w-4 shrink-0 transition-opacity", isDark ? "text-slate-500 group-hover:text-slate-300" : "text-slate-400 group-hover:text-slate-600")} />
                    </div>
                  </td>
                  {detailColVisible("kod") && <td className={cx("px-3", rowPad)}>—</td>}
                  {detailColVisible("taxes") && <td className={cx("px-3", rowPad)}>—</td>}
                  {detailColVisible("barcode") && <td className={cx("px-3", rowPad)}>—</td>}
                  {detailColVisible("artikel") && <td className={cx("px-3", rowPad)}>—</td>}
                  {detailColVisible("vahid") && <td className={cx("px-3", rowPad)}>—</td>}
                  {detailColVisible("plu") && <td className={cx("px-3", rowPad)}>—</td>}
                  {detailColVisible("expiration") && <td className={cx("px-3", rowPad)}>—</td>}
                  {detailColVisible("category") && <td className={cx("px-3", rowPad)}>—</td>}
                  {detailColVisible("country") && <td className={cx("px-3", rowPad)}>—</td>}
                  {detailColVisible("supplier") && <td className={cx("px-3", rowPad)}>—</td>}
                  {detailColVisible("sale_price") && <td className={cx("px-3 text-right", rowPad)}>—</td>}
                  {detailColVisible("cost") && <td className={cx("px-3 text-right", rowPad)}>—</td>}
                  {detailColVisible("purchase_price") && <td className={cx("px-3 text-right", rowPad)}>—</td>}
                  {detailColVisible("created") && <td className={cx("px-3", rowPad)}>—</td>}
                  {detailColVisible("discount") && <td className={cx("px-3 text-right", rowPad)}>—</td>}
                  {detailColVisible("min_stock") && <td className={cx("px-3 text-right", rowPad)}>—</td>}
                  {visibleStores.map((store) => <td key={store.id} className={cx("px-3 text-right tabular-nums", rowPad)}>{toNum(storeTotals[store.key])}</td>)}
                  <td className={cx("px-3 text-right tabular-nums", rowPad)}>{toNum(sTot)}</td>
                </tr>
              );
            })}

            {/* product rows */}
            {visibleProducts.map((r, i) => {
              const zebra = view.zebra && i % 2 === 1 ? (isDark ? "bg-white/[.035]" : "bg-white/28") : undefined;
              const isSel = selected.has(r.id);
              const total = totalStock(r);
              return (
                <tr
                  key={r.id}
                  onClick={() => setDetailProductId(r.id)}
                  className={cx("cursor-pointer", zebra, isSel && (isDark ? "bg-indigo-500/10" : "bg-indigo-100/35"), ui.rowDivider, ui.rowHover)}
                >
                  <td className="erp-select-cell">
                    <input className="erp-select-checkbox" type="checkbox" checked={isSel} onClick={(e) => e.stopPropagation()} onChange={()=>toggleRow(r.id)} aria-label={`Seç: ${r.ad}`} />
                  </td>
                  <td className={cx("px-3", rowPad)}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      {showProductMedia && (
                        <div className={cx(
                          "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gradient-to-br",
                          isDark ? "from-indigo-900/30 to-indigo-500/10 ring-1 ring-inset ring-indigo-800/40" : "from-indigo-200 to-indigo-50 ring-1 ring-inset ring-indigo-100"
                        )}>
                          {r.cardProfile?.imageDataUrl && <img src={r.cardProfile.imageDataUrl} alt="" className="h-full w-full object-cover" />}
                        </div>
                      )}
                      <span className={cx("truncate font-medium", isDark ? "text-slate-200" : "text-slate-700")}>{r.ad}</span>
                      {r.type !== "product" && (
                        <span className={cx("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", r.type === "service" ? (isDark ? "bg-sky-400/15 text-sky-200" : "bg-sky-50 text-sky-700") : (isDark ? "bg-violet-400/15 text-violet-200" : "bg-violet-50 text-violet-700"))}>
                          {r.type === "service" ? "Xidmət" : "Dəst"}
                        </span>
                      )}
                    </div>
                  </td>
                  {colVisible("kod") && <td className={cx("px-3 tabular-nums", rowPad)}>{r.kod ?? "—"}</td>}
                  {colVisible("taxes") && <td className={cx("px-3", rowPad)}>{taxesLabel(r)}</td>}
                  {colVisible("barcode") && <td className={cx("px-3 tabular-nums", rowPad)}>{barcodeLabel(r)}</td>}
                  {colVisible("artikel") && <td className={cx("px-3", rowPad)}>{r.artikel ?? "—"}</td>}
                  {colVisible("vahid") && <td className={cx("px-3", rowPad)}>{r.vahid ?? "—"}</td>}
                  {colVisible("plu") && <td className={cx("px-3 tabular-nums", rowPad)}>{pluLabel(r)}</td>}
                  {colVisible("expiration") && <td className={cx("px-3 tabular-nums", rowPad)}>{r.expirationDate ?? (r.expiresInDays != null ? `${r.expiresInDays} gün` : "—")}</td>}
                  {colVisible("category") && <td className={cx("px-3", rowPad)}>{categoryLabel(r)}</td>}
                  {colVisible("country") && <td className={cx("px-3", rowPad)}>{countryLabel(r)}</td>}
                  {colVisible("supplier") && <td className={cx("px-3", rowPad)}>{r.supplier ?? "—"}</td>}
                  {colVisible("sale_price") && <td className={cx("px-3 text-right tabular-nums", rowPad)}>{toCurrency(r.sale_price)}</td>}
                  {colVisible("cost") && <td className={cx("px-3 text-right tabular-nums", rowPad)}>{toCurrency(r.cost)}</td>}
                  {colVisible("purchase_price") && <td className={cx("px-3 text-right tabular-nums", rowPad)}>{toCurrency(r.purchase_price)}</td>}
                  {colVisible("created") && <td className={cx("px-3 tabular-nums", rowPad)}>{productCreatedLabel(r)}</td>}
                  {colVisible("discount") && <td className={cx("px-3 text-right tabular-nums", rowPad)}>{discountLabel(r)}</td>}
                  {colVisible("min_stock") && <td className={cx("px-3 text-right tabular-nums", rowPad)}>{toNum(r.minStock)}</td>}
                  {visibleStores.map((store) => {
                    const qty = storeQty(r, store);
                    return <td key={store.id} className={cx("px-3 text-right tabular-nums", rowPad, qty < 0 && "font-semibold text-rose-600")}>{r.type === "service" ? "—" : toNum(qty)}</td>;
                  })}
                  <td className={cx("px-3 text-right tabular-nums", rowPad, total < 0 && "font-semibold text-rose-600")}>{r.type === "service" ? "—" : toNum(total)}</td>
                </tr>
              );
            })}

            {visibleProducts.length === 0 && folderRows.length === 0 && (
              <tr><td colSpan={tableColSpan} className={cx("px-4 py-6 text-center", ui.textSubtle)}>Heç nə tapılmadı.</td></tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>

    <ProductCreatePanel
      visible={createOpen}
      isDark={isDark}
      defaultType={createType}
      defaultGroupId={defaultCreateGroupId}
      defaultCode={nextProductCode}
      groups={groups}
      stores={stores}
      products={rows.map((row) => ({ id: row.id, name: row.ad, code: row.kod }))}
      onClose={() => setCreateOpen(false)}
      onSubmit={handleCreate}
    />

    <GroupCreatePanel
      visible={groupCreateKind != null}
      kind={groupCreateKind ?? "folder"}
      groups={groupCreateKind === "category" ? categories : groups}
      currentFolder={currentFolder}
      isDark={isDark}
      onClose={() => setGroupCreateKind(null)}
      onSubmit={handleCreateGroup}
    />

    {detailProduct && (
      <ProductDetailPanel
        product={detailProduct}
        products={rows}
        groups={groups}
        categories={categories}
        variants={variants.filter((variant) => variant.productId === detailProduct.id)}
        bundleItems={bundleItems.filter((item) => item.bundleId === detailProduct.id)}
        audit={audit.filter((entry) => entry.productId === detailProduct.id)}
        movements={movements.filter((movement) => movement.productId === detailProduct.id)}
        isDark={isDark}
        stockMode={companySettings.stockMode}
        onClose={() => setDetailProductId(null)}
        onSave={(patch) => updateProduct(detailProduct.id, patch)}
        onDelete={() => deleteProducts([detailProduct.id])}
        onMovement={(input) => applyMovement({ ...input, productId: detailProduct.id })}
        onAddVariant={(variant) => addVariant(detailProduct.id, variant)}
        onAddBundleItem={(productId, qty) => addBundleItem(detailProduct.id, productId, qty)}
        onRemoveBundleItem={(itemId) => removeBundleItem(itemId, detailProduct.id)}
      />
    )}

    <BulkMovePanel
      visible={moveOpen}
      groups={groups}
      selectedCount={selected.size}
      isDark={isDark}
      onClose={() => setMoveOpen(false)}
      onSubmit={(groupId) => {
        const ids = Array.from(selected);
        setRows((prev) => prev.map((row) => ids.includes(row.id) ? { ...row, groupId } : row));
        ids.forEach((id) => logAudit(id, "Qovluq", "Məhsul qovluğa daşındı"));
        setSelected(new Set());
        setMoveOpen(false);
      }}
    />
  </>
  );

}

/* ------------------------------ warning popover ------------------------------ */
function WarningsPopover({ warnings, isDark }: { warnings: { label: string; count: number }[]; isDark: boolean }) {
  const ui = makeUI(isDark);
  const total = warnings.reduce((sum, warning) => sum + warning.count, 0);

  return (
    <div className={cx("surface-popover absolute right-0 z-50 mt-2 w-72 overflow-hidden p-2", ui.card, ui.ring)}>
      <div className="px-2 py-2">
        <div className={cx("text-sm font-semibold", isDark ? "text-slate-100" : "text-slate-700")}>Bildirişlər</div>
        <div className={cx("mt-0.5 text-xs", ui.textSubtle)}>
          {warnings.length > 0 ? `${total.toLocaleString("az-Latn-AZ")} diqqət tələb edən qeyd` : "Aktiv xəbərdarlıq yoxdur"}
        </div>
      </div>
      <div className="space-y-1">
        {warnings.length > 0 ? warnings.map((warning) => (
          <button
            key={warning.label}
            type="button"
            className={cx("flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm", isDark ? "hover:bg-white/10 text-slate-200" : "hover:bg-slate-50 text-slate-700")}
          >
            <span>{warning.label}</span>
            <span className={cx("rounded-full px-2 py-0.5 text-xs font-semibold", isDark ? "bg-amber-400/15 text-amber-200" : "bg-amber-100 text-amber-700")}>
              {warning.count}
            </span>
          </button>
        )) : (
          <div className={cx("rounded-lg px-2.5 py-3 text-sm", ui.textSubtle)}>Hər şey qaydasındadır.</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ create menu ------------------------------ */
function CreateMenu({ onPick, isDark }: { onPick: (target: CreateTarget) => void; isDark: boolean }) {
  const ui = makeUI(isDark);
  const Item = ({
    target,
    title,
    description,
    icon,
  }: {
    target: CreateTarget;
    title: string;
    description: string;
    icon: React.ReactNode;
  }) => (
    <button
      type="button"
      role="menuitem"
      onClick={() => onPick(target)}
      className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left", isDark ? "hover:bg-white/10" : "hover:bg-slate-50")}
    >
      <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", isDark ? "bg-white/10 text-indigo-200" : "bg-indigo-50 text-indigo-600")}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className={cx("block text-sm font-medium", isDark ? "text-slate-100" : "text-slate-800")}>{title}</span>
        <span className={cx("block text-xs", ui.textSubtle)}>{description}</span>
      </span>
    </button>
  );

  return (
    <div role="menu" className={cx("surface-popover absolute right-0 z-50 mt-2 w-72 overflow-hidden p-2", ui.card, ui.ring)}>
      <Item target="product" title="Məhsul" description="Stoklu məhsul kartı yarat" icon={<I.Box className="h-5 w-5" />} />
      <Item target="service" title="Xidmət" description="Stoksuz xidmət kartı yarat" icon={<I.Briefcase className="h-5 w-5" />} />
      <Item target="bundle" title="Dəst" description="Komplekt və paket satışı üçün" icon={<I.Layers className="h-5 w-5" />} />
      <div className={cx("my-2 h-px", isDark ? "bg-slate-700" : "bg-slate-200")} />
      <Item target="folder" title="Qovluq" description="Məhsulları naviqasiyada qruplaşdır" icon={<I.Folder className="h-5 w-5" />} />
      <Item target="category" title="Kateqoriya" description="Filter və təsnifat üçün bölmə yarat" icon={<I.Category className="h-5 w-5" />} />
      <div className={cx("my-2 h-px", isDark ? "bg-slate-700" : "bg-slate-200")} />
      <Item target="import" title="Import" description="CSV faylından məhsulları əlavə et" icon={<I.Upload className="h-4 w-4" />} />
      <Item target="export" title="Export" description="Bütün məhsulları CSV olaraq çıxar" icon={<I.Download className="h-4 w-4" />} />
    </div>
  );
}

/* ------------------------------ group/category create panel ------------------------------ */
function GroupCreatePanel({
  visible,
  kind,
  groups,
  currentFolder,
  isDark,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  kind: "folder" | "category";
  groups: Group[];
  currentFolder: FolderId;
  isDark: boolean;
  onClose: () => void;
  onSubmit: (values: { name: string; parentId: number | null }) => void;
}) {
  const ui = makeUI(isDark);
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<string>("");

  useEffect(() => {
    if (!visible) return;
    setName("");
    setParentId(kind === "folder" && typeof currentFolder === "number" ? String(currentFolder) : "");
  }, [currentFolder, kind, visible]);

  if (!visible) return null;

  const title = kind === "folder" ? "Qovluq yarat" : "Kateqoriya yarat";
  const submit = () => {
    const cleanName = name.trim();
    if (!cleanName) return;
    onSubmit({ name: cleanName, parentId: parentId ? Number(parentId) : null });
  };

  return (
    <div
      className={cx("fixed inset-0 z-40 flex items-center justify-center px-4 py-6", isDark ? "bg-slate-950/55 backdrop-blur-sm" : "bg-slate-900/30 backdrop-blur-sm")}
      onClick={onClose}
    >
      <div className={cx("w-full max-w-md p-5", ui.card, ui.ring)} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">{title}</h3>
            <p className={cx("mt-1 text-xs", ui.textSubtle)}>
              {kind === "folder" ? "Naviqasiya üçün yeni qovluq əlavə et." : "Filter və təsnifat üçün yeni kateqoriya əlavə et."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={cx("h-8 rounded-lg border px-3 text-sm", ui.borderSoft, isDark ? "hover:bg-white/10" : "hover:bg-white/65")}
          >
            Bağla
          </button>
        </div>

        <div className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={kind === "folder" ? "Qovluq adı" : "Kateqoriya adı"}
            className={ui.input}
            autoFocus
          />
          <select value={parentId} onChange={(e) => setParentId(e.target.value)} className={ui.input}>
            <option value="">Ana səviyyə</option>
            {groups.map((group) => (
              <option key={group.id} value={String(group.id)}>{group.name}</option>
            ))}
          </select>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className={cx("h-9 rounded-lg border px-4 text-sm", ui.borderSoft, isDark ? "hover:bg-white/10" : "hover:bg-white/65")}
          >
            İmtina et
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!name.trim()}
            className={cx("surface-primary h-9 rounded-lg px-4 text-sm", !name.trim() && "opacity-50")}
          >
            Yarat
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ product detail panel ------------------------------ */
const ROLL_MT = 120;

function splitTraceWarehouse(name: TraceWarehouse["name"], qty?: number, productId = 1): TraceWarehouse {
  const safeQty = Math.max(0, Math.round(qty ?? 0));
  const closedRolls = Math.floor(safeQty / ROLL_MT);
  const openRolls = safeQty % ROLL_MT > 0 ? 1 : 0;
  const reservedMt = name === "ERSA ANTREPO" && safeQty > ROLL_MT * 2 ? ROLL_MT : 0;
  return {
    name,
    qty: safeQty,
    closedRolls,
    openRolls,
    reservedMt: productId % 2 === 0 ? 0 : reservedMt,
  };
}

function buildTraceRolls(product: Product, productBarcode: string): TraceRoll[] {
  const rows: TraceRoll[] = [];
  const addRolls = (warehouse: TraceRoll["warehouse"], qty: number, offset: number) => {
    let remaining = Math.max(0, Math.round(qty));
    let index = 1;
    while (remaining > 0 && index <= 18) {
      const current = Math.min(ROLL_MT, remaining);
      const isOpen = current < ROLL_MT;
      const reserved = warehouse === "ERSA ANTREPO" && index === 1 && !isOpen && product.id % 2 === 1;
      const palletNo = Math.ceil((index + offset) / 4);
      const rollNo = ((index + offset - 1) % 16) + 1;
      const status: TraceRollStatus = reserved ? "Rezervdə" : isOpen ? "Açıq" : "Bağlı";
      rows.push({
        barcode: `${productBarcode === "—" ? "ARIX" : productBarcode}-R${String(index + offset).padStart(2, "0")}`,
        container: warehouse === "ERSA ANTREPO" ? `CNT-${String((product.id % 7) + 1).padStart(3, "0")}` : "DEPO",
        pallet: warehouse === "ERSA ANTREPO" ? `Palet ${palletNo}` : `D rəfi ${palletNo}`,
        roll: `R-${String(rollNo).padStart(2, "0")}`,
        productName: product.ad,
        warehouse,
        location: warehouse === "ERSA ANTREPO" ? `A-${palletNo}.${rollNo}` : `D-${(product.id % 4) + 1}-${palletNo}`,
        status,
        initialMt: isOpen ? ROLL_MT : current,
        remainingMt: current,
        reservedMt: reserved ? current : 0,
        netKg: Math.round(current * 0.34),
        grossKg: Math.round(current * 0.36),
        lastAction: isOpen ? "Rulo açılıb, metrlə satışa hazırdır" : reserved ? "Rezervdə saxlanılır" : "Tam rulo stokdadır",
      });
      remaining -= current;
      index += 1;
    }
  };

  addRolls("ERSA ANTREPO", product.antrepo ?? 0, 0);
  addRolls("ERSA DEPO", product.depo ?? 0, 40);
  return rows;
}

function traceStatusClass(status: TraceRollStatus, isDark: boolean) {
  if (status === "Bağlı") return isDark ? "bg-emerald-400/15 text-emerald-100" : "bg-emerald-50 text-emerald-700";
  if (status === "Açıq") return isDark ? "bg-sky-400/15 text-sky-100" : "bg-sky-50 text-sky-700";
  if (status === "Rezervdə") return isDark ? "bg-amber-400/15 text-amber-100" : "bg-amber-50 text-amber-700";
  if (status === "Zədəli") return isDark ? "bg-rose-400/15 text-rose-100" : "bg-rose-50 text-rose-700";
  return isDark ? "bg-slate-400/15 text-slate-200" : "bg-slate-100 text-slate-600";
}

function ProductDetailPanel({
  product,
  products,
  groups,
  categories,
  variants,
  bundleItems,
  audit,
  movements,
  isDark,
  stockMode,
  onClose,
  onSave,
  onDelete,
  onMovement,
  onAddVariant,
  onAddBundleItem,
  onRemoveBundleItem,
}: {
  product: Product;
  products: Product[];
  groups: Group[];
  categories: Category[];
  variants: ProductVariant[];
  bundleItems: BundleItem[];
  audit: AuditEntry[];
  movements: StockMovement[];
  isDark: boolean;
  stockMode: StockMode;
  onClose: () => void;
  onSave: (patch: Partial<Product>) => void;
  onDelete: () => void;
  onMovement: (input: Omit<StockMovement, "id" | "at" | "productId">) => void;
  onAddVariant: (variant: Omit<ProductVariant, "id" | "productId">) => void;
  onAddBundleItem: (productId: number, qty: number) => void;
  onRemoveBundleItem: (id: number) => void;
}) {
  const ui = makeUI(isDark);
  const [tab, setTab] = useState<"overview" | "stock" | "containers" | "rolls" | "variants" | "bundle" | "inventory" | "history">("overview");
  const buildEditState = (item: Product) => ({
    ad: item.ad,
    kod: item.kod ?? "",
    artikel: item.artikel ?? "",
    vahid: item.vahid ?? "",
    groupId: item.groupId == null ? "" : String(item.groupId),
    categoryId: item.categoryIds?.[0] == null ? "" : String(item.categoryIds[0]),
    sale: item.sale_price == null ? "" : String(item.sale_price),
    purchase: item.purchase_price == null ? "" : String(item.purchase_price),
    cost: item.cost == null ? "" : String(item.cost),
    minStock: item.minStock == null ? "" : String(item.minStock),
    supplier: item.supplier ?? "",
    expirationDate: item.expirationDate ?? "",
    description: item.description ?? "",
  });
  const [editMode, setEditMode] = useState(false);
  const [edit, setEdit] = useState(() => buildEditState(product));
  const [movement, setMovement] = useState({
    type: "purchase" as StockMovement["type"],
    qty: "",
    place: "antrepo" as "antrepo" | "depo",
    from: "antrepo" as "antrepo" | "depo",
    to: "depo" as "antrepo" | "depo",
    note: "",
  });
  const [variantForm, setVariantForm] = useState({ name: "", barcode: "", antrepo: "", depo: "", purchase: "", cost: "", sale: "" });
  const [bundleForm, setBundleForm] = useState({ productId: "", qty: "1" });

  useEffect(() => {
    setEdit(buildEditState(product));
    setEditMode(false);
    setTab("overview");
  }, [product]);
  useEffect(() => {
    if (stockMode === "simple" && (tab === "containers" || tab === "rolls")) setTab("stock");
  }, [stockMode, tab]);

  const inputClass = cx(
    "h-9 rounded-lg border px-3 text-sm outline-none",
    isDark ? "bg-slate-900 border-white/10 text-slate-100" : "bg-white border-slate-200 text-slate-900"
  );
  const sectionClass = cx(
    "rounded-2xl border p-5 shadow-sm",
    isDark ? "border-white/10 bg-white/5 shadow-black/10" : "border-slate-200/80 bg-slate-50/85 shadow-slate-200/45"
  );
  const mutedPanelClass = cx(
    "rounded-xl border px-3.5 py-3",
    isDark ? "border-white/10 bg-slate-950/20" : "border-slate-200/75 bg-white/80"
  );
  const subtleRowClass = isDark ? "bg-slate-950/20" : "bg-white/75";
  const detailLabelClass = cx("text-[13px] leading-5", isDark ? "text-slate-400" : "text-slate-500");
  const detailValueClass = cx("min-w-0 text-[14px] font-semibold leading-5", isDark ? "text-slate-100" : "text-slate-800");
  const total = (product.antrepo ?? 0) + (product.depo ?? 0);
  const productTypeLabel = product.type === "service" ? "Xidmət" : product.type === "bundle" ? "Dəst" : "Məhsul";
  const groupName = groups.find((group) => group.id === product.groupId)?.name ?? "Qovluqsuz";
  const categoryNames = product.categoryIds?.map((id) => categories.find((category) => category.id === id)?.name).filter(Boolean).join(", ") || "Kateqoriyasız";
  const country = product.country || "—";
  const createdLabel = product.createdAt
    ? new Date(product.createdAt).toLocaleDateString("az-Latn-AZ")
    : `2026-05-${String(((product.id - 1) % 28) + 1).padStart(2, "0")}`;
  const productBarcode = product.barcode ?? variants[0]?.barcode ?? (product.kod ? `000${product.kod}`.slice(-12).padStart(12, "0") : "—");
  const traceWarehouses = [
    splitTraceWarehouse("ERSA ANTREPO", product.antrepo, product.id),
    splitTraceWarehouse("ERSA DEPO", product.depo, product.id),
  ];
  const traceRolls = buildTraceRolls(product, productBarcode);
  const traceOpenRolls = traceRolls.filter((row) => row.status === "Açıq");
  const traceReserved = traceWarehouses.reduce((sum, row) => sum + row.reservedMt, 0);
  const traceClosedRollCount = traceWarehouses.reduce((sum, row) => sum + row.closedRolls, 0);
  const traceOpenRollCount = traceWarehouses.reduce((sum, row) => sum + row.openRolls, 0);
  const effectivePurchase = product.purchase_price ?? product.cost ?? 0;
  const effectiveCost = product.cost ?? effectivePurchase;
  const effectiveSale = product.sale_price ?? 0;
  const marginValue = effectiveSale - effectiveCost;
  const formatPercent = (value: number | null) => value == null ? "—" : `${value.toLocaleString("az-Latn-AZ", { maximumFractionDigits: 1 })}%`;
  const markup = effectiveCost > 0 ? (marginValue / effectiveCost) * 100 : null;
  const marginality = effectiveSale > 0 ? (marginValue / effectiveSale) * 100 : null;
  const warehouseRows = [
    ["ERSA ANTREPO", toCurrency(effectiveSale), toNum(product.antrepo), toCurrency((product.antrepo ?? 0) * effectiveCost), toCurrency((product.antrepo ?? 0) * effectiveSale)],
    ["ERSA DEPO", toCurrency(effectiveSale), toNum(product.depo), toCurrency((product.depo ?? 0) * effectiveCost), toCurrency((product.depo ?? 0) * effectiveSale)],
    ["Cəmi", "—", toNum(total), toCurrency(total * effectiveCost), toCurrency(total * effectiveSale)],
  ];
  const stockByBarcode = (variants.length > 0
    ? variants.flatMap((variant) => {
        const variantPurchase = variant.purchase_price ?? product.purchase_price ?? product.cost ?? 0;
        const variantCost = variant.cost ?? variantPurchase;
        const variantSale = variant.sale_price ?? product.sale_price ?? 0;
        return [
          { barcode: variant.barcode ?? "—", variant: variant.name, warehouse: "ERSA ANTREPO", qty: variant.antrepo, purchase: variantPurchase, cost: variantCost, sale: variantSale },
          { barcode: variant.barcode ?? "—", variant: variant.name, warehouse: "ERSA DEPO", qty: variant.depo, purchase: variantPurchase, cost: variantCost, sale: variantSale },
        ];
      })
    : [
        { barcode: productBarcode, variant: "Standart", warehouse: "ERSA ANTREPO", qty: product.antrepo ?? 0, purchase: effectivePurchase, cost: effectiveCost, sale: effectiveSale },
        { barcode: productBarcode, variant: "Standart", warehouse: "ERSA DEPO", qty: product.depo ?? 0, purchase: effectivePurchase, cost: effectiveCost, sale: effectiveSale },
      ]);
  const barcodeRows = stockByBarcode.map((row) => [
    row.barcode,
    row.variant,
    row.warehouse,
    toCurrency(row.purchase),
    toCurrency(row.sale),
    toNum(row.qty),
    toCurrency(row.qty * row.cost),
  ]);
  const inventoryHistoryRows = movements.map((row) => [
    new Date(row.at).toLocaleString("az-Latn-AZ"),
    row.type === "purchase" ? "Alış" : row.type === "sale" ? "Satış" : row.type === "return" ? "Geri qaytarma" : row.type === "transfer" ? "Transfer" : "Düzəliş",
    toNum(row.qty),
    row.type === "transfer"
      ? `${row.from === "depo" ? "ERSA DEPO" : "ERSA ANTREPO"} → ${row.to === "depo" ? "ERSA DEPO" : "ERSA ANTREPO"}`
      : row.place === "depo" ? "ERSA DEPO" : "ERSA ANTREPO",
    row.note || "—",
  ]);
  const bundleTotal = bundleItems.reduce((sum, item) => {
    const found = products.find((row) => row.id === item.productId);
    return sum + (found?.sale_price ?? 0) * item.qty;
  }, 0);

  const save = () => {
    onSave({
      ad: edit.ad.trim() || product.ad,
      kod: edit.kod.trim() || undefined,
      artikel: edit.artikel.trim() || undefined,
      vahid: edit.vahid.trim() || undefined,
      groupId: edit.groupId ? Number(edit.groupId) : null,
      categoryIds: edit.categoryId ? [Number(edit.categoryId)] : [],
      sale_price: parseOptionalNumber(edit.sale),
      purchase_price: parseOptionalNumber(edit.purchase),
      cost: parseOptionalNumber(edit.cost),
      minStock: parseOptionalNumber(edit.minStock),
      supplier: edit.supplier.trim() || undefined,
      expirationDate: edit.expirationDate || undefined,
      description: edit.description.trim() || undefined,
    });
    setEditMode(false);
  };

  const visibleTabs = product.type === "service"
    ? ([
        ["overview", "Kart"],
        ["history", "Tarixçə"],
      ] as const)
    : product.type === "bundle"
      ? ([
          ["overview", "Kart"],
          ["bundle", "Dəst tərkibi"],
          ["stock", "Qalıq"],
          ["history", "Tarixçə"],
        ] as const)
      : stockMode === "bondedRolls"
      ? ([
        ["overview", "Kart"],
        ["stock", "Qalıq"],
        ["containers", "Konteynerlər"],
        ["rolls", "Rulolar"],
        ["variants", "Variantlar"],
        ["inventory", "Hərəkətlər"],
        ["history", "Tarixçə"],
      ] as const)
      : ([
          ["overview", "Kart"],
          ["stock", "Qalıq"],
          ["variants", "Variantlar"],
          ["inventory", "Hərəkətlər"],
          ["history", "Tarixçə"],
        ] as const);
  const bondedSummary = {
    antrepo: product.antrepo ?? 0,
    reserved: traceReserved,
    depo: product.depo ?? 0,
    openRolls: traceOpenRollCount,
    closedRolls: traceClosedRollCount,
    netKg: traceRolls.reduce((sum, row) => sum + row.netKg, 0),
    grossKg: traceRolls.reduce((sum, row) => sum + row.grossKg, 0),
  };
  const profile = product.cardProfile;
  const cardProfileRows = [
    ["Marka", profile?.brand],
    ["İkinci vahid", profile?.secondaryUnit && `${profile.secondaryUnit}${profile.conversionRate ? ` · əmsal ${toNum(profile.conversionRate)}` : ""}`],
    ["Rulo pasportu", profile?.rollWidthMm || profile?.defaultRollLengthMt ? `${toNum(profile?.rollWidthMm)} mm · ${toNum(profile?.defaultRollLengthMt)} mt` : undefined],
    ["Net / brüt", profile?.netWeightKg || profile?.grossWeightKg ? `${toNum(profile?.netWeightKg)} / ${toNum(profile?.grossWeightKg)} kg` : undefined],
    ["Barkod növü", profile?.barcodeType === "weight" ? "KG barkodu" : profile?.barcodeType === "quantity" ? "Ədəd barkodu" : profile?.barcodeType === "plu" ? "PLU barkodu" : profile?.barcodeType === "fixed" ? "Sabit barkod" : undefined],
    ["Rəf yeri", profile?.shelfLocation],
    ["Stok həddi", profile?.maxStock != null ? `${toNum(product.minStock)} – ${toNum(profile.maxStock)}` : undefined],
    ["Sifariş həddi", profile?.minOrderQty != null || profile?.maxOrderQty != null ? `${toNum(profile?.minOrderQty)} – ${toNum(profile?.maxOrderQty)}` : undefined],
    ["GTİP", profile?.tariffCode],
    ["Təchizatçı kodu", profile?.supplierProductCode || profile?.supplierCode],
    ["Alternativlər", profile?.alternativeProductIds?.length ? `${profile.alternativeProductIds.length} məhsul` : undefined],
  ].filter((row): row is string[] => Boolean(row[1]));
  const bondedContainerRows: string[][] = traceWarehouses.map((row) => [
    row.name,
    row.name === "ERSA ANTREPO" ? `CNT-${String((product.id % 7) + 1).padStart(3, "0")}` : "Depo stoku",
    toNum(row.closedRolls + row.openRolls),
    toNum(row.closedRolls),
    toNum(row.openRolls),
    `${toNum(row.reservedMt)} ${product.vahid ?? "mt"}`,
    `${toNum(row.qty)} ${product.vahid ?? "mt"}`,
  ]);
  const bondedRollRows: string[][] = traceRolls.map((row) => [
    row.barcode,
    row.container,
    row.pallet,
    row.roll,
    row.warehouse,
    row.location,
    `${toNum(row.remainingMt)} / ${toNum(row.initialMt)} mt`,
    `${toNum(row.netKg)} / ${toNum(row.grossKg)} kg`,
    row.status,
  ]);

  return (
    <div className={cx("fixed inset-0 z-50 flex justify-end backdrop-blur-[2px]", isDark ? "bg-slate-950/60" : "bg-slate-900/25")} onClick={onClose}>
      <div className={cx("erp-drawer-shell product-detail-shell flex w-full max-w-5xl flex-col overflow-hidden", ui.card)} onClick={(e) => e.stopPropagation()}>
        <div className={cx("flex items-center justify-between gap-3 border-b px-5 py-3.5", isDark ? "border-white/10" : "border-slate-200/80")}>
          <div className="flex min-w-0 items-center gap-3">
            <div className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", isDark ? "border-white/10 bg-slate-950/20 text-indigo-200" : "border-slate-200 bg-slate-50 text-indigo-600")}>
              <I.Box className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className={cx("text-[11px] font-semibold uppercase tracking-wide", ui.textSubtle)}>{productTypeLabel} kartı</div>
              <div className={cx("mt-0.5 truncate text-sm", isDark ? "text-slate-300" : "text-slate-600")}>Kart məlumatları</div>
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {editMode ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setEdit(buildEditState(product));
                    setEditMode(false);
                  }}
                  className={cx("h-9 rounded-lg border px-3 text-sm", ui.borderSoft, isDark ? "hover:bg-white/10" : "hover:bg-white/65")}
                >
                  İmtina
                </button>
                <button type="button" onClick={save} className="surface-primary h-9 rounded-lg px-3 text-sm">Yadda saxla</button>
              </>
            ) : (
              <button type="button" onClick={() => setEditMode(true)} className="surface-primary h-9 rounded-lg px-3 text-sm">Redaktə et</button>
            )}
            <button type="button" onClick={onDelete} className={cx("h-9 rounded-lg border px-3 text-sm text-red-600", isDark ? "border-red-500/40 hover:bg-red-500/10" : "border-red-200 hover:bg-red-50")}>Sil</button>
            <button type="button" onClick={onClose} className={cx("h-9 rounded-lg border px-3 text-sm", ui.borderSoft, isDark ? "hover:bg-white/10" : "hover:bg-white/65")}>Bağla</button>
          </div>
        </div>

        <div className={cx("border-b px-4 py-4", isDark ? "border-white/10 bg-slate-900/15" : "border-slate-200/80 bg-slate-50/65")}>
          <div className="grid gap-4 lg:grid-cols-[140px_minmax(0,1fr)]">
            <div className={cx("flex aspect-square max-h-[140px] items-center justify-center rounded-2xl border", isDark ? "border-white/10 bg-slate-950/30" : "border-slate-200/75 bg-white")}>
              <div className="text-center">
                <I.Box className={cx("mx-auto h-10 w-10", isDark ? "text-slate-500" : "text-slate-300")} />
                <div className={cx("mt-2 text-[11px]", ui.textSubtle)}>Şəkil əlavə edilə bilər</div>
              </div>
            </div>
            <div className="min-w-0 self-center">
              <div className={cx("text-[11px] font-semibold uppercase tracking-[0.08em]", ui.textSubtle)}>{productTypeLabel}</div>
              <h2 className={cx("mt-1 text-[25px] font-semibold leading-tight", isDark ? "text-slate-50" : "text-slate-900")}>{product.ad}</h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className={mutedPanelClass}><div className={cx("text-[11px] font-medium", ui.textSubtle)}>Barkod</div><div className={detailValueClass}>{productBarcode}</div></div>
                <div className={mutedPanelClass}><div className={cx("text-[11px] font-medium", ui.textSubtle)}>SKU / Artikul</div><div className={detailValueClass}>{product.artikel ?? "—"}</div></div>
                <div className={mutedPanelClass}><div className={cx("text-[11px] font-medium", ui.textSubtle)}>Məhsul kodu</div><div className={detailValueClass}>{product.kod ?? "—"}</div></div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                {product.type !== "service" && <span className={cx("rounded-full px-2.5 py-1", total < 0 ? (isDark ? "bg-rose-400/15 text-rose-100" : "bg-rose-50 text-rose-700") : (isDark ? "bg-indigo-400/15 text-indigo-100" : "bg-indigo-50 text-indigo-700"))}>Qalıq: {toNum(total)}</span>}
                <span className={cx("rounded-full px-2.5 py-1", isDark ? "bg-emerald-400/15 text-emerald-100" : "bg-emerald-50 text-emerald-700")}>Satış: {toCurrency(effectiveSale)}</span>
                <span className={cx("rounded-full px-2.5 py-1", isDark ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-600")}>{groupName}</span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-1">
          {visibleTabs.map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={cx(
                "rounded-lg px-3 py-1.5 text-[13px] font-medium transition",
                tab === id
                  ? "bg-indigo-600 text-white shadow-sm shadow-indigo-600/20"
                  : isDark ? "text-slate-300 hover:bg-white/10" : "text-slate-600 hover:bg-white"
              )}
            >
              {label}
            </button>
          ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {tab === "overview" && (
            <div className="space-y-4">
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <section className={sectionClass}>
                  <div className={cx("mb-3 text-[15px] font-semibold", isDark ? "text-slate-100" : "text-slate-900")}>Əsas məlumat</div>
                  <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {[
                      ["Yaradıldı", createdLabel],
                      ["Kateqoriyalar", categoryNames],
                      ["Ölkə", country],
                      ["İstifadə müddəti", product.expirationDate ?? (product.expiresInDays == null ? "—" : `${product.expiresInDays} gün`)],
                      ["Qovluq", groupName],
                      ["Təchizatçı", product.supplier ?? "—"],
                      ["Ölçü vahidi", product.vahid ?? "—"],
                      ["Təsvir", product.description ?? "—"],
                    ].map(([label, value]) => (
                      <div key={label} className="grid grid-cols-[130px_minmax(0,1fr)] gap-3">
                        <span className={detailLabelClass}>{label}</span>
                        <span className={detailValueClass}>{value}</span>
                      </div>
                    ))}
                  </div>
                </section>
                <section className={sectionClass}>
                  <div className={cx("mb-3 text-[15px] font-semibold", isDark ? "text-slate-100" : "text-slate-900")}>Qiymət xülasəsi</div>
                  <div className="space-y-2">
                    {[
                      ["Satış qiyməti", toCurrency(effectiveSale)],
                      ["Alış qiyməti", toCurrency(effectivePurchase)],
                      ["Maya dəyəri", toCurrency(effectiveCost)],
                      ["Markup", formatPercent(markup)],
                      ["Mənfəətlilik", formatPercent(marginality)],
                    ].map(([label, value]) => (
                      <div key={label} className={cx("flex items-center justify-between rounded-lg px-3 py-2.5", subtleRowClass)}>
                        <span className={detailLabelClass}>{label}</span>
                        <span className={detailValueClass}>{value}</span>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              {cardProfileRows.length > 0 && (
                <section className={sectionClass}>
                  <div className={cx("mb-3 text-[15px] font-semibold", isDark ? "text-slate-100" : "text-slate-900")}>Kart parametrləri</div>
                  <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                    {cardProfileRows.map(([label, value]) => (
                      <div key={label} className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
                        <span className={detailLabelClass}>{label}</span>
                        <span className={detailValueClass}>{value}</span>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {product.type !== "service" && <section className={sectionClass}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className={cx("text-[15px] font-semibold", isDark ? "text-slate-100" : "text-slate-900")}>Anbar xülasəsi</div>
                  <div className={cx("text-xs", ui.textSubtle)}>Anbar tabında barkod və partiya səviyyəsi saxlanır</div>
                </div>
                <SimpleTable
                  headers={["Anbar", "Satış qiyməti", "Qalıq", "Maya ilə dəyər", "Satış ilə dəyər"]}
                  rows={warehouseRows}
                  isDark={isDark}
                />
              </section>}

              {product.type === "product" && stockMode === "bondedRolls" && (
                <section className={sectionClass}>
                  <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <div className={cx("text-[15px] font-semibold", isDark ? "text-slate-100" : "text-slate-900")}>Rulo izlənəbilirliyi</div>
                      <p className={cx("text-sm", ui.textSubtle)}>Barkod, palet və açıq rulo qalıqları məhsul kartından izlənir.</p>
                    </div>
                    <span className={cx("rounded-full px-3 py-1 text-xs font-semibold", traceReserved > 0 ? (isDark ? "bg-amber-400/15 text-amber-100" : "bg-amber-50 text-amber-700") : (isDark ? "bg-emerald-400/15 text-emerald-100" : "bg-emerald-50 text-emerald-700"))}>
                      {traceReserved > 0 ? `${toNum(traceReserved)} mt rezervdə` : "Rezerv yoxdur"}
                    </span>
                  </div>
                  <div className="grid gap-3 md:grid-cols-4">
                    {[
                      ["Satıla bilən", `${toNum(Math.max(0, total - traceReserved))} ${product.vahid ?? "mt"}`],
                      ["Bağlı rulo", toNum(traceClosedRollCount)],
                      ["Açıq rulo", toNum(traceOpenRollCount)],
                      ["Barkodlu mövqe", toNum(traceRolls.length)],
                    ].map(([label, value]) => (
                      <div key={label} className={mutedPanelClass}>
                        <div className={cx("text-[12px] font-semibold", ui.textSubtle)}>{label}</div>
                        <div className="mt-2 text-xl font-semibold tabular-nums">{value}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    {traceOpenRolls.slice(0, 2).map((roll) => (
                      <div key={roll.barcode} className={cx("rounded-xl border px-3.5 py-3", isDark ? "border-sky-300/15 bg-sky-300/5" : "border-sky-100 bg-sky-50/65")}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className={cx("truncate text-sm font-semibold", isDark ? "text-slate-100" : "text-slate-900")}>{roll.roll} · {roll.pallet}</div>
                            <div className={cx("mt-1 text-xs", ui.textSubtle)}>{roll.warehouse} · {roll.location} · {roll.barcode}</div>
                          </div>
                          <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", traceStatusClass(roll.status, isDark))}>{roll.status}</span>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70">
                          <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(8, Math.min(100, (roll.remainingMt / roll.initialMt) * 100))}%` }} />
                        </div>
                        <div className={cx("mt-2 text-xs", ui.textSubtle)}>{toNum(roll.remainingMt)} mt qalıb · başlanğıc {toNum(roll.initialMt)} mt</div>
                      </div>
                    ))}
                    {traceOpenRolls.length === 0 && (
                      <div className={cx("rounded-xl border px-3.5 py-3 text-sm", ui.borderSoft, ui.textSubtle)}>Hazırda açıq rulo yoxdur. Metrlə satış ediləndə açılan rulolar burada görünəcək.</div>
                    )}
                  </div>
                </section>
              )}

              {editMode && (
                <section className={sectionClass}>
                  <div className="mb-3 text-sm font-semibold">Redaktə</div>
                  <div className="grid gap-3 md:grid-cols-4">
                    <input className={cx(inputClass, "md:col-span-2")} value={edit.ad} onChange={(e) => setEdit((v) => ({ ...v, ad: e.target.value }))} placeholder="Ad" />
                    <input className={inputClass} value={edit.kod} onChange={(e) => setEdit((v) => ({ ...v, kod: e.target.value }))} placeholder="Kod" />
                    <input className={inputClass} value={edit.artikel} onChange={(e) => setEdit((v) => ({ ...v, artikel: e.target.value }))} placeholder="Artikul" />
                    <input className={inputClass} value={edit.vahid} onChange={(e) => setEdit((v) => ({ ...v, vahid: e.target.value }))} placeholder="Ölçü vahidi" />
                    <select className={inputClass} value={edit.groupId} onChange={(e) => setEdit((v) => ({ ...v, groupId: e.target.value }))}>
                      <option value="">Qovluqsuz</option>
                      {groups.map((group) => <option key={group.id} value={String(group.id)}>{group.name}</option>)}
                    </select>
                    <select className={inputClass} value={edit.categoryId} onChange={(e) => setEdit((v) => ({ ...v, categoryId: e.target.value }))}>
                      <option value="">Kateqoriyasız</option>
                      {categories.map((category) => <option key={category.id} value={String(category.id)}>{category.name}</option>)}
                    </select>
                    <input className={inputClass} value={edit.supplier} onChange={(e) => setEdit((v) => ({ ...v, supplier: e.target.value }))} placeholder="Təchizatçı" />
                    <input className={inputClass} value={edit.expirationDate} onChange={(e) => setEdit((v) => ({ ...v, expirationDate: e.target.value }))} type="date" />
                    <input className={inputClass} value={edit.purchase} onChange={(e) => setEdit((v) => ({ ...v, purchase: e.target.value }))} placeholder="Alış" />
                    <input className={inputClass} value={edit.cost} onChange={(e) => setEdit((v) => ({ ...v, cost: e.target.value }))} placeholder="Maya" />
                    <input className={inputClass} value={edit.sale} onChange={(e) => setEdit((v) => ({ ...v, sale: e.target.value }))} placeholder="Satış" />
                    <input className={inputClass} value={edit.minStock} onChange={(e) => setEdit((v) => ({ ...v, minStock: e.target.value }))} placeholder="Minimal qalıq" />
                    <textarea className={cx(inputClass, "h-24 py-2 md:col-span-4")} value={edit.description} onChange={(e) => setEdit((v) => ({ ...v, description: e.target.value }))} placeholder="Təsvir" />
                  </div>
                  <div className="mt-4 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEdit(buildEditState(product));
                        setEditMode(false);
                      }}
                      className={cx("h-9 rounded-lg border px-4 text-sm", ui.borderSoft, isDark ? "hover:bg-white/10" : "hover:bg-white/65")}
                    >
                      İmtina
                    </button>
                    <button type="button" onClick={save} className="surface-primary h-9 rounded-lg px-4 text-sm">Yadda saxla</button>
                  </div>
                </section>
              )}
            </div>
          )}

          {tab === "stock" && (
            <div className="space-y-4">
              {stockMode === "bondedRolls" && (
                <>
                  <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">
                    {[
                      ["Antrepo", bondedSummary.antrepo],
                      ["Rezerv", bondedSummary.reserved],
                      ["Depo", bondedSummary.depo],
                      ["Açıq rulo", bondedSummary.openRolls],
                      ["Bağlı rulo", bondedSummary.closedRolls],
                      ["Net kg", bondedSummary.netKg],
                    ].map(([label, value]) => (
                      <div key={label} className={sectionClass}>
                        <div className={cx("text-[12px] font-semibold", ui.textSubtle)}>{label}</div>
                        <div className="mt-2 text-xl font-semibold tabular-nums">{toNum(Number(value))}</div>
                      </div>
                    ))}
                  </div>
                  <section className={sectionClass}>
                    <div className={cx("mb-3 text-[15px] font-semibold", isDark ? "text-slate-100" : "text-slate-900")}>İzlənə bilən stok xəritəsi</div>
                    <div className="grid gap-3 md:grid-cols-3">
                      {[
                        ["1", "Bağlı rulo", "Tam rulo barkodu ilə satılır və ya açılmadan rezerv edilir."],
                        ["2", "Açıq rulo", "Metrlə satış üçün açılan ruloda qalan metr ayrıca izlənir."],
                        ["3", "Hərəkət", "Satış, yerdəyişmə və düzəlişlər rulo/palet səviyyəsində tarixçəyə düşür."],
                      ].map(([step, title, text]) => (
                        <div key={step} className={mutedPanelClass}>
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-indigo-600 text-xs font-semibold text-white">{step}</span>
                            <span className="font-semibold">{title}</span>
                          </div>
                          <p className={cx("mt-2 text-sm leading-5", ui.textSubtle)}>{text}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-4">
                      <SimpleTable
                        headers={["Anbar", "Toplam", "Bağlı rulo", "Açıq rulo", "Rezerv"]}
                        rows={traceWarehouses.map((row) => [
                          row.name,
                          `${toNum(row.qty)} ${product.vahid ?? "mt"}`,
                          toNum(row.closedRolls),
                          toNum(row.openRolls),
                          `${toNum(row.reservedMt)} ${product.vahid ?? "mt"}`,
                        ])}
                        isDark={isDark}
                      />
                    </div>
                  </section>
                </>
              )}
              <div className="grid gap-3 md:grid-cols-3">
                <div className={sectionClass}><div className={ui.textSubtle}>ERSA ANTREPO</div><div className="text-xl font-semibold">{toNum(product.antrepo)}</div></div>
                <div className={sectionClass}><div className={ui.textSubtle}>ERSA DEPO</div><div className="text-xl font-semibold">{toNum(product.depo)}</div></div>
                <div className={sectionClass}><div className={ui.textSubtle}>Ümumi</div><div className="text-xl font-semibold">{toNum(total)}</div></div>
              </div>
              <section className={sectionClass}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold">Barkod / partiya üzrə qalıqlar</div>
                  <div className={cx("text-xs", ui.textSubtle)}>Eyni məhsulun fərqli alış və satış qiymətləri burada ayrılır</div>
                </div>
                <SimpleTable
                  headers={["Barkod", "Variant", "Anbar", "Alış", "Satış", "Qalıq", "Maya dəyəri"]}
                  rows={barcodeRows}
                  isDark={isDark}
                />
              </section>
              <div className={sectionClass}>
                <div className="mb-3 text-sm font-semibold">Anbar hərəkəti</div>
                <div className="grid gap-3 md:grid-cols-5">
                  <select className={inputClass} value={movement.type} onChange={(e) => setMovement((v) => ({ ...v, type: e.target.value as StockMovement["type"] }))}>
                    <option value="purchase">Alış</option>
                    <option value="sale">Satış</option>
                    <option value="return">Geri qaytarma</option>
                    <option value="adjustment">Düzəliş</option>
                    <option value="transfer">Transfer</option>
                  </select>
                  {movement.type === "transfer" ? (
                    <>
                      <select className={inputClass} value={movement.from} onChange={(e) => setMovement((v) => ({ ...v, from: e.target.value as "antrepo" | "depo" }))}><option value="antrepo">Antrepo</option><option value="depo">Depo</option></select>
                      <select className={inputClass} value={movement.to} onChange={(e) => setMovement((v) => ({ ...v, to: e.target.value as "antrepo" | "depo" }))}><option value="depo">Depo</option><option value="antrepo">Antrepo</option></select>
                    </>
                  ) : (
                    <select className={inputClass} value={movement.place} onChange={(e) => setMovement((v) => ({ ...v, place: e.target.value as "antrepo" | "depo" }))}><option value="antrepo">Antrepo</option><option value="depo">Depo</option></select>
                  )}
                  <input className={inputClass} value={movement.qty} onChange={(e) => setMovement((v) => ({ ...v, qty: e.target.value }))} placeholder="Miqdar" />
                  <input className={inputClass} value={movement.note} onChange={(e) => setMovement((v) => ({ ...v, note: e.target.value }))} placeholder="Qeyd" />
                  <button
                    type="button"
                    className="surface-primary h-9 rounded-lg px-3 text-sm"
                    onClick={() => {
                      const qty = parseOptionalNumber(movement.qty) ?? 0;
                      if (qty <= 0) return;
                      onMovement({ ...movement, qty });
                      setMovement((v) => ({ ...v, qty: "", note: "" }));
                    }}
                  >
                    Tətbiq et
                  </button>
                </div>
              </div>
              <HistoryList audit={[]} movements={movements} isDark={isDark} />
            </div>
          )}

          {tab === "containers" && stockMode === "bondedRolls" && (
            <div className="space-y-4">
              <section className={sectionClass}>
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className={cx("text-[15px] font-semibold", isDark ? "text-slate-100" : "text-slate-900")}>Konteyner və paletlər</div>
                    <p className={cx("text-sm", ui.textSubtle)}>Alış zamanı yaradılan konteynerlər burada genişlənir, içindəki palet və rulo balansı görünür.</p>
                  </div>
                  <span className={cx("rounded-full px-3 py-1 text-xs", isDark ? "bg-indigo-400/15 text-indigo-100" : "bg-indigo-50 text-indigo-700")}>Rezerv öncəliklidir</span>
                </div>
                <SimpleTable
                  headers={["Anbar", "Partiya", "Mövqe", "Bağlı rulo", "Açıq rulo", "Rezerv", "Mövcud"]}
                  rows={bondedContainerRows}
                  isDark={isDark}
                />
              </section>
            </div>
          )}

          {tab === "rolls" && stockMode === "bondedRolls" && (
            <div className="space-y-4">
              <section className={sectionClass}>
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <div className={cx("text-[15px] font-semibold", isDark ? "text-slate-100" : "text-slate-900")}>Rulo pasportu</div>
                    <p className={cx("text-sm", ui.textSubtle)}>Tam rulo və metrlə açılmış rulo eyni barkod xəttində izlənir.</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(["Hamısı", "Bağlı", "Açıq", "Rezervdə"] as const).map((label, idx) => (
                      <span key={label} className={cx("rounded-full px-3 py-1 text-xs font-semibold", idx === 0 ? "bg-indigo-600 text-white" : isDark ? "bg-white/10 text-slate-200" : "bg-white text-slate-600")}>{label}</span>
                    ))}
                  </div>
                </div>
                <div className="mb-4 grid gap-3 lg:grid-cols-3">
                  <div className={mutedPanelClass}>
                    <div className={cx("text-[12px] font-semibold", ui.textSubtle)}>Barkod oxutma</div>
                    <div className="mt-2 flex items-center gap-2">
                      <I.Search className={cx("h-4 w-4", ui.textSubtle)} />
                      <span className={cx("text-sm", ui.textSubtle)}>Rulo barkodu oxudulduqda pasport açılacaq</span>
                    </div>
                  </div>
                  <div className={mutedPanelClass}>
                    <div className={cx("text-[12px] font-semibold", ui.textSubtle)}>Açıq rulo qaydası</div>
                    <div className="mt-2 text-sm font-semibold">{traceOpenRollCount > 0 ? `${traceOpenRollCount} açıq rulo izlənir` : "Açıq rulo yoxdur"}</div>
                  </div>
                  <div className={mutedPanelClass}>
                    <div className={cx("text-[12px] font-semibold", ui.textSubtle)}>Rezerv qoruması</div>
                    <div className="mt-2 text-sm font-semibold">{traceReserved > 0 ? `${toNum(traceReserved)} mt sənədə bağlanıb` : "Sərbəst stok"}</div>
                  </div>
                </div>
                <SimpleTable
                  headers={["Barkod", "Konteyner", "Palet", "Rulo", "Anbar", "Yer", "Qalıq", "Kg", "Status"]}
                  rows={bondedRollRows}
                  isDark={isDark}
                />
                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  {traceRolls.slice(0, 6).map((roll) => (
                    <div key={roll.barcode} className={cx("rounded-xl border p-3", isDark ? "border-white/10 bg-slate-950/20" : "border-slate-200/75 bg-white/80")}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className={cx("truncate text-sm font-semibold", isDark ? "text-slate-100" : "text-slate-900")}>{roll.roll} · {roll.productName}</div>
                          <div className={cx("mt-1 truncate text-xs", ui.textSubtle)}>{roll.barcode}</div>
                        </div>
                        <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", traceStatusClass(roll.status, isDark))}>{roll.status}</span>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                        <div><div className={ui.textSubtle}>Partiya</div><div className="font-semibold">{roll.container}</div></div>
                        <div><div className={ui.textSubtle}>Palet</div><div className="font-semibold">{roll.pallet}</div></div>
                        <div><div className={ui.textSubtle}>Lokasiya</div><div className="font-semibold">{roll.location}</div></div>
                      </div>
                      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(8, Math.min(100, (roll.remainingMt / roll.initialMt) * 100))}%` }} />
                      </div>
                      <div className={cx("mt-2 text-xs", ui.textSubtle)}>{roll.lastAction} · {toNum(roll.remainingMt)} mt</div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {tab === "variants" && (
            <div className="space-y-3">
              <div className={sectionClass}>
                <div className="mb-3 text-sm font-semibold">Variant və qiymət partiyası</div>
                <div className="grid gap-3 md:grid-cols-4 xl:grid-cols-8">
                  <input className={cx(inputClass, "md:col-span-2")} value={variantForm.name} onChange={(e) => setVariantForm((v) => ({ ...v, name: e.target.value }))} placeholder="Variant adı" />
                  <input className={inputClass} value={variantForm.barcode} onChange={(e) => setVariantForm((v) => ({ ...v, barcode: e.target.value }))} placeholder="Barkod" />
                  <input className={inputClass} value={variantForm.antrepo} onChange={(e) => setVariantForm((v) => ({ ...v, antrepo: e.target.value }))} placeholder="Antrepo" />
                  <input className={inputClass} value={variantForm.depo} onChange={(e) => setVariantForm((v) => ({ ...v, depo: e.target.value }))} placeholder="Depo" />
                  <input className={inputClass} value={variantForm.purchase} onChange={(e) => setVariantForm((v) => ({ ...v, purchase: e.target.value }))} placeholder="Alış" />
                  <input className={inputClass} value={variantForm.cost} onChange={(e) => setVariantForm((v) => ({ ...v, cost: e.target.value }))} placeholder="Maya" />
                  <input className={inputClass} value={variantForm.sale} onChange={(e) => setVariantForm((v) => ({ ...v, sale: e.target.value }))} placeholder="Satış" />
                  <button type="button" className="surface-primary h-9 rounded-lg px-3 text-sm" onClick={() => {
                    if (!variantForm.name.trim()) return;
                    onAddVariant({
                      name: variantForm.name.trim(),
                      barcode: variantForm.barcode || undefined,
                      antrepo: parseOptionalNumber(variantForm.antrepo) ?? 0,
                      depo: parseOptionalNumber(variantForm.depo) ?? 0,
                      purchase_price: parseOptionalNumber(variantForm.purchase),
                      cost: parseOptionalNumber(variantForm.cost),
                      sale_price: parseOptionalNumber(variantForm.sale),
                    });
                    setVariantForm({ name: "", barcode: "", antrepo: "", depo: "", purchase: "", cost: "", sale: "" });
                  }}>Əlavə et</button>
                </div>
              </div>
              <SimpleTable
                rows={variants.map((v) => [v.name, v.barcode ?? "—", toCurrency(v.purchase_price), toCurrency(v.cost), toCurrency(v.sale_price), toNum(v.antrepo), toNum(v.depo)])}
                headers={["Variant", "Barkod", "Alış", "Maya", "Satış", "Antrepo", "Depo"]}
                isDark={isDark}
              />
            </div>
          )}

          {tab === "bundle" && (
            <div className="space-y-3">
              {product.type !== "bundle" && <div className={cx("rounded-xl px-3 py-2 text-sm", isDark ? "bg-white/10" : "bg-slate-100")}>Dəst tərkibi əsasən “Dəst” tipli kartlarda istifadə olunur.</div>}
              <div className={sectionClass}>
                <div className="grid gap-3 md:grid-cols-[1fr_120px_110px]">
                  <select className={inputClass} value={bundleForm.productId} onChange={(e) => setBundleForm((v) => ({ ...v, productId: e.target.value }))}>
                    <option value="">Məhsul seçin</option>
                    {products.filter((row) => row.id !== product.id).map((row) => <option key={row.id} value={String(row.id)}>{row.ad}</option>)}
                  </select>
                  <input className={inputClass} value={bundleForm.qty} onChange={(e) => setBundleForm((v) => ({ ...v, qty: e.target.value }))} placeholder="Say" />
                  <button type="button" className="surface-primary h-9 rounded-lg px-3 text-sm" onClick={() => {
                    onAddBundleItem(Number(bundleForm.productId), parseOptionalNumber(bundleForm.qty) ?? 1);
                    setBundleForm({ productId: "", qty: "1" });
                  }}>Əlavə et</button>
                </div>
              </div>
              <div className={cx("rounded-xl border p-3 text-sm", ui.borderSoft)}>
                <div className="mb-2 flex justify-between"><span className="font-medium">Tərkib</span><span>{toCurrency(bundleTotal)}</span></div>
                <div className="space-y-2">
                  {bundleItems.map((item) => {
                    const found = products.find((row) => row.id === item.productId);
                    return (
                      <div key={item.id} className={cx("flex items-center justify-between rounded-lg px-2 py-2", isDark ? "bg-white/5" : "bg-slate-50")}>
                        <span>{found?.ad ?? "Silinmiş məhsul"} · {item.qty}</span>
                        <button type="button" className="text-xs text-red-600" onClick={() => onRemoveBundleItem(item.id)}>Sil</button>
                      </div>
                    );
                  })}
                  {bundleItems.length === 0 && <div className={ui.textSubtle}>Dəstə məhsul əlavə edilməyib.</div>}
                </div>
              </div>
            </div>
          )}

          {tab === "inventory" && (
            <div className="space-y-4">
              <section className={sectionClass}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className={cx("text-[15px] font-semibold", isDark ? "text-slate-100" : "text-slate-900")}>Inventory history</div>
                  <div className={cx("text-xs", ui.textSubtle)}>Alış, satış, transfer və düzəliş hərəkətləri</div>
                </div>
                <SimpleTable
                  headers={["Tarix", "Əməliyyat", "Miqdar", "Anbar", "Qeyd"]}
                  rows={inventoryHistoryRows}
                  isDark={isDark}
                />
              </section>
              <section className={sectionClass}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className={cx("text-[15px] font-semibold", isDark ? "text-slate-100" : "text-slate-900")}>Cari barkod qalıqları</div>
                  <div className={cx("text-xs", ui.textSubtle)}>Tarixçə ilə yanaşı cari partiya vəziyyəti</div>
                </div>
                <SimpleTable
                  headers={["Barkod", "Variant", "Anbar", "Alış", "Satış", "Qalıq", "Maya dəyəri"]}
                  rows={barcodeRows}
                  isDark={isDark}
                />
              </section>
            </div>
          )}

          {tab === "history" && <HistoryList audit={audit} movements={movements} isDark={isDark} />}
        </div>
      </div>
    </div>
  );
}

function HistoryList({ audit, movements, isDark }: { audit: AuditEntry[]; movements: StockMovement[]; isDark: boolean }) {
  const ui = makeUI(isDark);
  const items = [
    ...audit.map((entry) => ({ id: `a-${entry.id}`, title: entry.action, detail: entry.detail, at: entry.at })),
    ...movements.map((movement) => ({ id: `m-${movement.id}`, title: "Anbar hərəkəti", detail: `${movement.type} · ${movement.qty}`, at: movement.at })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className={cx("rounded-xl border p-3", ui.borderSoft)}>
      <div className="mb-2 text-sm font-semibold">Tarixçə</div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className={cx("rounded-lg px-3 py-2 text-sm", isDark ? "bg-white/5" : "bg-slate-50")}>
            <div className="flex justify-between gap-3">
              <span className="font-medium">{item.title}</span>
              <span className={cx("text-xs", ui.textSubtle)}>{new Date(item.at).toLocaleString("az-Latn-AZ")}</span>
            </div>
            <div className={cx("text-xs", ui.textSubtle)}>{item.detail}</div>
          </div>
        ))}
        {items.length === 0 && <div className={cx("text-sm", ui.textSubtle)}>Hələ tarixçə yoxdur.</div>}
      </div>
    </div>
  );
}

function SimpleTable({ headers, rows, isDark }: { headers: string[]; rows: string[][]; isDark: boolean }) {
  return (
    <div className={cx("overflow-x-auto rounded-xl border", isDark ? "border-white/10 bg-slate-950/10" : "border-slate-200/80 bg-white/70")}>
      <table className="min-w-full whitespace-nowrap text-sm">
        <thead className={isDark ? "bg-white/5 text-slate-200" : "bg-slate-100/80 text-slate-700"}>
          <tr>{headers.map((header) => <th key={header} className="px-3 py-2 text-left text-[13px] font-semibold">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => (
            <tr key={idx} className={isDark ? "border-t border-white/10 text-slate-100" : "border-t border-slate-200/70 text-slate-700"}>
              {row.map((cell, cidx) => <td key={cidx} className="px-3 py-2.5 text-[13px]">{cell}</td>)}
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={headers.length} className={cx("px-3 py-4 text-center", isDark ? "text-slate-400" : "text-slate-500")}>Məlumat yoxdur.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function BulkMovePanel({
  visible,
  groups,
  selectedCount,
  isDark,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  groups: Group[];
  selectedCount: number;
  isDark: boolean;
  onClose: () => void;
  onSubmit: (groupId: number | null) => void;
}) {
  const ui = makeUI(isDark);
  const [groupId, setGroupId] = useState("");
  if (!visible) return null;
  return (
    <div className={cx("fixed inset-0 z-50 flex items-center justify-center px-4", isDark ? "bg-slate-950/55" : "bg-slate-900/25")} onClick={onClose}>
      <div className={cx("w-full max-w-sm p-4", ui.card, ui.ring)} onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold">Qovluğa daşı</h3>
        <p className={cx("mt-1 text-xs", ui.textSubtle)}>{selectedCount} məhsul seçilib.</p>
        <select value={groupId} onChange={(e) => setGroupId(e.target.value)} className={cx("mt-4 h-10 w-full rounded-lg border px-3 text-sm", isDark ? "bg-slate-900 border-white/10" : "bg-white border-slate-200")}>
          <option value="">Qovluqsuz</option>
          {groups.map((group) => <option key={group.id} value={String(group.id)}>{group.name}</option>)}
        </select>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className={cx("h-9 rounded-lg border px-3 text-sm", ui.borderSoft)} onClick={onClose}>İmtina</button>
          <button type="button" className="surface-primary h-9 rounded-lg px-3 text-sm" onClick={() => onSubmit(groupId ? Number(groupId) : null)}>Daşı</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ filter panel ------------------------------ */
function FilterPanel({
  filters, setFilters, categories, nav, searchSet, setSearchSet,
  presetsOpen, setPresetsOpen, selectedPreset, applyPreset, clearFilters,
  visibleFilterSections, setVisibleFilterSections,
  onClose, isDark
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  categories: Category[];
  nav: NavSettings;
  searchSet: SearchSettings;
  setSearchSet: React.Dispatch<React.SetStateAction<SearchSettings>>;
  presetsOpen: boolean;
  setPresetsOpen: React.Dispatch<React.SetStateAction<boolean>>;
  selectedPreset: string;
  applyPreset: (presetId: string) => void;
  clearFilters: () => void;
  visibleFilterSections: FilterSection[];
  setVisibleFilterSections: React.Dispatch<React.SetStateAction<FilterSection[]>>;
  onClose: () => void;
  isDark: boolean;
}) {
  const ui = makeUI(isDark);
  const panelText = isDark ? "text-slate-100" : "text-slate-900";
  const sectionTitle = cx("text-base font-medium", isDark ? "text-slate-100" : "text-slate-900");
  const selectClass = cx(
    "h-9 rounded-lg border px-3 text-sm outline-none",
    isDark ? "bg-slate-900 border-white/10 text-slate-100" : "bg-white border-slate-200 text-slate-900"
  );
  const inputLineClass = cx(
    "h-9 min-w-0 border-0 border-b rounded-none bg-transparent px-2 text-sm outline-none",
    isDark ? "border-slate-600 text-slate-100" : "border-slate-300 text-slate-900"
  );
  const conditionCardClass = cx("rounded-xl border p-3", ui.borderSoft, isDark ? "bg-slate-900/35" : "bg-slate-50/70");
  const stockRows = filters.stock && filters.stock.length > 0
    ? filters.stock
    : [{ place: "total" as StockPlace, op: "gt" as StockOp, qty: Number.NaN }];
  const availableSections = FILTER_SECTION_OPTIONS.filter((section) => !visibleFilterSections.includes(section.id));

  const addSection = (section: FilterSection) => {
    setVisibleFilterSections((prev) => prev.includes(section) ? prev : [...prev, section]);
    if (section === "price") setFilters((f) => ({ ...f, price: f.price ?? { level: "esas" } }));
    if (section === "expiration") setFilters((f) => ({ ...f, expiration: f.expiration ?? { mode: "expire_in" } }));
    if (section === "changes") setFilters((f) => ({ ...f, changes: f.changes ?? { mode: "changed_over", unit: "days" } }));
    if (section === "marketability") setFilters((f) => ({ ...f, marketability: f.marketability ?? { mode: "sold_during", unit: "days" } }));
  };

  const removeSection = (section: FilterSection) => {
    setVisibleFilterSections((prev) => prev.filter((item) => item !== section));
    setFilters((f) => {
      if (section === "price") return { ...f, price: { level: "esas" } };
      if (section === "stock") return { ...f, stock: [] };
      if (section === "expiration") return { ...f, expiration: { mode: "expire_in" } };
      if (section === "changes") return { ...f, changes: { mode: "changed_over", unit: "days" } };
      return { ...f, marketability: { mode: "sold_during", unit: "days" } };
    });
  };

  const updatePrice = (patch: Partial<NonNullable<Filters["price"]>>) => {
    setFilters((f) => ({ ...f, price: { ...f.price, level: f.price?.level ?? "esas", ...patch } }));
  };
  const updateStockRow = (idx: number, patch: Partial<{ place: StockPlace; op: StockOp; qty: number }>) => {
    setFilters((f) => {
      const arr = f.stock && f.stock.length > 0 ? [...f.stock] : [{ place: "total" as StockPlace, op: "gt" as StockOp, qty: Number.NaN }];
      arr[idx] = { ...arr[idx], ...patch };
      return { ...f, stock: arr };
    });
  };
  const updateExpiration = (patch: Partial<NonNullable<Filters["expiration"]>>) => {
    setFilters((f) => ({ ...f, expiration: { mode: f.expiration?.mode ?? "expire_in", ...patch } }));
  };
  const updateChanges = (patch: Partial<NonNullable<Filters["changes"]>>) => {
    setFilters((f) => ({ ...f, changes: { mode: f.changes?.mode ?? "changed_over", unit: f.changes?.unit ?? "days", ...patch } }));
  };
  const updateMarketability = (patch: Partial<NonNullable<Filters["marketability"]>>) => {
    setFilters((f) => ({ ...f, marketability: { mode: f.marketability?.mode ?? "sold_during", unit: f.marketability?.unit ?? "days", ...patch } }));
  };

  const ConditionCard = ({ id, title, children }: { id: FilterSection; title: string; children: React.ReactNode }) => (
    <div className={conditionCardClass}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className={sectionTitle}>{title}</div>
        <button
          type="button"
          onClick={() => removeSection(id)}
          className={cx("rounded-lg px-2 py-1 text-xs", isDark ? "text-slate-300 hover:bg-white/10" : "text-slate-500 hover:bg-white")}
        >
          Sil
        </button>
      </div>
      {children}
    </div>
  );

  return (
    <div className={cx("surface-popover absolute z-50 mt-2 w-[560px] max-w-[92vw] overflow-hidden rounded-xl shadow-lg", ui.card, ui.ring, panelText)}>
      <div className="max-h-[calc(100vh-150px)] overflow-auto p-3 pr-4">
        <div className="relative mb-4">
          <div className={sectionTitle}>Filtr yaddaşı</div>
          <button
            type="button"
            onClick={() => setPresetsOpen((v) => !v)}
            className={cx("mt-2 flex h-10 w-full items-center justify-between rounded-lg border px-3 text-sm", isDark ? "bg-slate-900 border-white/10" : "bg-white border-slate-300")}
          >
            <span>{selectedPreset ? SYSTEM_FILTER_PRESETS.find((p) => p.id === selectedPreset)?.label : "Seçin"}</span>
            <span className={ui.textSubtle}>▾</span>
          </button>
          {presetsOpen && (
            <div className={cx("absolute left-0 right-0 top-[70px] z-20 rounded-lg border p-2 shadow-lg", isDark ? "bg-slate-900 border-white/10" : "bg-white border-slate-200")}>
              {SYSTEM_FILTER_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id)}
                  className={cx("flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm", isDark ? "hover:bg-white/5" : "hover:bg-slate-50")}
                >
                  <span>{preset.label}</span>
                  <span className="rounded-md bg-sky-600 px-2 py-0.5 text-xs font-medium text-white">Sistem</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mb-4">
          <div className={cx(sectionTitle, "mb-2")}>Şərt filtri</div>
          <select
            value=""
            onChange={(e) => {
              if (!e.target.value) return;
              addSection(e.target.value as FilterSection);
            }}
            className={cx(selectClass, "w-full")}
            disabled={availableSections.length === 0}
          >
            <option value="">{availableSections.length ? "Şərt seçin" : "Bütün şərtlər əlavə olunub"}</option>
            {availableSections.map((section) => (
              <option key={section.id} value={section.id}>{section.label}</option>
            ))}
          </select>
          {visibleFilterSections.length === 0 && (
            <p className={cx("mt-2 text-xs", ui.textSubtle)}>
              Qiymət, qalıq, tarix və satış şərtləri seçildikcə aşağıda açılacaq.
            </p>
          )}
        </div>

        {nav.foldersEnabled && (
          <div className="mb-4">
            <div className={cx("text-xs mb-1", ui.textSubtle)}>Axtarış əhatəsi</div>
            <div className={cx("inline-flex h-10 rounded-xl border p-1 text-sm", ui.borderSoft, isDark ? "bg-slate-800" : "bg-slate-50")}>
              {(["current", "all"] as SearchScope[]).map((scope) => (
                <button
                  key={scope}
                  type="button"
                  aria-pressed={searchSet.scope === scope}
                  onClick={() => setSearchSet({ scope })}
                  className={cx(
                    "rounded-lg px-3 transition",
                    searchSet.scope === scope
                      ? (isDark ? "bg-slate-700 text-slate-100" : "bg-white text-slate-900 shadow-sm")
                      : (isDark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700")
                  )}
                >
                  {scope === "current" ? "Cari qovluq" : "Hamısı"}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={cx("mb-5 grid grid-cols-3 overflow-hidden rounded-lg border", ui.borderSoft)}>
          {(["product","service","bundle"] as ProductType[]).map((type) => (
            <label key={type} className={cx("flex h-12 items-center justify-center gap-2 border-r last:border-r-0", ui.borderSoft)}>
              <input
                type="checkbox"
                checked={filters.types[type]}
                onChange={(e) => setFilters((f)=>({ ...f, types: { ...f.types, [type]: e.target.checked } }))}
              />
              <span className="text-sm">{type === "product" ? "Məhsul" : type === "service" ? "Xidmət" : "Dəst"}</span>
            </label>
          ))}
        </div>

        <div className="mb-4">
          <div className={cx(sectionTitle, "mb-2")}>Kateqoriyalar</div>
          <select
            value={filters.category ?? ""}
            onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value || null }))}
            className={cx(selectClass, "w-full")}
          >
            <option value="">Kateqoriya seçin</option>
            {categories.map((g) => (
              <option key={g.id} value={String(g.id)}>{g.name}</option>
            ))}
          </select>
        </div>

        {visibleFilterSections.length > 0 && (
          <div className="mb-5 space-y-3">
            {visibleFilterSections.includes("price") && (
              <ConditionCard id="price" title="Qiymət">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_minmax(90px,1fr)]">
                  <select value={filters.price?.level ?? "esas"} onChange={(e)=>updatePrice({ level: e.target.value as PriceLevel })} className={selectClass}>
                    <option value="esas">əsas</option>
                    <option value="topdan">topdan</option>
                    <option value="perakende">pərakəndə</option>
                  </select>
                  <select value={filters.price?.op ?? "gt"} onChange={(e)=>updatePrice({ op: e.target.value as StockOp })} className={selectClass}>
                    <option value="gt">daha çox</option>
                    <option value="lt">daha az</option>
                    <option value="eq">bərabər</option>
                  </select>
                  <input
                    type="number"
                    placeholder="məbləğ"
                    value={filters.price?.qty ?? ""}
                    onChange={(e)=>updatePrice({ qty: e.target.value ? Number(e.target.value) : undefined, min: undefined, max: undefined })}
                    className={inputLineClass}
                  />
                </div>
              </ConditionCard>
            )}

            {visibleFilterSections.includes("stock") && (
              <ConditionCard id="stock" title="Qalıqlar">
                <div className="space-y-2">
                  {stockRows.map((stock, idx) => (
                    <div key={idx} className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_minmax(90px,1fr)_40px]">
                      <select value={stock.place} onChange={(e)=>updateStockRow(idx, { place: e.target.value as StockPlace })} className={selectClass}>
                        <option value="total">ümumi</option>
                        <option value="antrepo">ERSA ANTREPO</option>
                        <option value="depo">ERSA DEPO</option>
                      </select>
                      <select value={stock.op} onChange={(e)=>updateStockRow(idx, { op: e.target.value as StockOp })} className={selectClass}>
                        <option value="gt">daha çox</option>
                        <option value="lt">daha az</option>
                        <option value="eq">bərabər</option>
                      </select>
                      <input type="number" placeholder="miqdar" value={Number.isFinite(stock.qty) ? stock.qty : ""} onChange={(e)=>updateStockRow(idx, { qty: e.target.value ? Number(e.target.value) : Number.NaN })} className={inputLineClass} />
                      <button type="button" title="Qalıq şərti əlavə et" onClick={()=>setFilters((f)=>({ ...f, stock: [...(f.stock ?? []), { place: "total", op: "gt", qty: Number.NaN }] }))} className={cx("h-9 rounded-lg border text-xl font-semibold", ui.borderSoft)}>+</button>
                    </div>
                  ))}
                </div>
              </ConditionCard>
            )}

            {visibleFilterSections.includes("expiration") && (
              <ConditionCard id="expiration" title="İstifadə müddəti">
                <div className="grid grid-cols-1 items-center gap-3 sm:grid-cols-[1fr_minmax(90px,1fr)_50px]">
                  <select value={filters.expiration?.mode ?? "expire_in"} onChange={(e)=>updateExpiration({ mode: e.target.value as NonNullable<Filters["expiration"]>["mode"] })} className={selectClass}>
                    <option value="expire_in">müddət ərzində sona çatır</option>
                    <option value="expired">müddəti bitib</option>
                  </select>
                  <input type="number" placeholder="müddət" value={filters.expiration?.days ?? ""} onChange={(e)=>updateExpiration({ days: e.target.value ? Number(e.target.value) : undefined })} className={inputLineClass} />
                  <span className="text-sm">gün</span>
                </div>
              </ConditionCard>
            )}

            {visibleFilterSections.includes("changes") && (
              <ConditionCard id="changes" title="Məhsul dəyişiklikləri">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_minmax(90px,1fr)_90px]">
                  <select value={filters.changes?.mode ?? "changed_over"} onChange={(e)=>updateChanges({ mode: e.target.value as NonNullable<Filters["changes"]>["mode"] })} className={selectClass}>
                    <option value="changed_over">müddət ərzində dəyişilib</option>
                    <option value="not_changed">müddət ərzində dəyişməyib</option>
                  </select>
                  <input type="number" placeholder="müddət" value={filters.changes?.amount ?? ""} onChange={(e)=>updateChanges({ amount: e.target.value ? Number(e.target.value) : undefined })} className={inputLineClass} />
                  <select value={filters.changes?.unit ?? "days"} onChange={(e)=>updateChanges({ unit: e.target.value as TimeUnit })} className={selectClass}>
                    <option value="days">gün</option>
                    <option value="months">ay</option>
                  </select>
                </div>
              </ConditionCard>
            )}

            {visibleFilterSections.includes("marketability") && (
              <ConditionCard id="marketability" title="Satış">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_minmax(90px,1fr)_90px]">
                  <select value={filters.marketability?.mode ?? "sold_during"} onChange={(e)=>updateMarketability({ mode: e.target.value as NonNullable<Filters["marketability"]>["mode"] })} className={selectClass}>
                    <option value="sold_during">ərzində satıldı</option>
                    <option value="not_sold">ərzində satılmadı</option>
                  </select>
                  <input type="number" placeholder="müddət" value={filters.marketability?.amount ?? ""} onChange={(e)=>updateMarketability({ amount: e.target.value ? Number(e.target.value) : undefined })} className={inputLineClass} />
                  <select value={filters.marketability?.unit ?? "days"} onChange={(e)=>updateMarketability({ unit: e.target.value as TimeUnit })} className={selectClass}>
                    <option value="days">gün</option>
                    <option value="months">ay</option>
                  </select>
                </div>
              </ConditionCard>
            )}
          </div>
        )}

        <div className={cx("sticky bottom-0 -mx-3 -mb-3 mt-2 flex items-center justify-between gap-3 border-t px-3 py-3", ui.borderSoft, isDark ? "bg-slate-800" : "bg-white")}>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="h-10 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700">Tətbiq et</button>
            <button type="button" onClick={clearFilters} className={cx("h-10 rounded-lg border px-4 text-sm", ui.borderSoft, isDark ? "hover:bg-white/5" : "hover:bg-slate-50")}>Sıfırla</button>
          </div>
          <button type="button" onClick={() => setPresetsOpen(false)} className="h-10 rounded-lg border border-emerald-500 px-4 text-sm font-medium text-emerald-600 hover:bg-emerald-50">
            Əvvəlcədən saxla
          </button>
        </div>
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
    <div role="menu" className={cx("surface-popover absolute right-0 z-50 mt-2 w-72 overflow-hidden p-2", ui.card, ui.ring)}>
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
  cols, setCols, storeCols, setStoreCols, view, setView, nav, setNav, setSearchSet,
  onResetAll, onResetCols, onResetWidths, folderSummaryMode, isDark, stores
}: {
  cols: ColSettings; setCols: React.Dispatch<React.SetStateAction<ColSettings>>;
  storeCols: Record<string, boolean>; setStoreCols: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  view: ViewSettings; setView: React.Dispatch<React.SetStateAction<ViewSettings>>;
  nav: NavSettings; setNav: React.Dispatch<React.SetStateAction<NavSettings>>;
  setSearchSet: React.Dispatch<React.SetStateAction<SearchSettings>>;
  onResetAll: () => void; onResetCols: () => void; onResetWidths: () => void;
  folderSummaryMode: boolean;
  isDark: boolean;
  stores: CompanyStore[];
}) {
  const ui = makeUI(isDark);
  const columnDisabled = (id: ColId) => folderSummaryMode && FOLDER_SUMMARY_DISABLED_COLS.has(id);
  const columnLabel = (id: ColId) =>
    id==="foto"?"Foto":id==="kod"?"Kod":id==="taxes"?"Vergilər":id==="barcode"?"Bar-kod":
    id==="artikel"?"SKU / Artikul":id==="vahid"?"Ölçü vahidi":id==="plu"?"PLU kod":
    id==="expiration"?"İstifadə müddəti":id==="category"?"Kateqoriya":id==="country"?"Ölkə":
    id==="supplier"?"Təchizatçı":id==="sale_price"?"Satış qiyməti":id==="cost"?"Maya dəyəri":
    id==="purchase_price"?"Alışın qiyməti":id==="created"?"Yaradıldı":id==="discount"?"Endirim":
    "Minimal qalıq";
  const toggleCol = (id: ColId) => {
    if (columnDisabled(id)) return;
    setCols((c)=>({ ...c, [id]: !c[id] }));
  };
  const setAllCols = (v: boolean) => {
    const next: ColSettings = { ...cols };
    COLUMN_IDS.forEach((k)=>{ if (!columnDisabled(k)) next[k]=v; });
    setCols(next);
    setStoreCols(Object.fromEntries(stores.map((store) => [store.key, v])));
  };
  const setStandardCols = () => {
    setStoreCols({});
    setCols((current) => {
      const next: ColSettings = { ...current };
      COLUMN_IDS.forEach((k)=>{ if (!columnDisabled(k)) next[k]=DEFAULT_COLS[k]; });
      return next;
    });
  };
  const setFoldersEnabled = (enabled: boolean) => {
    setNav((v)=>({ ...v, foldersEnabled: enabled }));
    if (enabled) setSearchSet({ scope: "current" });
  };

  return (
    <div className={cx("surface-popover absolute right-0 z-50 mt-2 w-[360px] overflow-hidden", ui.card, ui.ring)} role="menu">
      <div className={cx("px-4 py-3 text-xs font-semibold flex items-center gap-2", isDark ? "text-slate-200" : "text-slate-700") }>
        <I.Sliders className="h-4 w-4" /> CƏDVƏL PARAMETRLƏRİ
      </div>

      {/* Sütunlar */}
      <div className="px-3 pb-2 space-y-2">
        <div className={cx("text-xs mb-1", ui.textSubtle)}>Sütunlar</div>
        {folderSummaryMode && (
          <div className={cx("rounded-lg px-2.5 py-2 text-xs", isDark ? "bg-white/5 text-slate-400" : "bg-slate-50 text-slate-500")}>
            Qovluq xülasəsində məhsul detalları deaktivdir.
          </div>
        )}
        <div className={cx("max-h-[180px] overflow-y-auto pr-1", isDark ? "scrollbar-dark" : "scrollbar-light")}>
          <div className="space-y-0.5">
            {COLUMN_IDS.map((id)=> {
              const disabled = columnDisabled(id);
              return (
                <label key={id} className={cx("flex min-h-6 items-center gap-2 text-sm leading-5", disabled && "cursor-not-allowed opacity-40")}>
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 shrink-0"
                    checked={cols[id]}
                    disabled={disabled}
                    onChange={()=>toggleCol(id)}
                  />
                  <span>{columnLabel(id)}</span>
                </label>
              );
            })}
            {stores.map((store) => (
              <label key={store.id} className="flex min-h-6 items-center gap-2 text-sm leading-5">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 shrink-0"
                  checked={storeCols[store.key] !== false}
                  onChange={() => setStoreCols((current) => ({ ...current, [store.key]: current[store.key] === false }))}
                />
                <span>{store.name}</span>
              </label>
            ))}
          </div>
        </div>
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
          <input type="checkbox" checked={nav.foldersEnabled} onChange={(e)=>setFoldersEnabled(e.target.checked)} />
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

      {/* footer */}
      <div className="grid grid-cols-2 gap-2 px-3 py-3">
        <button onClick={onResetAll} className={cx("h-9 rounded-lg border px-3 text-sm", ui.borderSoft, isDark ? "hover:bg-white/5" : "hover:bg-slate-100")}>Defolta qaytar</button>
        <button onClick={onResetCols} className={cx("h-9 rounded-lg border px-3 text-sm", ui.borderSoft, isDark ? "hover:bg-white/5" : "hover:bg-slate-100")}>Sütunları sıfırla</button>
        <button onClick={onResetWidths} className={cx("col-span-2 h-9 rounded-lg border px-3 text-sm", ui.borderSoft, isDark ? "hover:bg-white/5" : "hover:bg-slate-100")}>Sütun ölçülərini sıfırla</button>
      </div>
    </div>
  );
}
