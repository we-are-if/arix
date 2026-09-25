import { useEffect, useMemo, useRef, useState, type PointerEvent, type SVGProps } from "react";
import { requestJson } from "../api";

const cx = (...s: (string | false | undefined)[]) => s.filter(Boolean).join(" ");

export type DocumentCreateKind =
  | "sale"
  | "purchase"
  | "saleReturn"
  | "purchaseReturn"
  | "inventory"
  | "openingBalance"
  | "writeOff"
  | "movement"
  | "cashIn"
  | "cashOut"
  | "cashTransfer";

type ProductLine = {
  id: number;
  name: string;
  code: string;
  sku: string;
  unit: string;
  variant: string;
  stock: number;
  price: number;
  standardPrice?: number;
  priceSource?: string;
  priceStore?: string;
  qty?: number;
  discount?: number;
  movementMode?: MovementSelectionMode;
  warehouses?: {
    antrepo: number;
    depo: number;
  };
};

type ApiProduct = {
  id: number;
  name: string;
  code: string;
  sku: string;
  type: string;
  unit: string;
  salePrice?: number;
  purchasePrice?: number;
  cost?: number;
  storePrices?: Record<string, number>;
  warehouses?: {
    antrepo?: number;
    depo?: number;
  };
};

type ApiCounterparty = {
  id: number;
  name: string;
  kind: "customer" | "supplier";
};

type ResolvedPrice = {
  productId: number;
  standardPrice: number;
  customerPrice: number | null;
  effectivePrice: number;
  source: "customer" | "store";
  store: string;
};

export type ApiDocumentDraft = {
  id?: string | number;
  type?: string;
  status?: string;
  posted?: boolean;
  workflowStatus?: DocumentWorkflowStatus;
  documentDate?: string;
  createdAt?: string;
  account?: string;
  fromAccount?: string;
  toAccount?: string;
  counterpartyId?: string | number | null;
  counterpartyName?: string;
  category?: string;
  method?: string;
  amount?: number;
  total?: number;
  comment?: string;
  paymentSummary?: {
    total?: number;
    paid?: number;
    remaining?: number;
    status?: string;
  };
  payments?: Array<{
    account?: string;
    method?: string;
    amount?: number;
    note?: string;
    date?: string;
    direction?: "in" | "out";
  }>;
  lines?: Array<{
    productId?: number;
    name?: string;
    code?: string;
    sku?: string;
    unit?: string;
    variant?: string;
    qty?: number;
    price?: number;
    standardPrice?: number;
    priceSource?: string;
    priceStore?: string;
    discount?: number;
    movementMode?: MovementSelectionMode;
    requestedQty?: number;
  }>;
  bondedStock?: {
    containers?: ContainerDraft[];
  };
  movementSelection?: MovementSuggestion;
  saleMode?: SaleMode;
  exportMode?: boolean;
};

type ApiDocument = ApiDocumentDraft;

type DocumentLinkType = "debtPayment" | "landedCost" | "movementCost";

type LinkDocumentOption = {
  id: string;
  type: string;
  title: string;
  counterparty: string;
  total: number;
  paid: number;
  remaining: number;
  qty: number;
  documentDate: string;
};

type CostContainerOption = {
  key: string;
  number: string;
  documentId: string;
  documentDate: string;
  qty: number;
  pallets: number;
  rolls: number;
  products: string[];
};

type LandedCostAdjustment = {
  id?: string;
  documentId?: string;
  documentDate?: string;
  category?: string;
  amount?: number;
  totalExpense?: number;
  ratio?: number;
  containerKey?: string;
  containerNumber?: string;
  purchaseDocumentId?: string;
  baseQty?: number;
  netKg?: number;
  grossKg?: number;
  unitCost?: number;
  formula?: string;
  appliesFrom?: string;
};

type StockMode = "simple" | "bondedRolls";
type CompanySettings = {
  stockMode: StockMode;
  reserveBeforeBondedExit?: boolean;
  rollTracking?: boolean;
};

type DocumentWorkflowStatus = "none" | "new" | "inProgress" | "closed" | "canceled";
type SaleMode = "regular" | "export";

type RollDraft = {
  id: string;
  productId: number;
  rollNo: string;
  width: string;
  thickness: string;
  qty: string;
  netKg: string;
  grossKg: string;
};

type PalletDraft = {
  id: string;
  number: string;
  rolls: RollDraft[];
};

type ContainerDraft = {
  id: string;
  number: string;
  invoice: string;
  customsStatus: "bonded" | "released";
  pallets: PalletDraft[];
};

type MovementSelectionMode = "meters" | "fullPallet" | "rollCount";

type MovementSuggestionRoll = {
  sourceDocumentId: string;
  containerKey: string;
  containerNumber: string;
  declaration: string;
  palletId: string;
  palletNumber: string;
  palletStatus: string;
  rollId: string;
  rollNo: string;
  productId: number;
  qty: number;
  width?: string;
  thickness?: string;
};

type MovementSuggestion = {
  id: string;
  mode: MovementSelectionMode | "mixed";
  title: string;
  reason: string;
  recommended?: boolean;
  declarationCount: number;
  containerCount: number;
  palletCount: number;
  rollCount: number;
  requestedQty: number;
  selectedQty: number;
  overage: number;
  incomplete?: boolean;
  shortageCount?: number;
  lines: Array<{
    productId: number;
    qty: number;
    name?: string;
    mode: MovementSelectionMode;
    selectedQty: number;
    selectedRollCount?: number;
    selectedPalletCount?: number;
    shortageQty?: number;
    shortageRollCount?: number;
    shortagePalletCount?: number;
    complete?: boolean;
  }>;
  containers: Array<{
    key: string;
    documentId: string;
    declaration: string;
    number: string;
    selectedQty: number;
    palletCount: number;
    rollCount: number;
    pallets: Array<{
      id: string;
      number: string;
      status: string;
      mixed: boolean;
      selectedQty: number;
      rollCount: number;
      rolls: MovementSuggestionRoll[];
    }>;
  }>;
};

type MovementSuggestionAction = "replace" | "append";

const normalizeMovementContainers = (
  containers: MovementSuggestion["containers"],
  allowedProductIds?: Set<number>
): MovementSuggestion["containers"] => containers
  .map((container) => {
    const pallets = container.pallets
      .map((pallet) => {
        const rolls = pallet.rolls.filter((roll) => !allowedProductIds || allowedProductIds.has(roll.productId));
        return {
          ...pallet,
          rolls,
          rollCount: rolls.length,
          selectedQty: rolls.reduce((sum, roll) => sum + Number(roll.qty ?? 0), 0),
        };
      })
      .filter((pallet) => pallet.rolls.length > 0);
    return {
      ...container,
      pallets,
      palletCount: pallets.length,
      rollCount: pallets.reduce((sum, pallet) => sum + pallet.rollCount, 0),
      selectedQty: pallets.reduce((sum, pallet) => sum + pallet.selectedQty, 0),
    };
  })
  .filter((container) => container.pallets.length > 0);

const mergeMovementContainers = (
  current: MovementSuggestion["containers"],
  addition: MovementSuggestion["containers"]
): MovementSuggestion["containers"] => {
  const containers = new Map<string, MovementSuggestion["containers"][number]>();
  [...current, ...addition].forEach((sourceContainer) => {
    const container = containers.get(sourceContainer.key) ?? {
      ...sourceContainer,
      pallets: [],
      selectedQty: 0,
      palletCount: 0,
      rollCount: 0,
    };
    const pallets = new Map(container.pallets.map((pallet) => [pallet.id, { ...pallet, rolls: [...pallet.rolls] }]));
    sourceContainer.pallets.forEach((sourcePallet) => {
      const pallet = pallets.get(sourcePallet.id) ?? { ...sourcePallet, rolls: [] };
      const rolls = new Map(pallet.rolls.map((roll) => [roll.rollId, roll]));
      sourcePallet.rolls.forEach((roll) => rolls.set(roll.rollId, roll));
      pallets.set(sourcePallet.id, { ...pallet, ...sourcePallet, rolls: Array.from(rolls.values()) });
    });
    containers.set(sourceContainer.key, { ...container, ...sourceContainer, pallets: Array.from(pallets.values()) });
  });
  return normalizeMovementContainers(Array.from(containers.values()));
};

const summarizeMovementSelection = (
  containers: MovementSuggestion["containers"],
  products: ProductLine[],
  base?: Partial<MovementSuggestion>
): MovementSuggestion => {
  const normalizedContainers = normalizeMovementContainers(containers);
  const selectedRolls = normalizedContainers.flatMap((container) =>
    container.pallets.flatMap((pallet) => pallet.rolls.map((roll) => ({
      ...roll,
      palletKey: `${container.key}:${pallet.id}`,
    })))
  );
  const lines = products.map((product) => {
    const mode = product.movementMode ?? "meters";
    const requested = Number(product.qty ?? 0);
    const rolls = selectedRolls.filter((roll) => roll.productId === product.id);
    const selectedQty = rolls.reduce((sum, roll) => sum + Number(roll.qty ?? 0), 0);
    const selectedRollCount = rolls.length;
    const selectedPalletCount = new Set(rolls.map((roll) => roll.palletKey)).size;
    const complete = mode === "fullPallet"
      ? selectedPalletCount >= requested
      : mode === "rollCount"
        ? selectedRollCount >= requested
        : selectedQty >= requested;
    return {
      productId: product.id,
      name: product.name,
      qty: requested,
      mode,
      selectedQty,
      selectedRollCount,
      selectedPalletCount,
      shortageQty: mode === "meters" ? Math.max(0, requested - selectedQty) : 0,
      shortageRollCount: mode === "rollCount" ? Math.max(0, requested - selectedRollCount) : 0,
      shortagePalletCount: mode === "fullPallet" ? Math.max(0, requested - selectedPalletCount) : 0,
      complete,
    };
  });
  const declarationCount = new Set(normalizedContainers.map((container) => container.declaration || container.number)).size;
  const selectedQty = selectedRolls.reduce((sum, roll) => sum + Number(roll.qty ?? 0), 0);
  const oneDeclaration = declarationCount === 1;
  const incomplete = lines.some((line) => !line.complete);
  return {
    id: base?.id ?? `selection-${Date.now()}`,
    mode: new Set(lines.map((line) => line.mode)).size > 1 ? "mixed" : lines[0]?.mode ?? "meters",
    title: base?.title ?? (oneDeclaration ? `Eyni bəyannamə · ${normalizedContainers[0]?.declaration || normalizedContainers[0]?.number}` : `${declarationCount} bəyannaməli seçim`),
    reason: base?.reason ?? "",
    recommended: base?.recommended,
    declarationCount,
    containerCount: normalizedContainers.length,
    palletCount: new Set(selectedRolls.map((roll) => roll.palletKey)).size,
    rollCount: selectedRolls.length,
    requestedQty: lines.filter((line) => line.mode === "meters").reduce((sum, line) => sum + line.qty, 0),
    selectedQty,
    overage: lines.filter((line) => line.mode === "meters").reduce((sum, line) => sum + Math.max(0, line.selectedQty - line.qty), 0),
    incomplete,
    shortageCount: lines.filter((line) => !line.complete).length,
    lines,
    containers: normalizedContainers,
  };
};

const movementRollIds = (selection: MovementSuggestion | null) =>
  selection?.containers.flatMap((container) => container.pallets.flatMap((pallet) => pallet.rolls.map((roll) => roll.rollId))) ?? [];

const trimMovementContainersToProducts = (
  containers: MovementSuggestion["containers"],
  products: ProductLine[]
): MovementSuggestion["containers"] => {
  const limits = new Map(products.map((product) => [product.id, {
    requested: Number(product.qty ?? 0),
    mode: product.movementMode ?? "meters",
    qty: 0,
    rolls: 0,
    pallets: new Set<string>(),
  }]));
  return normalizeMovementContainers(containers
    .map((container) => ({
      ...container,
      pallets: container.pallets.map((pallet) => {
        const palletKey = `${container.key}:${pallet.id}`;
        const rolls = pallet.rolls.filter((roll) => {
          const limit = limits.get(roll.productId);
          if (!limit || limit.requested <= 0) return false;
          if (limit.mode === "rollCount") {
            if (limit.rolls >= limit.requested) return false;
            limit.rolls += 1;
            limit.qty += Number(roll.qty ?? 0);
            return true;
          }
          if (limit.mode === "fullPallet") {
            if (!limit.pallets.has(palletKey) && limit.pallets.size >= limit.requested) return false;
            limit.pallets.add(palletKey);
            limit.rolls += 1;
            limit.qty += Number(roll.qty ?? 0);
            return true;
          }
          if (limit.qty >= limit.requested) return false;
          limit.rolls += 1;
          limit.qty += Number(roll.qty ?? 0);
          return true;
        });
        return { ...pallet, rolls };
      }),
    })));
};

type CountRequest =
  | { kind: "pallet"; containerId: string }
  | { kind: "roll"; containerId: string; palletId: string };

const I = {
  X: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  ),
  Check: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 12.5 10 17l9-10" />
    </svg>
  ),
  Search: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <circle cx="11" cy="11" r="7" /><path d="M21 21l-3.5-3.5" />
    </svg>
  ),
  Box: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m3 7 9-4 9 4-9 4-9-4Z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" />
    </svg>
  ),
  Wallet: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M4 7h15a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h12" /><path d="M16 13h5" />
    </svg>
  ),
  ArrowRight: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M5 12h14" /><path d="m13 6 6 6-6 6" />
    </svg>
  ),
  Trash: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  ),
  Chevron: (p: SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...p}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
};

const documentTypes: Array<{ id: DocumentCreateKind; title: string; description: string; group: "stock" | "money" }> = [
  { id: "sale", title: "Satış", description: "Müştəriyə satış sənədi", group: "stock" },
  { id: "purchase", title: "Alış", description: "Təchizatçıdan alış", group: "stock" },
  { id: "saleReturn", title: "Satışın geriqaytarması", description: "Müştəridən geri qəbul", group: "stock" },
  { id: "purchaseReturn", title: "Alışın geriqaytarması", description: "Təchizatçıya geri qaytarma", group: "stock" },
  { id: "inventory", title: "İnventarlaşdırma", description: "Faktiki və sistem qalığı", group: "stock" },
  { id: "openingBalance", title: "Əvvələ qalıq", description: "Başlanğıc stok girişi", group: "stock" },
  { id: "writeOff", title: "Silinmə", description: "Stokdan çıxarış", group: "stock" },
  { id: "movement", title: "Yerdəyişmə", description: "Anbarlar arası hərəkət", group: "stock" },
  { id: "cashIn", title: "Mədaxil", description: "Pul girişi", group: "money" },
  { id: "cashOut", title: "Məxaric", description: "Pul çıxışı", group: "money" },
  { id: "cashTransfer", title: "Köçürülmə", description: "Hesablar arası transfer", group: "money" },
];

const productSeed: ProductLine[] = [
  { id: 1, name: "HG Antrasit", code: "ERSA 204", sku: "11204", unit: "mt", variant: "Antrasit / 18 mm / Parlaq", stock: 105, price: 2.8 },
  { id: 2, name: "HG Kumsal", code: "ANT-ERSA 206", sku: "22206", unit: "əd", variant: "Kumsal / 18 mm / Mat", stock: 0, price: 2.2 },
  { id: 3, name: "Soft Touch Koyu Vizon", code: "ERSA 505-1", sku: "12505", unit: "mt", variant: "Koyu vizon / Soft touch", stock: 0, price: 2.94 },
  { id: 4, name: "Bute Krem", code: "D-1026", sku: "D1026", unit: "mt", variant: "Krem / Satin / 18 mm", stock: 340, price: 3.1 },
  { id: 5, name: "3D Patine Pembe", code: "D-301", sku: "301", unit: "mt", variant: "Pembe / 3D / Premium", stock: 72, price: 4.4 },
];

const stores = ["ERSA DEPO", "ERSA ANTREPO"];
const accounts = ["Kassa", "Bank hesabı", "ERSA DEPO kassası"];
const documentStatusOptions: Array<{ id: DocumentWorkflowStatus; label: string; dot: string }> = [
  { id: "none", label: "Statussuz", dot: "bg-slate-200" },
  { id: "new", label: "Yeni", dot: "bg-purple-500" },
  { id: "inProgress", label: "Fəaliyyətdə", dot: "bg-sky-500" },
  { id: "closed", label: "Bağlıdır", dot: "bg-emerald-500" },
  { id: "canceled", label: "Ləğv edilib", dot: "bg-rose-500" },
];

const defaultCompanySettings: CompanySettings = {
  stockMode: "simple",
  reserveBeforeBondedExit: true,
  rollTracking: false,
};

const draftId = () => Math.random().toString(36).slice(2, 10);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const documentPanelSizeStorageKey = "arix:document-panel-size";
const initialDocumentPanelSize = () => {
  if (typeof window === "undefined") return { width: 1280, height: 820 };
  try {
    const stored = JSON.parse(window.localStorage.getItem(documentPanelSizeStorageKey) ?? "null") as { width?: number; height?: number } | null;
    if (stored && Number.isFinite(stored.width) && Number.isFinite(stored.height)) {
      return {
        width: Math.round(clamp(Number(stored.width), 760, window.innerWidth - 24)),
        height: Math.round(clamp(Number(stored.height), 540, window.innerHeight - 24)),
      };
    }
  } catch {
    // Ignore invalid stored panel sizes and fall back to viewport-based defaults.
  }
  return {
    width: Math.round(clamp(window.innerWidth * 0.9, 860, window.innerWidth - 24)),
    height: Math.round(clamp(window.innerHeight * 0.86, 620, window.innerHeight - 24)),
  };
};
const toDateTimeInput = (date = new Date()) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};
const toDraftNumber = (value: string) => {
  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
};
const createRollDraft = (productId = 0, _index = 1): RollDraft => ({
  id: draftId(),
  productId,
  rollNo: "",
  width: "",
  thickness: "",
  qty: "",
  netKg: "",
  grossKg: "",
});
const createPalletDraft = (productId = 0, index = 1): PalletDraft => ({
  id: draftId(),
  number: `Palet ${index}`,
  rolls: [createRollDraft(productId, 1)],
});
const createContainerDraft = (productId = 0, index = 1): ContainerDraft => ({
  id: draftId(),
  number: `CONT-${String(index).padStart(3, "0")}`,
  invoice: "",
  customsStatus: "bonded",
  pallets: [createPalletDraft(productId, 1)],
});

const clonePalletDraft = (pallet: PalletDraft, index: number): PalletDraft => ({
  id: draftId(),
  number: pallet.number || `Palet ${index}`,
  rolls: pallet.rolls.map((roll) => ({ ...roll, id: draftId() })),
});

const mapApiProduct = (product: ApiProduct, store = "ERSA DEPO", kind: DocumentCreateKind = "sale"): ProductLine => {
  const isPurchasePrice = kind === "purchase" || kind === "purchaseReturn";
  const standardPrice = Number(
    isPurchasePrice
      ? product.purchasePrice ?? product.cost ?? 0
      : product.storePrices?.[store] ?? product.salePrice ?? 0
  );
  return {
  id: product.id,
  name: product.name,
  code: product.code,
  sku: product.sku,
  unit: product.unit,
  variant: "Standart",
  stock: Number(product.warehouses?.depo ?? product.warehouses?.antrepo ?? 0),
  price: standardPrice,
  standardPrice,
  priceSource: isPurchasePrice ? "Son təchizatçı alış qiyməti" : "Mağaza standartı",
  priceStore: store,
  warehouses: {
    antrepo: Number(product.warehouses?.antrepo ?? 0),
    depo: Number(product.warehouses?.depo ?? 0),
  },
  };
};

const documentDateInput = (value?: string) => {
  const date = value ? new Date(value) : new Date();
  return toDateTimeInput(Number.isNaN(date.getTime()) ? new Date() : date);
};

const workflowStatusFromDocument = (document?: ApiDocument | null): DocumentWorkflowStatus => {
  if (!document) return "new";
  if (document.workflowStatus) return document.workflowStatus;
  if (document.status === "cancelled" || document.status === "canceled") return "canceled";
  if (document.status === "closed") return "closed";
  if (document.status === "draft" || document.posted === false) return "new";
  return "new";
};

const isDocumentPosted = (document?: ApiDocument | null, kind?: DocumentCreateKind) => {
  if (!document) return kind !== "inventory";
  if (typeof document.posted === "boolean") return document.posted;
  return document.status !== "draft";
};

const cloneContainers = (containers?: ContainerDraft[]): ContainerDraft[] => {
  if (!Array.isArray(containers) || containers.length === 0) return [createContainerDraft()];
  return containers.map((container, containerIndex) => ({
    id: container.id || draftId(),
    number: container.number || `CONT-${String(containerIndex + 1).padStart(3, "0")}`,
    invoice: container.invoice || "",
    customsStatus: container.customsStatus || "bonded",
    pallets: (container.pallets?.length ? container.pallets : [createPalletDraft()]).map((pallet, palletIndex) => ({
      id: pallet.id || draftId(),
      number: pallet.number || `Palet ${palletIndex + 1}`,
      rolls: (pallet.rolls?.length ? pallet.rolls : [createRollDraft()]).map((roll) => ({
        id: roll.id || draftId(),
        productId: Number(roll.productId ?? 0),
        rollNo: String(roll.rollNo || ""),
        width: String(roll.width || ""),
        thickness: String(roll.thickness || ""),
        qty: String(roll.qty || ""),
        netKg: String(roll.netKg || ""),
        grossKg: String(roll.grossKg || ""),
      })),
    })),
  }));
};

const mapDocumentLinesToProducts = (document: ApiDocument | null | undefined, products: ProductLine[]): ProductLine[] => {
  if (!document?.lines?.length) return [];
  return document.lines.map((line, index) => {
    const id = Number(line.productId ?? index + 1);
    const product = products.find((item) => item.id === id);
    const qty = Number(line.requestedQty ?? line.qty ?? 1);
    const price = Number(line.price ?? product?.price ?? 0);
    const discount = Number(line.discount ?? 0);
    return {
      id,
      name: line.name ?? product?.name ?? "Məhsul",
      code: line.code ?? product?.code ?? String(line.productId ?? ""),
      sku: line.sku ?? product?.sku ?? "",
      unit: line.unit ?? product?.unit ?? "əd",
      variant: line.variant ?? product?.variant ?? "Standart",
      stock: product?.stock ?? 0,
      price,
      standardPrice: Number(line.standardPrice ?? product?.standardPrice ?? price),
      priceSource: line.priceSource ?? product?.priceSource,
      priceStore: line.priceStore ?? product?.priceStore,
      qty,
      discount,
      warehouses: product?.warehouses,
      movementMode: line.movementMode === "fullPallet"
        ? "fullPallet"
        : line.movementMode === "rollCount"
          ? "rollCount"
          : product?.movementMode ?? "meters",
    };
  });
};

const collectCostContainers = (documents: ApiDocument[]): CostContainerOption[] => {
  const options = new Map<string, CostContainerOption>();
  documents.forEach((document) => {
    if (document.type !== "purchase") return;
    const containers = Array.isArray(document.bondedStock?.containers) ? document.bondedStock.containers : [];
    containers.forEach((container) => {
      const number = String(container.number ?? "").trim();
      if (!number) return;
      let qty = 0;
      let rolls = 0;
      const products = new Set<string>();
      container.pallets?.forEach((pallet) => {
        pallet.rolls?.forEach((roll) => {
          rolls += 1;
          qty += toDraftNumber(roll.qty);
          if (roll.productId) products.add(String(roll.productId));
        });
      });
      const key = `${document.id ?? "doc"}:${number}`;
      options.set(key, {
        key,
        number,
        documentId: String(document.id ?? ""),
        documentDate: String(document.documentDate ?? document.createdAt ?? ""),
        qty,
        pallets: container.pallets?.length ?? 0,
        rolls,
        products: Array.from(products),
      });
    });
  });
  return Array.from(options.values()).sort((a, b) => b.documentDate.localeCompare(a.documentDate));
};

const collectLinkDocuments = (documents: ApiDocument[], kind: DocumentCreateKind): LinkDocumentOption[] =>
  documents
    .filter((document) => kind === "cashOut"
      ? ["purchase", "saleReturn", "movement"].includes(document.type ?? "")
      : kind === "cashIn"
        ? ["sale", "purchaseReturn"].includes(document.type ?? "")
        : false)
    .map((document) => {
      const type = String(document.type ?? "");
      const total = Number(document.paymentSummary?.total ?? document.total ?? 0);
      const paid = Number(document.paymentSummary?.paid ?? document.payments?.reduce((sum, payment) => sum + Number(payment.amount ?? 0), 0) ?? 0);
      const title = type === "purchase"
        ? "Alış sənədi"
        : type === "movement"
          ? "Antrepodan depoya düşüm"
        : type === "sale"
          ? "Satış sənədi"
          : type === "purchaseReturn"
            ? "Alış qaytarması"
            : "Satış qaytarması";
      return {
        id: String(document.id ?? ""),
        type,
        title: `${title} #${String(document.id ?? "").slice(0, 8)}`,
        counterparty: String(document.counterpartyName ?? ""),
        total,
        paid,
        remaining: Math.max(0, total - paid),
        qty: (document.lines ?? []).reduce((sum, line) => sum + Number(line.qty ?? 0), 0),
        documentDate: String(document.documentDate ?? document.createdAt ?? ""),
      };
    })
    .filter((document) => document.id)
    .sort((a, b) => b.documentDate.localeCompare(a.documentDate));

const matchesDocumentLinkType = (document: LinkDocumentOption, type: DocumentLinkType) => {
  if (type === "movementCost") return document.type === "movement";
  if (type === "landedCost") return document.type === "purchase";
  return document.type !== "movement";
};

export function DocumentCreateMenu({
  isDark,
  onPick,
  onClose,
}: {
  isDark: boolean;
  onPick: (kind: DocumentCreateKind) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-950/30 p-4 backdrop-blur-sm">
      <div className={cx("w-full max-w-3xl overflow-hidden rounded-[24px] p-4 shadow-2xl ring-1", isDark ? "glass-panel-dark ring-white/10" : "glass-panel ring-white/55")}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className={cx("text-xl font-semibold", isDark ? "text-slate-100" : "text-slate-900")}>Sənəd yarat</h2>
          <p className={cx("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>Əməliyyat növünü seç, sonra sənəd kartını tamamla.</p>
        </div>
        <button type="button" onClick={onClose} className={cx("flex h-10 w-10 items-center justify-center rounded-xl border", isDark ? "border-white/10 hover:bg-white/10" : "border-slate-200 hover:bg-white")} aria-label="Bağla">
          <I.X className="h-5 w-5" />
        </button>
      </div>
      <div className="px-2 pb-2 text-xs font-semibold uppercase text-slate-400">Sənəd yarat</div>
      <div className="space-y-1">
        {documentTypes.filter((item) => item.group === "stock").map((item) => (
          <MenuItem key={item.id} item={item} isDark={isDark} onPick={onPick} />
        ))}
      </div>
      <div className={cx("my-2 h-px", isDark ? "bg-white/10" : "bg-slate-200")} />
      <div className="px-2 pb-2 text-xs font-semibold uppercase text-slate-400">Pul</div>
      <div className="space-y-1">
        {documentTypes.filter((item) => item.group === "money").map((item) => (
          <MenuItem key={item.id} item={item} isDark={isDark} onPick={onPick} />
        ))}
      </div>
    </div>
    </div>
  );
}

function MenuItem({
  item,
  isDark,
  onPick,
}: {
  item: (typeof documentTypes)[number];
  isDark: boolean;
  onPick: (kind: DocumentCreateKind) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onPick(item.id)}
      className={cx("flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition", isDark ? "hover:bg-white/7" : "hover:bg-white/70")}
    >
      <span className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", item.group === "money" ? "bg-emerald-500/12 text-emerald-600" : "bg-indigo-500/12 text-indigo-600")}>
        {item.group === "money" ? <I.Wallet className="h-5 w-5" /> : <I.Box className="h-5 w-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx("block truncate text-sm font-semibold", isDark ? "text-slate-100" : "text-slate-800")}>{item.title}</span>
        <span className={cx("block truncate text-xs", isDark ? "text-slate-400" : "text-slate-500")}>{item.description}</span>
      </span>
    </button>
  );
}

export default function DocumentCreatePanel({
  kind,
  isDark,
  onClose,
  editingDocument,
  onSaved,
}: {
  kind: DocumentCreateKind;
  isDark: boolean;
  onClose: () => void;
  editingDocument?: ApiDocument | null;
  onSaved?: () => void;
}) {
  const meta = documentTypes.find((item) => item.id === kind) ?? documentTypes[0];
  const isMoney = meta.group === "money";
  const isEditing = Boolean(editingDocument?.id);
  const [saleMode, setSaleMode] = useState<SaleMode>(() =>
    editingDocument?.saleMode === "export" || editingDocument?.exportMode ? "export" : "regular"
  );
  const [pendingSaleMode, setPendingSaleMode] = useState<SaleMode | null>(null);
  const [closeWarningOpen, setCloseWarningOpen] = useState(false);
  const [documentStatus, setDocumentStatus] = useState<DocumentWorkflowStatus>(() => workflowStatusFromDocument(editingDocument));
  const [posted, setPosted] = useState(() => isDocumentPosted(editingDocument, kind));
  const [documentAccount, setDocumentAccount] = useState(editingDocument?.account ?? (kind === "purchase" ? "ERSA ANTREPO" : "ERSA DEPO"));
  const [movementFromAccount, setMovementFromAccount] = useState(editingDocument?.fromAccount ?? "ERSA ANTREPO");
  const [movementToAccount, setMovementToAccount] = useState(editingDocument?.toAccount ?? "ERSA DEPO");
  const [movementSuggestions, setMovementSuggestions] = useState<MovementSuggestion[]>([]);
  const [selectedMovementSuggestion, setSelectedMovementSuggestion] = useState<MovementSuggestion | null>(editingDocument?.movementSelection ?? null);
  const [movementSuggestionAction, setMovementSuggestionAction] = useState<MovementSuggestionAction>("replace");
  const [movementSuggestionsLoading, setMovementSuggestionsLoading] = useState(false);
  const [documentDate, setDocumentDate] = useState(() => documentDateInput(editingDocument?.documentDate ?? editingDocument?.createdAt));
  const [availableProducts, setAvailableProducts] = useState<ProductLine[]>(productSeed);
  const [selectedProducts, setSelectedProducts] = useState<ProductLine[]>(() => mapDocumentLinesToProducts(editingDocument, productSeed));
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [counterparties, setCounterparties] = useState<ApiCounterparty[]>([]);
  const [counterpartyId, setCounterpartyId] = useState(editingDocument?.counterpartyId ? String(editingDocument.counterpartyId) : "");
  const [activeTab, setActiveTab] = useState<"products" | "payment" | "costs">("products");
  const [query, setQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [companySettings, setCompanySettings] = useState<CompanySettings>(defaultCompanySettings);
  const [containers, setContainers] = useState<ContainerDraft[]>(() => cloneContainers(editingDocument?.bondedStock?.containers));
  const [panelSize, setPanelSize] = useState(initialDocumentPanelSize);
  const [countRequest, setCountRequest] = useState<CountRequest | null>(null);
  const [countInput, setCountInput] = useState("1");
  const [moneyAccount, setMoneyAccount] = useState(editingDocument?.account ?? accounts[0]);
  const [moneyTarget, setMoneyTarget] = useState(editingDocument?.counterpartyName ?? "");
  const [moneyCategory, setMoneyCategory] = useState(editingDocument?.category ?? "");
  const [moneyMethod, setMoneyMethod] = useState(editingDocument?.method ?? "Bank");
  const [moneyAmount, setMoneyAmount] = useState(String(editingDocument?.amount ?? editingDocument?.total ?? 0));
  const [moneyComment, setMoneyComment] = useState(editingDocument?.comment ?? "");
  const [documentPaymentAccount, setDocumentPaymentAccount] = useState(editingDocument?.payments?.[0]?.account ?? "ERSA DEPO kassası");
  const [documentPaymentMethod, setDocumentPaymentMethod] = useState(editingDocument?.payments?.[0]?.method ?? "Nağd");
  const [documentPaidAmount, setDocumentPaidAmount] = useState("0");
  const [documentPaymentNote, setDocumentPaymentNote] = useState("");
  const [documentPayments, setDocumentPayments] = useState<NonNullable<ApiDocumentDraft["payments"]>>(() =>
    (editingDocument?.payments ?? []).map((payment) => ({ ...payment }))
  );
  const [costLinkEnabled, setCostLinkEnabled] = useState(false);
  const [documentLinkType, setDocumentLinkType] = useState<DocumentLinkType>("debtPayment");
  const [linkedDocumentId, setLinkedDocumentId] = useState("");
  const [linkDocumentOptions, setLinkDocumentOptions] = useState<LinkDocumentOption[]>([]);
  const [costCategory, setCostCategory] = useState("Nəqliyyat");
  const [costContainerKeys, setCostContainerKeys] = useState<string[]>([]);
  const [costContainerOptions, setCostContainerOptions] = useState<CostContainerOption[]>([]);
  const [landedCosts, setLandedCosts] = useState<LandedCostAdjustment[]>([]);
  const initialEditingPriceKeyRef = useRef(isEditing ? `${editingDocument?.counterpartyId ?? ""}|${editingDocument?.account ?? ""}` : "");
  const panelSizeRef = useRef(panelSize);
  const border = isDark ? "border-white/10" : "border-slate-200";
  const panel = isDark ? "bg-slate-950/94 text-slate-100 ring-white/10" : "bg-white/95 text-slate-900 ring-slate-200";
  const soft = isDark ? "bg-white/7" : "bg-slate-50";
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const isExportSale = kind === "sale" && saleMode === "export";
  const usesMovementSelection = kind === "movement" || isExportSale;
  const stockSelectionFromAccount = isExportSale ? documentAccount : movementFromAccount;
  const stockSelectionToAccount = isExportSale ? "İxracat" : movementToAccount;
  const filteredProducts = availableProducts.filter((product) => [product.name, product.code, product.sku, product.variant].join(" ").toLowerCase().includes(query.toLowerCase()));
  const isBondedPurchase = kind === "purchase" && companySettings.stockMode === "bondedRolls";
  useEffect(() => {
    panelSizeRef.current = panelSize;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(documentPanelSizeStorageKey, JSON.stringify(panelSize));
    }
  }, [panelSize]);
  useEffect(() => {
    if (isEditing) return;
    setDocumentAccount(kind === "purchase" && companySettings.stockMode === "bondedRolls" ? "ERSA ANTREPO" : "ERSA DEPO");
  }, [kind, companySettings.stockMode, isEditing]);
  const startResize = (edge: { left?: boolean; right?: boolean; top?: boolean; bottom?: boolean }) => (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const start = panelSizeRef.current;
    const onMove = (moveEvent: globalThis.PointerEvent) => {
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const maxWidth = window.innerWidth - 24;
      const maxHeight = window.innerHeight - 24;
      const width = start.width + (edge.right ? dx : 0) - (edge.left ? dx : 0);
      const height = start.height + (edge.bottom ? dy : 0) - (edge.top ? dy : 0);
      setPanelSize({
        width: Math.round(clamp(width, 760, maxWidth)),
        height: Math.round(clamp(height, 540, maxHeight)),
      });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const total = useMemo(
    () => selectedProducts.reduce((sum, product) => {
      const movementLine = usesMovementSelection
        ? selectedMovementSuggestion?.lines.find((line) => line.productId === product.id)
        : undefined;
      const qty = movementLine?.selectedQty ?? product.qty ?? 1;
      return sum + Math.max(0, qty * product.price - (product.discount ?? 0));
    }, 0),
    [selectedProducts, selectedMovementSuggestion, usesMovementSelection]
  );
  const documentPaidTotal = documentPayments.reduce((sum, payment) => sum + Math.max(0, Number(payment.amount ?? 0)), 0);
  const documentRemaining = Math.max(0, total - documentPaidTotal);
  const documentPaymentStatus = total <= 0
    ? "Ödənişsiz"
    : documentPaidTotal <= 0
      ? "Ödənilməyib"
      : documentRemaining <= 0
      ? "Tam ödənilib"
      : "Qismən ödənilib";
  const selectedMovementQtyByProduct = useMemo(() => {
    const values = new Map<number, number>();
    selectedMovementSuggestion?.lines.forEach((line) => values.set(line.productId, line.selectedQty));
    return values;
  }, [selectedMovementSuggestion]);

  const alignProductsToMovementSelection = (products: ProductLine[], selection: MovementSuggestion) =>
    products.map((product) => {
      const line = selection.lines.find((item) => item.productId === product.id);
      if (!line || line.selectedQty <= 0) return product;
      return {
        ...product,
        qty: line.selectedQty,
        movementMode: "meters" as MovementSelectionMode,
      };
    });

  const requestClose = () => {
    setCloseWarningOpen(true);
  };

  const confirmClose = () => {
    setCloseWarningOpen(false);
    onClose();
  };

  const changeSaleMode = (nextMode: SaleMode) => {
    if (nextMode === saleMode) return;
    setPendingSaleMode(nextMode);
  };

  const confirmSaleModeChange = () => {
    if (!pendingSaleMode) return;
    setSaleMode(pendingSaleMode);
    setMovementSuggestions([]);
    setSelectedMovementSuggestion(null);
    setPendingSaleMode(null);
  };

  const addDocumentPayment = () => {
    const amount = Math.max(0, toDraftNumber(documentPaidAmount));
    if (amount <= 0) {
      setMessage("Ödəniş məbləğini daxil et.");
      return false;
    }
    if (amount > documentRemaining) {
      setMessage(`Ödəniş qalıq məbləğdən çox ola bilməz: ${documentRemaining.toFixed(2)} ₼`);
      return false;
    }
    setDocumentPayments((current) => [
      ...current,
      {
        account: documentPaymentAccount,
        method: documentPaymentMethod,
        amount,
        date: documentDate,
        note: documentPaymentNote,
        direction: ["sale", "purchaseReturn"].includes(kind) ? "in" : "out",
      },
    ]);
    setDocumentPaidAmount("0");
    setDocumentPaymentNote("");
    setMessage("");
    return true;
  };

  const removeDocumentPayment = (index: number) => {
    setDocumentPayments((current) => current.filter((_, paymentIndex) => paymentIndex !== index));
  };

  const removeProduct = (id: number) => {
    const nextProducts = selectedProducts.filter((item) => item.id !== id);
    setSelectedProducts(nextProducts);
    if (usesMovementSelection) {
      setMovementSuggestions([]);
      setSelectedMovementSuggestion((current) => current
        ? summarizeMovementSelection(
          normalizeMovementContainers(current.containers, new Set(nextProducts.map((product) => product.id))),
          nextProducts,
          current
        )
        : null
      );
    }
    setContainers((current) =>
      current.map((container) => ({
        ...container,
        pallets: container.pallets.map((pallet) => ({
          ...pallet,
          rolls: pallet.rolls.map((roll) => roll.productId === id ? { ...roll, productId: 0 } : roll),
        })),
      }))
    );
  };
  const addProduct = (product: ProductLine) => {
    if (selectedProducts.some((item) => item.id === product.id)) {
      removeProduct(product.id);
      return;
    }
    const nextProducts = [...selectedProducts, { ...product, qty: 1, discount: 0, movementMode: "meters" as MovementSelectionMode }];
    setSelectedProducts(nextProducts);
    if (usesMovementSelection) {
      setMovementSuggestions([]);
      setSelectedMovementSuggestion((current) => current ? summarizeMovementSelection(current.containers, nextProducts, current) : null);
    }
  };
  const updateProduct = (id: number, patch: Partial<ProductLine>) => {
    const nextProducts = selectedProducts.map((item) => item.id === id ? { ...item, ...patch } : item);
    setSelectedProducts(nextProducts);
    if (usesMovementSelection) {
      setMovementSuggestions([]);
      setSelectedMovementSuggestion((current) => current
        ? summarizeMovementSelection(trimMovementContainersToProducts(current.containers, nextProducts), nextProducts, current)
        : null
      );
    }
  };
  const findMovementSuggestions = async (action: MovementSuggestionAction = "replace") => {
    if (selectedProducts.length === 0) {
      setMessage("Əvvəl köçürüləcək məhsulları və miqdarı seç.");
      return;
    }
    const requestLines = action === "append" && selectedMovementSuggestion
      ? selectedMovementSuggestion.lines
        .filter((line) => !line.complete)
        .map((line) => ({
          productId: line.productId,
          name: line.name,
          qty: line.mode === "fullPallet"
            ? line.shortagePalletCount ?? 0
            : line.mode === "rollCount"
              ? line.shortageRollCount ?? 0
              : line.shortageQty ?? 0,
          mode: line.mode,
        }))
        .filter((line) => line.qty > 0)
      : selectedProducts.map((product) => ({
        productId: product.id,
        name: product.name,
        qty: product.qty ?? 0,
        mode: product.movementMode ?? "meters",
      }));
    if (action === "append" && requestLines.length === 0) {
      setMessage("Seçilmiş stok cari tələbi tam qarşılayır.");
      return;
    }
    setMovementSuggestionsLoading(true);
    setMovementSuggestionAction(action);
    setMessage("");
    try {
      const payload = await requestJson<{ data: MovementSuggestion[] }>("/api/movement-suggestions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentMovementDocumentId: editingDocument?.id ? String(editingDocument.id) : undefined,
          excludeRollIds: action === "append" ? movementRollIds(selectedMovementSuggestion) : [],
          fromAccount: stockSelectionFromAccount,
          toAccount: stockSelectionToAccount,
          lines: requestLines,
        }),
      });
      const suggestions = Array.isArray(payload.data) ? payload.data : [];
      setMovementSuggestions(suggestions);
      if (suggestions.length === 0) {
        setMessage(action === "append"
          ? "Çatışmayan hissəni tamamlamaq üçün əlavə stok tapılmadı."
          : "Seçilən məhsullar üzrə köçürülə biləcək stok yoxdur.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Alternativlər hesablanmadı.");
    } finally {
      setMovementSuggestionsLoading(false);
    }
  };
  const applyMovementSuggestion = (suggestion: MovementSuggestion) => {
    const nextSelection = movementSuggestionAction === "append" && selectedMovementSuggestion
      ? summarizeMovementSelection(
        mergeMovementContainers(selectedMovementSuggestion.containers, suggestion.containers),
        selectedProducts,
        {
          ...selectedMovementSuggestion,
          id: `${selectedMovementSuggestion.id}+${suggestion.id}`,
          reason: [selectedMovementSuggestion.reason, suggestion.reason].filter(Boolean).join(" "),
        }
      )
      : summarizeMovementSelection(suggestion.containers, selectedProducts, suggestion);
    const nextProducts = alignProductsToMovementSelection(selectedProducts, nextSelection);
    const syncedSelection = summarizeMovementSelection(nextSelection.containers, nextProducts, nextSelection);
    setSelectedProducts(nextProducts);
    setSelectedMovementSuggestion(syncedSelection);
    setMovementSuggestions([]);
    setMessage(movementSuggestionAction === "append"
      ? "Çatışmayan stok seçilmiş rezervə əlavə edildi. Tələb miqdarı seçilmiş metrajla yeniləndi."
      : `${suggestion.title} seçildi. Tələb miqdarı seçilmiş metrajla yeniləndi.`);
  };
  const clearMovementSelection = () => {
    setSelectedMovementSuggestion(null);
    setMovementSuggestions([]);
    setMessage("Seçilmiş stok təmizləndi. Yeni variant hesablaya bilərsən.");
  };
  const updateContainer = (containerId: string, patch: Partial<ContainerDraft>) => {
    setContainers((current) => current.map((container) => container.id === containerId ? { ...container, ...patch } : container));
  };
  const addContainer = () => {
    setContainers((current) => [...current, createContainerDraft(firstProductId, current.length + 1)]);
  };
  const removeContainer = (containerId: string) => {
    setContainers((current) => current.length > 1 ? current.filter((container) => container.id !== containerId) : current);
  };
  const openCountRequest = (request: CountRequest) => {
    setCountInput("1");
    setCountRequest(request);
  };
  const addPallets = (containerId: string, count: number) => {
    setContainers((current) => current.map((container) => (
      container.id === containerId
        ? {
            ...container,
            pallets: [
              ...container.pallets,
              ...Array.from({ length: count }, (_, index) => createPalletDraft(firstProductId, container.pallets.length + index + 1)),
            ],
          }
        : container
    )));
  };
  const addPallet = (containerId: string) => {
    openCountRequest({ kind: "pallet", containerId });
  };
  const updatePallet = (containerId: string, palletId: string, patch: Partial<PalletDraft>) => {
    setContainers((current) => current.map((container) => (
      container.id === containerId
        ? {
            ...container,
            pallets: container.pallets.map((pallet) => pallet.id === palletId ? { ...pallet, ...patch } : pallet),
          }
        : container
    )));
  };
  const clonePallet = (containerId: string, palletId: string) => {
    setContainers((current) => current.map((container) => {
      if (container.id !== containerId) return container;
      const source = container.pallets.find((pallet) => pallet.id === palletId);
      if (!source) return container;
      return {
        ...container,
        pallets: [...container.pallets, clonePalletDraft(source, container.pallets.length + 1)],
      };
    }));
  };
  const addRolls = (containerId: string, palletId: string, count: number) => {
    setContainers((current) => current.map((container) => (
      container.id === containerId
        ? {
            ...container,
            pallets: container.pallets.map((pallet) => (
              pallet.id === palletId
                ? {
                    ...pallet,
                    rolls: [
                      ...pallet.rolls,
                      ...Array.from({ length: count }, (_, index) => createRollDraft(firstProductId, pallet.rolls.length + index + 1)),
                    ],
                  }
                : pallet
            )),
          }
        : container
    )));
  };
  const addRoll = (containerId: string, palletId: string) => {
    openCountRequest({ kind: "roll", containerId, palletId });
  };
  const confirmCountRequest = () => {
    if (!countRequest) return;
    const count = Math.min(200, Math.max(1, Math.floor(Number(countInput))));
    if (!Number.isFinite(count)) return;
    if (countRequest.kind === "pallet") {
      addPallets(countRequest.containerId, count);
    } else {
      addRolls(countRequest.containerId, countRequest.palletId, count);
    }
    setCountRequest(null);
  };
  const updateRoll = (containerId: string, palletId: string, rollId: string, patch: Partial<RollDraft>) => {
    setContainers((current) => current.map((container) => (
      container.id === containerId
        ? {
            ...container,
            pallets: container.pallets.map((pallet) => (
              pallet.id === palletId
                ? { ...pallet, rolls: pallet.rolls.map((roll) => roll.id === rollId ? { ...roll, ...patch } : roll) }
                : pallet
            )),
          }
        : container
    )));
  };
  const removeRoll = (containerId: string, palletId: string, rollId: string) => {
    setContainers((current) => current.map((container) => (
      container.id === containerId
        ? {
            ...container,
            pallets: container.pallets.map((pallet) => (
              pallet.id === palletId
                ? { ...pallet, rolls: pallet.rolls.length > 1 ? pallet.rolls.filter((roll) => roll.id !== rollId) : pallet.rolls }
                : pallet
            )),
          }
        : container
    )));
  };
  const selectedCounterparty = counterparties.find((item) => String(item.id) === counterpartyId);
  const firstProductId = selectedProducts[0]?.id ?? 0;
  const rollTotals = useMemo(() => {
    const totals = new Map<number, number>();
    containers.forEach((container) => {
      container.pallets.forEach((pallet) => {
        pallet.rolls.forEach((roll) => {
          if (!roll.productId) return;
          totals.set(roll.productId, (totals.get(roll.productId) ?? 0) + toDraftNumber(roll.qty));
        });
      });
    });
    return totals;
  }, [containers]);
  const rollSummary = useMemo(() => {
    let palletCount = 0;
    let rollCount = 0;
    let qty = 0;
    let netKg = 0;
    let grossKg = 0;
    containers.forEach((container) => {
      palletCount += container.pallets.length;
      container.pallets.forEach((pallet) => {
        rollCount += pallet.rolls.length;
        pallet.rolls.forEach((roll) => {
          qty += toDraftNumber(roll.qty);
          netKg += toDraftNumber(roll.netKg);
          grossKg += toDraftNumber(roll.grossKg);
        });
      });
    });
    return { containerCount: containers.length, palletCount, rollCount, qty, netKg, grossKg };
  }, [containers]);
  const selectedCostContainers = useMemo(
    () => costContainerOptions.filter((container) => costContainerKeys.includes(container.key)),
    [costContainerKeys, costContainerOptions]
  );
  const selectedLinkedDocument = useMemo(
    () => linkDocumentOptions.find((document) => document.id === linkedDocumentId),
    [linkDocumentOptions, linkedDocumentId]
  );
  const costPreview = useMemo(() => {
    const amount = Math.abs(toDraftNumber(moneyAmount));
    const qty = documentLinkType === "movementCost"
      ? Number(selectedLinkedDocument?.qty ?? 0)
      : selectedCostContainers.reduce((sum, container) => sum + container.qty, 0);
    return {
      amount,
      qty,
      unit: qty > 0 ? amount / qty : 0,
    };
  }, [documentLinkType, moneyAmount, selectedCostContainers, selectedLinkedDocument?.qty]);
  const purchaseLandedCosts = useMemo(() => {
    const documentId = String(editingDocument?.id ?? "");
    if (!documentId) return [];
    return landedCosts.filter((item) => String(item.purchaseDocumentId ?? "") === documentId);
  }, [editingDocument?.id, landedCosts]);
  const purchaseCostTotal = purchaseLandedCosts.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);
  const purchaseUnitCostTotal = purchaseLandedCosts.reduce((sum, item) => sum + Number(item.unitCost ?? 0), 0);

  useEffect(() => {
    let cancelled = false;
    requestJson<{ data: CompanySettings }>("/api/company-settings")
      .then((payload) => {
        if (!cancelled) setCompanySettings({ ...defaultCompanySettings, ...payload.data });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isBondedPurchase || !firstProductId) return;
    setContainers((current) =>
      current.map((container) => ({
        ...container,
        pallets: container.pallets.map((pallet) => ({
          ...pallet,
          rolls: pallet.rolls.map((roll) => roll.productId ? roll : { ...roll, productId: firstProductId }),
        })),
      }))
    );
  }, [firstProductId, isBondedPurchase]);

  useEffect(() => {
    if (isMoney) return;
    let cancelled = false;
    requestJson<{ data: ApiProduct[] }>("/api/products")
      .then((payload) => {
        if (cancelled || !Array.isArray(payload.data)) return;
        const nextProducts: ProductLine[] = payload.data.map((product) => mapApiProduct(product, documentAccount, kind));
        setAvailableProducts(nextProducts);
        const nextSelectedProducts = isEditing && editingDocument?.lines?.length
          ? mapDocumentLinesToProducts(editingDocument, nextProducts)
          : selectedProducts.filter((item) => nextProducts.some((product) => product.id === item.id));
        if ((kind === "movement" || editingDocument?.saleMode === "export" || editingDocument?.exportMode) && editingDocument?.movementSelection) {
          const restoredSelection = summarizeMovementSelection(editingDocument.movementSelection.containers, nextSelectedProducts, editingDocument.movementSelection);
          const restoredProducts = alignProductsToMovementSelection(nextSelectedProducts, restoredSelection);
          setSelectedProducts(restoredProducts);
          setSelectedMovementSuggestion(summarizeMovementSelection(editingDocument.movementSelection.containers, restoredProducts, restoredSelection));
        } else {
          setSelectedProducts(nextSelectedProducts);
        }
        setProductsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setAvailableProducts(productSeed);
          setProductsLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isMoney, kind, isEditing, editingDocument]);

  useEffect(() => {
    if (!productsLoaded || !["sale", "saleReturn"].includes(kind)) return;
    const pricingKey = `${counterpartyId}|${documentAccount}`;
    if (initialEditingPriceKeyRef.current === pricingKey) {
      initialEditingPriceKeyRef.current = "";
      return;
    }
    let cancelled = false;
    requestJson<{ data: ResolvedPrice[] }>(
      `/api/customer-prices?customerId=${encodeURIComponent(counterpartyId)}&store=${encodeURIComponent(documentAccount)}`
    )
      .then((payload) => {
        if (cancelled || !Array.isArray(payload.data)) return;
        const priceMap = new Map(payload.data.map((item) => [item.productId, item]));
        const applyResolvedPrice = (product: ProductLine): ProductLine => {
          const resolved = priceMap.get(product.id);
          if (!resolved) return product;
          return {
            ...product,
            price: Number(resolved.effectivePrice),
            standardPrice: Number(resolved.standardPrice),
            priceSource: resolved.source === "customer" ? "Müştəri qiyməti" : "Mağaza standartı",
            priceStore: resolved.store,
          };
        };
        setAvailableProducts((current) => current.map(applyResolvedPrice));
        setSelectedProducts((current) => current.map(applyResolvedPrice));
      })
      .catch((error) => {
        if (!cancelled) setMessage(error instanceof Error ? error.message : "Satış qiymətləri yüklənmədi.");
      });
    return () => {
      cancelled = true;
    };
  }, [counterpartyId, documentAccount, kind, productsLoaded]);

  useEffect(() => {
    if (!isMoney) return;
    let cancelled = false;
    requestJson<{ data: ApiDocument[] }>("/api/documents")
      .then((payload) => {
        if (cancelled || !Array.isArray(payload.data)) return;
        setCostContainerOptions(collectCostContainers(payload.data));
        setLinkDocumentOptions(collectLinkDocuments(payload.data, kind));
      })
      .catch(() => {
        if (!cancelled) {
          setCostContainerOptions([]);
          setLinkDocumentOptions([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isMoney, kind]);

  useEffect(() => {
    if (kind !== "purchase" || !editingDocument?.id) {
      setLandedCosts([]);
      return;
    }
    let cancelled = false;
    requestJson<{ data: LandedCostAdjustment[] }>("/api/landed-costs")
      .then((payload) => {
        if (!cancelled) setLandedCosts(Array.isArray(payload.data) ? payload.data : []);
      })
      .catch(() => {
        if (!cancelled) setLandedCosts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [kind, editingDocument?.id]);

  useEffect(() => {
    setCostContainerKeys((current) => current.filter((key) => costContainerOptions.some((container) => container.key === key)));
  }, [costContainerOptions]);

  useEffect(() => {
    setLinkedDocumentId((current) => current && linkDocumentOptions.some((document) => document.id === current && matchesDocumentLinkType(document, documentLinkType)) ? current : "");
  }, [documentLinkType, linkDocumentOptions]);

  useEffect(() => {
    if (!linkedDocumentId || documentLinkType !== "landedCost") return;
    setCostContainerKeys((current) => current.filter((key) => costContainerOptions.some((container) => container.key === key && container.documentId === linkedDocumentId)));
  }, [linkedDocumentId, documentLinkType, costContainerOptions]);

  useEffect(() => {
    const counterpartyKind = ["sale", "saleReturn"].includes(kind) ? "customer" : ["purchase", "purchaseReturn"].includes(kind) ? "supplier" : "";
    if (!counterpartyKind) return;
    let cancelled = false;
    requestJson<{ data: ApiCounterparty[] }>(`/api/counterparties?kind=${counterpartyKind}`)
      .then((payload) => {
        if (cancelled || !Array.isArray(payload.data)) return;
        setCounterparties(payload.data);
        setCounterpartyId((current) => current || (payload.data[0] ? String(payload.data[0].id) : ""));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const saveDocument = async () => {
    if (!isMoney && selectedProducts.length === 0) {
      setMessage("Ən az bir məhsul seç.");
      return false;
    }
    if (kind === "movement" && movementFromAccount === movementToAccount) {
      setMessage("Mənbə və təyinat mağazası fərqli olmalıdır.");
      return false;
    }
    if (usesMovementSelection && !selectedMovementSuggestion) {
      setMessage("Əvvəl ağıllı stok seçimindən bir variant seç.");
      return false;
    }
    if (usesMovementSelection && selectedMovementSuggestion?.incomplete) {
      const incompleteLine = selectedMovementSuggestion.lines.find((line) => !line.complete);
      setMessage(`${incompleteLine?.name ?? "Məhsul"} üçün seçilmiş stok tələbi tam qarşılamır. Çatışmayanı tamamla və ya miqdarı düzəlt.`);
      return false;
    }
    if (["sale", "saleReturn", "purchase", "purchaseReturn"].includes(kind) && !counterpartyId) {
      setMessage("Kontragent seç.");
      return false;
    }
    if (isMoney && toDraftNumber(moneyAmount) <= 0) {
      setMessage("Məbləğ düzgün deyil.");
      return false;
    }
    if (isMoney && costLinkEnabled && !linkedDocumentId) {
      setMessage("Əlaqələndiriləcək sənədi seç.");
      return false;
    }
    if (kind === "cashOut" && costLinkEnabled && documentLinkType === "landedCost" && selectedCostContainers.length === 0) {
      setMessage("Maya xərci üçün ən az bir konteyner seç.");
      return false;
    }
    if (kind === "cashOut" && costLinkEnabled && documentLinkType === "movementCost" && Number(selectedLinkedDocument?.qty ?? 0) <= 0) {
      setMessage("Depoya düşüm sənədində bölüşdürüləcək miqdar tapılmadı.");
      return false;
    }
    if (isMoney && costLinkEnabled && documentLinkType === "debtPayment" && selectedLinkedDocument && Math.abs(toDraftNumber(moneyAmount)) > selectedLinkedDocument.remaining) {
      setMessage(`Ödəniş sənədin qalıq borcundan çox ola bilməz: ${selectedLinkedDocument.remaining.toFixed(2)} ₼`);
      return false;
    }
    setSaving(true);
    setMessage("");
    try {
      const moneyTotal = Math.abs(toDraftNumber(moneyAmount));
      const documentLines = isMoney ? [] : selectedProducts.map((product) => {
        const movementLine = selectedMovementSuggestion?.lines.find((line) => line.productId === product.id);
        const qty = usesMovementSelection && movementLine
          ? movementLine.selectedQty
          : isBondedPurchase && rollTotals.has(product.id)
            ? rollTotals.get(product.id)
            : product.qty ?? 1;
        return {
          productId: product.id,
          name: product.name,
          code: product.code,
          sku: product.sku,
          unit: product.unit,
          variant: product.variant,
          qty,
          requestedQty: usesMovementSelection ? product.qty ?? 1 : undefined,
          movementMode: usesMovementSelection ? product.movementMode ?? "meters" : undefined,
          price: product.price,
          standardPrice: product.standardPrice,
          priceSource: product.priceSource,
          priceStore: product.priceStore,
          discount: product.discount ?? 0,
          total: Math.max(0, (qty ?? 0) * product.price - (product.discount ?? 0)),
        };
      });
      const documentPayload = {
        type: kind,
        posted,
        workflowStatus: documentStatus,
        status: posted ? "posted" : "draft",
        documentDate,
        account: isMoney ? moneyAccount : kind === "movement" ? movementFromAccount : documentAccount,
        fromAccount: kind === "cashTransfer" ? moneyAccount : kind === "movement" ? movementFromAccount : undefined,
        toAccount: kind === "cashTransfer" ? moneyTarget : kind === "movement" ? movementToAccount : undefined,
        counterpartyId: counterpartyId ? Number(counterpartyId) : null,
        counterpartyName: isMoney ? moneyTarget : selectedCounterparty?.name ?? editingDocument?.counterpartyName ?? "",
        category: isMoney ? moneyCategory : undefined,
        method: isMoney ? moneyMethod : undefined,
        amount: isMoney ? moneyTotal : undefined,
        total: isMoney ? moneyTotal : total,
        comment: isMoney ? moneyComment : undefined,
        saleMode: kind === "sale" ? saleMode : undefined,
        exportMode: isExportSale || undefined,
        documentLink: isMoney && costLinkEnabled ? {
          enabled: true,
          type: documentLinkType,
          documentId: linkedDocumentId,
          title: selectedLinkedDocument?.title ?? "",
        } : undefined,
        linkedDocumentId: isMoney && costLinkEnabled ? linkedDocumentId : undefined,
        linkedDocument: isMoney && costLinkEnabled ? selectedLinkedDocument?.title : undefined,
        payments: !isMoney && total > 0 ? documentPayments : undefined,
        paymentSummary: !isMoney ? {
          status: documentPaymentStatus,
          paid: documentPaidTotal,
          remaining: documentRemaining,
          total,
        } : undefined,
        lines: documentLines,
        movementSelection: usesMovementSelection ? selectedMovementSuggestion ?? undefined : undefined,
        bondedStock: isBondedPurchase ? {
          mode: "container-pallet-roll",
          destination: documentAccount,
          containers,
          summary: rollSummary,
        } : undefined,
        costLink: kind === "cashOut" && costLinkEnabled && documentLinkType === "landedCost" ? {
            enabled: true,
            scope: "purchase",
            category: costCategory,
            containerKeys: costContainerKeys,
            containers: selectedCostContainers.map((container) => ({
              key: container.key,
              number: container.number,
              documentId: container.documentId,
              qty: container.qty,
            })),
            preview: costPreview,
          } : kind === "cashOut" && costLinkEnabled && documentLinkType === "movementCost" ? {
            enabled: true,
            scope: "movement",
            category: costCategory,
            movementDocumentId: linkedDocumentId,
            preview: costPreview,
          } : undefined,
      };
      await requestJson<{ data: unknown; products?: unknown[] }>(isEditing ? `/api/documents/${editingDocument?.id}` : "/api/documents", {
        method: isEditing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(documentPayload),
      });
      setMessage(isEditing ? "Sənəd yeniləndi." : posted ? "Sənəd saxlandı və stok yeniləndi." : "Sənəd qaralama kimi saxlandı.");
      window.dispatchEvent(new CustomEvent("arix:products-updated"));
      window.dispatchEvent(new CustomEvent("arix:documents-updated"));
      if (isEditing) onSaved?.();
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Sənəd saxlanmadı");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveAndPrintDocument = async () => {
    const saved = await saveDocument();
    if (!saved) return;
    window.print();
  };
  const printDocumentPanel = () => {
    window.print();
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/35 p-2 backdrop-blur-md sm:p-3">
      <section
        className={cx("relative flex min-h-[540px] min-w-0 flex-col overflow-hidden rounded-[22px] shadow-2xl ring-1 sm:rounded-[26px]", panel)}
        style={{
          width: panelSize.width,
          height: panelSize.height,
          maxWidth: "calc(100vw - 24px)",
          maxHeight: "calc(100vh - 24px)",
        }}
      >
        <div aria-hidden onPointerDown={startResize({ top: true })} className="absolute inset-x-14 top-0 z-30 h-2 cursor-ns-resize" />
        <div aria-hidden onPointerDown={startResize({ bottom: true })} className="absolute inset-x-14 bottom-0 z-30 h-2 cursor-ns-resize" />
        <div aria-hidden onPointerDown={startResize({ left: true })} className="absolute inset-y-14 left-0 z-30 w-2 cursor-ew-resize" />
        <div aria-hidden onPointerDown={startResize({ right: true })} className="absolute inset-y-14 right-0 z-30 w-2 cursor-ew-resize" />
        <div aria-hidden onPointerDown={startResize({ top: true, left: true })} className="absolute left-0 top-0 z-30 h-6 w-6 cursor-nwse-resize" />
        <div aria-hidden onPointerDown={startResize({ top: true, right: true })} className="absolute right-0 top-0 z-30 h-6 w-6 cursor-nesw-resize" />
        <div aria-hidden onPointerDown={startResize({ bottom: true, left: true })} className="absolute bottom-0 left-0 z-30 h-6 w-6 cursor-nesw-resize" />
        <div aria-hidden onPointerDown={startResize({ bottom: true, right: true })} className="absolute bottom-0 right-0 z-30 h-6 w-6 cursor-nwse-resize" />
        <div className={cx("grid grid-cols-1 items-center gap-2 border-b px-3 py-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-3", border, isDark ? "bg-white/5" : "bg-slate-50/80")}>
          <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
            <button type="button" onClick={() => setPosted((value) => !value)} className="flex shrink-0 items-center gap-3">
              <span className={cx("flex h-7 w-12 items-center rounded-full p-1 transition", posted ? "bg-sky-500" : isDark ? "bg-white/10" : "bg-slate-200")}>
                <span className={cx("h-5 w-5 rounded-full bg-white shadow transition", posted && "translate-x-5")} />
              </span>
              <span className="text-sm font-semibold">{posted ? "Sənəd keçirilib" : "Sənəd keçirilməyib"}</span>
            </button>
            <div className="flex min-w-0 items-center gap-2">
              <DocumentStatusDropdown value={documentStatus} onChange={setDocumentStatus} isDark={isDark} />
            </div>
          </div>

          <label className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={documentDate}
              onChange={(event) => setDocumentDate(event.target.value)}
              className={cx("h-10 w-full rounded-xl border px-3 text-sm font-semibold outline-none sm:w-52", border, isDark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-700")}
            />
          </label>

          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {kind === "sale" && (
              <div className={cx("flex h-10 rounded-xl border p-1", border, isDark ? "bg-white/5" : "bg-white")}>
                {[
                  { id: "regular" as SaleMode, label: "Adi satış", hint: "Mağaza stokundan sadə satış" },
                  { id: "export" as SaleMode, label: "İxracat", hint: "Konteyner, palet və rulo seçimi" },
                ].map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    title={mode.hint}
                    onClick={() => changeSaleMode(mode.id)}
                    className={cx(
                      "rounded-lg px-3 text-sm font-semibold transition",
                      saleMode === mode.id ? "surface-primary text-white shadow" : isDark ? "text-slate-300 hover:bg-white/8" : "text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={printDocumentPanel}
              className={cx("hidden h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium lg:inline-flex", border, soft)}
            >
              Çap et
            </button>
            <button
              type="button"
              onClick={saveAndPrintDocument}
              disabled={saving}
              className={cx("hidden h-10 items-center gap-2 rounded-xl border px-4 text-sm font-medium sm:inline-flex", border, soft, saving && "opacity-70")}
            >
              Saxla və çap et
              <I.Chevron className="h-4 w-4" />
            </button>
            <button type="button" onClick={saveDocument} disabled={saving} className={cx("surface-primary h-10 flex-1 rounded-xl px-5 text-sm font-semibold sm:flex-none", saving && "opacity-70")}>
              {saving ? "Saxlanır..." : "Saxlamaq"}
            </button>
            <button type="button" onClick={requestClose} className={cx("flex h-10 w-10 items-center justify-center rounded-xl border", border, isDark ? "hover:bg-white/10" : "hover:bg-slate-50")} aria-label="Bağla">
              <I.X className="h-5 w-5" />
            </button>
          </div>
        </div>
        {message && (
          <div className={cx("border-b px-5 py-2 text-sm font-semibold", border, message.includes("saxlandı") ? "text-emerald-600" : "text-rose-600")}>
            {message}
          </div>
        )}
        {countRequest && (
          <CountRequestDialog
            title={countRequest.kind === "pallet" ? "Palet sayı" : "Rulo sayı"}
            value={countInput}
            isDark={isDark}
            onChange={setCountInput}
            onClose={() => setCountRequest(null)}
            onConfirm={confirmCountRequest}
          />
        )}
        {pendingSaleMode && (
          <SaleModeConfirmDialog
            currentMode={saleMode}
            nextMode={pendingSaleMode}
            hasStockChoice={Boolean(selectedMovementSuggestion) || movementSuggestions.length > 0}
            isDark={isDark}
            onClose={() => setPendingSaleMode(null)}
            onConfirm={confirmSaleModeChange}
          />
        )}
        {closeWarningOpen && (
          <UnsavedCloseDialog
            isDark={isDark}
            onClose={() => setCloseWarningOpen(false)}
            onConfirm={confirmClose}
          />
        )}

        <div className="grid min-h-0 flex-1 lg:grid-cols-[340px_minmax(0,1fr)]">
          {!isMoney && (
            <aside className={cx("hidden min-h-0 border-r lg:flex lg:flex-col", border)}>
              <div className="p-4">
                <div className="relative">
                  <I.Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Məhsul axtarışı" className={cx("h-11 w-full rounded-xl border pl-10 pr-3 outline-none", border, isDark ? "bg-white/5" : "bg-white")} />
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto px-2 pb-3">
                {filteredProducts.map((product) => (
                  <button key={product.id} type="button" onClick={() => addProduct(product)} className={cx("mb-1 flex w-full items-center gap-3 rounded-xl p-3 text-left", selectedProducts.some((item) => item.id === product.id) ? "surface-nav-active text-indigo-700" : isDark ? "hover:bg-white/7" : "hover:bg-slate-50")}>
                    <I.Box className="h-5 w-5 shrink-0 text-slate-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{product.name}</span>
                      <span className={cx("block truncate text-xs", muted)}>{product.code} · {product.variant}</span>
                      <span className={cx("block text-xs", muted)}>
                          {usesMovementSelection
                          ? stockSelectionFromAccount.toLowerCase().includes("antrepo")
                            ? product.warehouses?.antrepo ?? product.stock
                            : product.warehouses?.depo ?? product.stock
                          : product.stock} {product.unit} · {product.price.toFixed(2)} ₼
                      </span>
                      {["sale", "saleReturn"].includes(kind) && (
                        <span className={cx("mt-0.5 block text-[11px]", product.priceSource === "Müştəri qiyməti" ? "text-indigo-600" : muted)}>
                          {product.priceSource ?? "Mağaza standartı"} · {product.priceStore ?? documentAccount}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </aside>
          )}

          <main className={cx("min-h-0 overflow-auto p-4 sm:p-6", isMoney && "lg:col-span-2")}>
            <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-3xl font-semibold tracking-normal">{meta.title} #</h2>
                <div className={cx("mt-1 h-px w-56 border-b border-dashed", border)} />
              </div>
              {kind === "movement" && (
                <div className="grid w-full gap-3 lg:w-[680px] lg:grid-cols-2">
                  <StoreSelect label="Mağaza (hardan)" value={movementFromAccount} onChange={(value) => {
                    setMovementFromAccount(value);
                    setMovementSuggestions([]);
                    setSelectedMovementSuggestion(null);
                  }} isDark={isDark} required />
                  <StoreSelect label="Mağaza (hara)" value={movementToAccount} onChange={(value) => {
                    setMovementToAccount(value);
                    setMovementSuggestions([]);
                    setSelectedMovementSuggestion(null);
                  }} isDark={isDark} required />
                </div>
              )}
            </div>

            {isMoney ? (
              <MoneyForm
                kind={kind}
                isDark={isDark}
                account={moneyAccount}
                target={moneyTarget}
                category={moneyCategory}
                method={moneyMethod}
                amount={moneyAmount}
                comment={moneyComment}
                costLinkEnabled={costLinkEnabled}
                documentLinkType={documentLinkType}
                linkedDocumentId={linkedDocumentId}
                linkDocumentOptions={linkDocumentOptions}
                costCategory={costCategory}
                costContainerKeys={costContainerKeys}
                costContainerOptions={costContainerOptions}
                costPreview={costPreview}
                onAccountChange={setMoneyAccount}
                onTargetChange={setMoneyTarget}
                onCategoryChange={setMoneyCategory}
                onMethodChange={setMoneyMethod}
                onAmountChange={setMoneyAmount}
                onCommentChange={setMoneyComment}
                onCostLinkEnabledChange={setCostLinkEnabled}
                onDocumentLinkTypeChange={setDocumentLinkType}
                onLinkedDocumentIdChange={setLinkedDocumentId}
                onCostCategoryChange={setCostCategory}
                onCostContainerKeysChange={setCostContainerKeys}
              />
            ) : (
              <>
                {["sale", "saleReturn", "purchase", "purchaseReturn"].includes(kind) ? (
                  <div className="mb-7 space-y-4">
                    <div className="grid gap-4 lg:grid-cols-2">
                      <CounterpartySelect
                        label={["sale", "saleReturn"].includes(kind) ? "Müştəri seçimi" : "Təchizatçı seçimi"}
                        value={counterpartyId}
                        options={counterparties}
                        onChange={setCounterpartyId}
                        isDark={isDark}
                      />
                      <StoreSelect label="Mağaza" value={documentAccount} onChange={(value) => {
                        setDocumentAccount(value);
                        if (isExportSale) {
                          setMovementSuggestions([]);
                          setSelectedMovementSuggestion(null);
                        }
                      }} isDark={isDark} required />
                    </div>
                  </div>
                ) : kind !== "movement" && (
                  <div className="mb-7 max-w-xl">
                    <StoreSelect label="Mağaza" value={documentAccount} onChange={setDocumentAccount} isDark={isDark} required />
                  </div>
                )}

                <div className="mb-4 flex flex-wrap items-center gap-6">
                  <button type="button" onClick={() => setActiveTab("products")} className={cx("border-b-2 pb-2 text-xl font-semibold", activeTab === "products" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-400")}>Məhsullar</button>
                  <button type="button" onClick={() => setActiveTab("payment")} className={cx("border-b-2 pb-2 text-xl font-semibold", activeTab === "payment" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-300")}>Ödənişlər</button>
                  {kind === "purchase" && (
                    <button type="button" onClick={() => setActiveTab("costs")} className={cx("inline-flex items-center gap-2 border-b-2 pb-2 text-xl font-semibold", activeTab === "costs" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-300")}>
                      Çəkilən xərclər / Maya
                      {purchaseLandedCosts.length > 0 && (
                        <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-xs font-semibold text-white">{purchaseLandedCosts.length}</span>
                      )}
                    </button>
                  )}
                </div>

                {activeTab === "products" ? (
                  <>
                    <div className="mb-3 flex gap-2">
                      <div className={cx("flex h-11 flex-1 items-center gap-2 rounded-xl border px-3", border, soft, muted)}><I.Search className="h-5 w-5" />Sənəddə məhsul üzrə axtarış</div>
                      {kind === "inventory" && <button className={cx("h-11 rounded-xl border px-4 text-sm font-semibold text-indigo-600", border)}>Bütün məhsullar</button>}
                    </div>
                    {selectedProducts.length > 0 && (
                      <div className="mb-3 flex flex-wrap gap-2">
                        {selectedProducts.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            onClick={() => removeProduct(product.id)}
                            className={cx("inline-flex h-9 items-center gap-2 rounded-full border px-3 text-sm font-semibold", border, isDark ? "bg-white/7 text-slate-100 hover:bg-white/12" : "bg-white text-slate-700 hover:bg-slate-50")}
                          >
                            {product.name}
                            <I.X className="h-3.5 w-3.5 text-rose-500" />
                          </button>
                        ))}
                      </div>
                    )}
                    <ProductDocumentTable
                      kind={kind}
                      rows={selectedProducts}
                      isDark={isDark}
                      stockSelection={usesMovementSelection}
                      selectedQuantities={selectedMovementQtyByProduct}
                      movementFromAccount={stockSelectionFromAccount}
                      movementToAccount={stockSelectionToAccount}
                      onRemove={removeProduct}
                      onUpdate={updateProduct}
                    />
                    {usesMovementSelection && (
                      <>
                        {selectedMovementSuggestion && (
                          <SelectedMovementStockPanel
                            selection={selectedMovementSuggestion}
                            loading={movementSuggestionsLoading}
                            isDark={isDark}
                            onComplete={() => findMovementSuggestions("append")}
                            onChange={() => findMovementSuggestions("replace")}
                            onClear={clearMovementSelection}
                          />
                        )}
                        <MovementSuggestionPanel
                          suggestions={movementSuggestions}
                          selectedSuggestionId={movementSuggestionAction === "replace" ? selectedMovementSuggestion?.id ?? "" : ""}
                          action={movementSuggestionAction}
                          hasSelection={Boolean(selectedMovementSuggestion)}
                          loading={movementSuggestionsLoading}
                          isDark={isDark}
                          onFind={() => findMovementSuggestions("replace")}
                          onSelect={applyMovementSuggestion}
                        />
                      </>
                    )}
                    {isBondedPurchase && (
                      <BondedPurchasePanel
                        products={selectedProducts}
                        containers={containers}
                        summary={rollSummary}
                        rollTotals={rollTotals}
                        isDark={isDark}
                        onAddContainer={addContainer}
                        onRemoveContainer={removeContainer}
                        onUpdateContainer={updateContainer}
                        onAddPallet={addPallet}
                        onUpdatePallet={updatePallet}
                        onClonePallet={clonePallet}
                        onAddRoll={addRoll}
                        onUpdateRoll={updateRoll}
                        onRemoveRoll={removeRoll}
                      />
                    )}
                    <Totals
                      kind={kind}
                      count={selectedProducts.length}
                      movementQty={selectedMovementSuggestion?.selectedQty}
                      total={total}
                      isDark={isDark}
                    />
                    <label className={cx("mt-8 block text-lg font-semibold", muted)}>{kind === "writeOff" ? "Şərh/Silinmə səbəbi" : "Şərh"}</label>
                    <textarea className={cx("mt-3 h-28 w-full rounded-xl border p-3 outline-none", border, isDark ? "bg-white/5" : "bg-white")} />
                  </>
                ) : activeTab === "payment" ? (
                  <PaymentTab
                    kind={kind}
                    isDark={isDark}
                    total={total}
                    counterpartyName={selectedCounterparty?.name ?? ""}
                    account={documentPaymentAccount}
                    method={documentPaymentMethod}
                    paidAmount={documentPaidAmount}
                    note={documentPaymentNote}
                    payments={documentPayments}
                    status={documentPaymentStatus}
                    remaining={documentRemaining}
                    onAccountChange={setDocumentPaymentAccount}
                    onMethodChange={setDocumentPaymentMethod}
                    onPaidAmountChange={setDocumentPaidAmount}
                    onNoteChange={setDocumentPaymentNote}
                    onAddPayment={addDocumentPayment}
                    onRemovePayment={removeDocumentPayment}
                  />
                ) : (
                  <PurchaseLandedCostPanel
                    costs={purchaseLandedCosts}
                    total={purchaseCostTotal}
                    unitTotal={purchaseUnitCostTotal}
                    isDark={isDark}
                  />
                )}
              </>
            )}
          </main>
        </div>
      </section>
    </div>
  );
}

function CountRequestDialog({
  title,
  value,
  isDark,
  onChange,
  onClose,
  onConfirm,
}: {
  title: string;
  value: string;
  isDark: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const border = isDark ? "border-white/10" : "border-slate-200";
  return (
    <div className="absolute inset-0 z-40 flex items-start justify-center bg-slate-950/20 px-4 pt-20 backdrop-blur-[2px]">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onConfirm();
        }}
        className={cx("w-full max-w-xs rounded-2xl border p-4 shadow-2xl", border, isDark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-900")}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-base font-semibold">{title}</div>
          <button type="button" onClick={onClose} className={cx("flex h-8 w-8 items-center justify-center rounded-lg border", border)} aria-label="Bağla">
            <I.X className="h-4 w-4" />
          </button>
        </div>
        <input
          autoFocus
          type="number"
          min="1"
          max="200"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cx("h-11 w-full rounded-xl border px-3 text-lg font-semibold outline-none", border, isDark ? "bg-white/5" : "bg-white")}
        />
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={cx("h-10 rounded-xl border px-4 text-sm font-semibold", border)}>
            İmtina
          </button>
          <button type="submit" className="surface-primary h-10 rounded-xl px-4 text-sm font-semibold">
            Əlavə et
          </button>
        </div>
      </form>
    </div>
  );
}

function SaleModeConfirmDialog({
  currentMode,
  nextMode,
  hasStockChoice,
  isDark,
  onClose,
  onConfirm,
}: {
  currentMode: SaleMode;
  nextMode: SaleMode;
  hasStockChoice: boolean;
  isDark: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const border = isDark ? "border-white/10" : "border-slate-200";
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const modeLabel = (mode: SaleMode) => mode === "export" ? "İxracat" : "Adi satış";
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/30 px-4 backdrop-blur-sm">
      <div className={cx("w-full max-w-md rounded-[24px] border p-5 shadow-2xl", border, isDark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-900")}>
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600">
            <I.ArrowRight className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold">Satış rejimi dəyişdirilsin?</div>
            <p className={cx("mt-1 text-sm leading-6", muted)}>
              {modeLabel(currentMode)} rejimindən {modeLabel(nextMode)} rejiminə keçirsən.
              {hasStockChoice
                ? " Ağıllı stok seçimi və rezerv məlumatları sıfırlanacaq."
                : " Məhsul xətləri qalacaq, stok seçimi yenidən hesablanacaq."}
            </p>
          </div>
          <button type="button" onClick={onClose} className={cx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border", border, isDark ? "hover:bg-white/10" : "hover:bg-slate-50")} aria-label="Bağla">
            <I.X className="h-4 w-4" />
          </button>
        </div>
        <div className={cx("mt-5 rounded-2xl border p-3", border, isDark ? "bg-white/5" : "bg-slate-50/80")}>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className={muted}>Cari rejim</span>
            <span className="rounded-full bg-white px-3 py-1 font-semibold text-slate-700 shadow-sm">{modeLabel(currentMode)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3 text-sm">
            <span className={muted}>Yeni rejim</span>
            <span className="surface-primary rounded-full px-3 py-1 font-semibold shadow-sm">{modeLabel(nextMode)}</span>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className={cx("h-11 rounded-xl border px-4 text-sm font-semibold", border, isDark ? "hover:bg-white/10" : "hover:bg-slate-50")}>
            İmtina et
          </button>
          <button type="button" onClick={onConfirm} className="surface-primary h-11 rounded-xl px-5 text-sm font-semibold shadow-lg shadow-indigo-500/20">
            Dəyiş
          </button>
        </div>
      </div>
    </div>
  );
}

function UnsavedCloseDialog({
  isDark,
  onClose,
  onConfirm,
}: {
  isDark: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const border = isDark ? "border-white/10" : "border-slate-200";
  const panel = isDark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-900";
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/35 p-4 backdrop-blur-sm">
      <div className={cx("w-full max-w-md rounded-3xl border p-5 shadow-2xl", border, panel)}>
        <div className="flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500/12 text-amber-600">
            <I.X className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-semibold">Pəncərə bağlansın?</h3>
            <p className={cx("mt-1 text-sm leading-6", muted)}>
              Saxlanmamış dəyişikliklər, seçilmiş stok, ödəniş və ya xərc məlumatları itə bilər.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={cx("h-11 rounded-xl border px-4 text-sm font-semibold", border, isDark ? "hover:bg-white/10" : "hover:bg-slate-50")}>
            Davam et
          </button>
          <button type="button" onClick={onConfirm} className="h-11 rounded-xl bg-rose-500 px-5 text-sm font-semibold text-white shadow-lg shadow-rose-500/20">
            Bağla
          </button>
        </div>
      </div>
    </div>
  );
}

function DocumentStatusDropdown({
  value,
  onChange,
  isDark,
}: {
  value: DocumentWorkflowStatus;
  onChange: (value: DocumentWorkflowStatus) => void;
  isDark: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = documentStatusOptions.find((item) => item.id === value) ?? documentStatusOptions[1];
  const menu = isDark ? "border-white/10 bg-slate-900 text-slate-100 shadow-2xl" : "border-slate-200 bg-white text-slate-900 shadow-xl";
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={cx(
          "inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-sm font-semibold",
          isDark ? "border-white/10 bg-white/7 hover:bg-white/12" : "border-slate-200 bg-white hover:bg-slate-50"
        )}
      >
        <span className={cx("h-3 w-3 rounded-full", selected.dot)} />
        {selected.label}
        <I.Chevron className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <div className={cx("absolute left-0 top-[calc(100%+8px)] z-50 w-48 overflow-hidden rounded-xl border py-1", menu)}>
          <div className={cx("absolute -top-1 left-5 h-2 w-2 rotate-45 border-l border-t", isDark ? "border-white/10 bg-slate-900" : "border-slate-200 bg-white")} />
          {documentStatusOptions.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onChange(item.id);
                setOpen(false);
              }}
              className={cx(
                "flex h-11 w-full items-center gap-3 px-4 text-left text-sm transition",
                item.id === value ? (isDark ? "bg-white/10 font-semibold" : "bg-slate-100 font-semibold") : isDark ? "hover:bg-white/7" : "hover:bg-slate-50"
              )}
            >
              <span className={cx("h-3.5 w-3.5 rounded-full", item.dot)} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function StoreSelect({
  label,
  value,
  onChange,
  isDark,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  isDark: boolean;
  required?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-500">{label} {required && <span className="text-rose-500">*</span>}</span>
      <span className={cx("relative flex h-12 items-center rounded-xl border", isDark ? "border-white/10 bg-white/5" : "border-slate-200 bg-white")}>
        <span className="pointer-events-none absolute left-4 text-slate-400">☰</span>
        <select
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cx(
            "h-full w-full appearance-none rounded-xl bg-transparent pl-11 pr-10 text-lg font-semibold outline-none",
            isDark ? "text-slate-100" : "text-indigo-600"
          )}
        >
          {stores.map((store) => (
            <option key={store} value={store}>{store}</option>
          ))}
        </select>
        <I.Chevron className="pointer-events-none absolute right-4 h-4 w-4 text-slate-400" />
      </span>
    </label>
  );
}

function CounterpartySelect({
  label,
  value,
  options,
  onChange,
  isDark,
}: {
  label: string;
  value: string;
  options: ApiCounterparty[];
  onChange: (value: string) => void;
  isDark: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-slate-500">{label} <span className="text-rose-500">*</span></span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cx(
          "h-12 w-full rounded-xl border px-4 text-base font-semibold outline-none",
          isDark ? "border-white/10 bg-slate-950 text-slate-100" : "border-slate-200 bg-white text-slate-800"
        )}
      >
        <option value="">Seçin</option>
        {options.map((item) => (
          <option key={item.id} value={String(item.id)}>{item.name}</option>
        ))}
      </select>
    </label>
  );
}

const formatPanelMoney = (value: number) =>
  value.toLocaleString("az-Latn-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const formatPanelDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const months = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avqust", "sentyabr", "oktyabr", "noyabr", "dekabr"];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
};

function PurchaseLandedCostPanel({
  costs,
  total,
  unitTotal,
  isDark,
}: {
  costs: LandedCostAdjustment[];
  total: number;
  unitTotal: number;
  isDark: boolean;
}) {
  const border = isDark ? "border-white/10" : "border-slate-200";
  const soft = isDark ? "bg-white/7" : "bg-slate-50/90";
  const card = isDark ? "bg-slate-950/40" : "bg-white";
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  return (
    <section className={cx("mt-5 rounded-2xl border p-4", border, soft)}>
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-lg font-semibold">Çəkilən xərclər və maya</div>
          <p className={cx("mt-1 max-w-3xl text-sm leading-5", muted)}>
            Pul fəaliyyətində konteynerə bağlanan məxariclər burada alış sənədinin maya bölgüsü kimi görünür.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-[360px]">
          <div className={cx("rounded-xl border p-3", border, card)}>
            <div className={cx("text-xs font-semibold", muted)}>Cəmi xərc</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{formatPanelMoney(total)} ₼</div>
          </div>
          <div className={cx("rounded-xl border p-3", border, card)}>
            <div className={cx("text-xs font-semibold", muted)}>Vahid maya əlavəsi</div>
            <div className="mt-1 text-lg font-semibold tabular-nums">{unitTotal.toFixed(4)} ₼</div>
          </div>
        </div>
      </div>

      {costs.length === 0 ? (
        <div className={cx("rounded-xl border p-4 text-sm", border, card, muted)}>
          Bu alış sənədinə bağlı xərc yoxdur. Xərci Sənəd yarat &gt; Məxaric ilə yaradıb “Sənədə bağla” bölməsindən Maya xərci seçəndə burada görünəcək.
        </div>
      ) : (
        <div className={cx("overflow-hidden rounded-2xl border", border, card)}>
          <table className="w-full min-w-[980px] text-sm">
            <thead className={isDark ? "bg-white/5 text-slate-400" : "bg-slate-50 text-slate-500"}>
              <tr>
                <th className="px-4 py-3 text-left">Xərc sənədi</th>
                <th className="px-4 py-3 text-left">Tarix</th>
                <th className="px-4 py-3 text-left">Növ</th>
                <th className="px-4 py-3 text-left">Konteyner</th>
                <th className="px-4 py-3 text-right">Miqdar</th>
                <th className="px-4 py-3 text-right">Xərc payı</th>
                <th className="px-4 py-3 text-right">Vahid maya</th>
                <th className="px-4 py-3 text-left">Formula</th>
              </tr>
            </thead>
            <tbody>
              {costs.map((cost, index) => (
                <tr key={cost.id ?? index} className={cx("border-t", border)}>
                  <td className="px-4 py-3 font-semibold text-indigo-600">Məxaric #{String(cost.documentId ?? "").slice(0, 8)}</td>
                  <td className="px-4 py-3">{formatPanelDate(cost.documentDate)}</td>
                  <td className="px-4 py-3">{cost.category ?? "Maya xərci"}</td>
                  <td className="px-4 py-3 font-medium">{cost.containerNumber ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(cost.baseQty ?? 0).toLocaleString("az-Latn-AZ")}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatPanelMoney(Number(cost.amount ?? 0))} ₼</td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(cost.unitCost ?? 0).toFixed(4)} ₼</td>
                  <td className={cx("px-4 py-3 text-xs", muted)}>{cost.formula ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function BondedPurchasePanel({
  products,
  containers,
  summary,
  rollTotals,
  isDark,
  onAddContainer,
  onRemoveContainer,
  onUpdateContainer,
  onAddPallet,
  onUpdatePallet,
  onClonePallet,
  onAddRoll,
  onUpdateRoll,
  onRemoveRoll,
}: {
  products: ProductLine[];
  containers: ContainerDraft[];
  summary: { containerCount: number; palletCount: number; rollCount: number; qty: number; netKg: number; grossKg: number };
  rollTotals: Map<number, number>;
  isDark: boolean;
  onAddContainer: () => void;
  onRemoveContainer: (containerId: string) => void;
  onUpdateContainer: (containerId: string, patch: Partial<ContainerDraft>) => void;
  onAddPallet: (containerId: string) => void;
  onUpdatePallet: (containerId: string, palletId: string, patch: Partial<PalletDraft>) => void;
  onClonePallet: (containerId: string, palletId: string) => void;
  onAddRoll: (containerId: string, palletId: string) => void;
  onUpdateRoll: (containerId: string, palletId: string, rollId: string, patch: Partial<RollDraft>) => void;
  onRemoveRoll: (containerId: string, palletId: string, rollId: string) => void;
}) {
  const border = isDark ? "border-white/10" : "border-slate-200";
  const soft = isDark ? "bg-white/7" : "bg-slate-50/90";
  const card = isDark ? "bg-slate-950/40" : "bg-white";
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const input = cx("h-9 rounded-lg border px-2 text-sm outline-none", border, isDark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-800");
  const numericInput = cx(input, "w-24 text-right tabular-nums");

  return (
    <section className={cx("mt-5 rounded-2xl border p-4", border, soft)}>
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="text-lg font-semibold">Antrepo partiyası</div>
          <p className={cx("mt-1 max-w-3xl text-sm leading-5", muted)}>
            Alış bu rejimdə gömrük anbarına konteyner, palet və tam rulo pasportu ilə daxil olur. Sonra bu rulolar rezerv edilərək depoya çəkimə və ya ixraca gedəcək.
          </p>
        </div>
        <button type="button" onClick={onAddContainer} className="surface-primary h-10 rounded-xl px-4 text-sm font-semibold">
          Konteyner əlavə et
        </button>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Konteyner", summary.containerCount],
          ["Palet", summary.palletCount],
          ["Rulo", summary.rollCount],
          ["Miqdar", summary.qty],
          ["Net kg", summary.netKg],
          ["Gross kg", summary.grossKg],
        ].map(([label, value]) => (
          <div key={label} className={cx("rounded-xl border p-3", border, card)}>
            <div className={cx("text-xs font-semibold", muted)}>{label}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{Number(value).toLocaleString("az-Latn-AZ")}</div>
          </div>
        ))}
      </div>

      {products.length > 0 && (
        <div className={cx("mb-4 rounded-xl border p-3 text-sm", border, card)}>
          <div className="mb-2 font-semibold">Məhsul üzrə rulo toplamı</div>
          <div className="grid gap-2 md:grid-cols-2">
            {products.map((product) => (
              <div key={product.id} className={cx("flex items-center justify-between rounded-lg px-3 py-2", soft)}>
                <span className="min-w-0 truncate">{product.name}</span>
                <span className="font-semibold tabular-nums">{(rollTotals.get(product.id) ?? 0).toLocaleString("az-Latn-AZ")} {product.unit}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {containers.map((container, containerIndex) => (
          <div key={container.id} className={cx("rounded-2xl border p-3", border, card)}>
            <div className="mb-3 grid gap-3 lg:grid-cols-[1fr_1fr_170px_auto]">
              <label className="block">
                <span className={cx("mb-1 block text-xs font-semibold", muted)}>Konteyner</span>
                <input className={cx(input, "w-full")} value={container.number} onChange={(event) => onUpdateContainer(container.id, { number: event.target.value })} />
              </label>
              <label className="block">
                <span className={cx("mb-1 block text-xs font-semibold", muted)}>Invoice / BL</span>
                <input className={cx(input, "w-full")} value={container.invoice} onChange={(event) => onUpdateContainer(container.id, { invoice: event.target.value })} placeholder="INV-..." />
              </label>
              <label className="block">
                <span className={cx("mb-1 block text-xs font-semibold", muted)}>Gömrük statusu</span>
                <select className={cx(input, "w-full")} value={container.customsStatus} onChange={(event) => onUpdateContainer(container.id, { customsStatus: event.target.value as ContainerDraft["customsStatus"] })}>
                  <option value="bonded">Antrepo</option>
                  <option value="released">Sərbəst</option>
                </select>
              </label>
              <div className="flex items-end gap-2">
                <button type="button" onClick={() => onAddPallet(container.id)} className={cx("h-9 rounded-lg border px-3 text-sm font-semibold", border, isDark ? "hover:bg-white/10" : "hover:bg-slate-50")}>
                  Palet əlavə et
                </button>
                {containers.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveContainer(container.id)}
                    className={cx("flex h-9 w-9 items-center justify-center rounded-lg border text-rose-500", border, isDark ? "hover:bg-white/10" : "hover:bg-rose-50")}
                    aria-label="Konteyneri sil"
                    title="Konteyneri sil"
                  >
                    <I.Trash className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-3">
              {container.pallets.map((pallet, palletIndex) => (
                <div key={pallet.id} className={cx("rounded-xl border", border, soft)}>
                  <div className={cx("flex items-center justify-between border-b px-3 py-2", border)}>
                    <input
                      className={cx(input, "w-44 font-semibold")}
                      value={pallet.number}
                      onChange={(event) => onUpdatePallet(container.id, pallet.id, { number: event.target.value })}
                      placeholder={`Palet ${palletIndex + 1}`}
                    />
                    <div className="flex items-center gap-3">
                      <button type="button" onClick={() => onClonePallet(container.id, pallet.id)} className="text-sm font-semibold text-slate-500 hover:text-indigo-600">Kopyala</button>
                      <button type="button" onClick={() => onAddRoll(container.id, pallet.id)} className="text-sm font-semibold text-indigo-600">Rulo əlavə et</button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[940px] text-sm">
                      <thead className={isDark ? "text-slate-400" : "text-slate-500"}>
                        <tr>
                          <th className="px-3 py-2 text-left">Məhsul</th>
                          <th className="px-3 py-2 text-left">Rulo</th>
                          <th className="px-3 py-2 text-right">Uzunluq</th>
                          <th className="px-3 py-2 text-right">Qalınlıq</th>
                          <th className="px-3 py-2 text-right">Miqdar</th>
                          <th className="px-3 py-2 text-right">Net kg</th>
                          <th className="px-3 py-2 text-right">Gross kg</th>
                          <th className="px-3 py-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {pallet.rolls.map((roll) => (
                          <tr key={roll.id} className={cx("border-t", border)}>
                            <td className="px-3 py-2">
                              <select className={cx(input, "w-56")} value={roll.productId || products[0]?.id || ""} onChange={(event) => onUpdateRoll(container.id, pallet.id, roll.id, { productId: Number(event.target.value) })}>
                                {products.map((product) => (
                                  <option key={product.id} value={product.id}>{product.name}</option>
                                ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <input className={cx(input, "w-28")} value={roll.rollNo} onChange={(event) => onUpdateRoll(container.id, pallet.id, roll.id, { rollNo: event.target.value })} />
                            </td>
                            <td className="px-3 py-2 text-right"><input className={numericInput} value={roll.width} onChange={(event) => onUpdateRoll(container.id, pallet.id, roll.id, { width: event.target.value })} /></td>
                            <td className="px-3 py-2 text-right"><input className={numericInput} value={roll.thickness} onChange={(event) => onUpdateRoll(container.id, pallet.id, roll.id, { thickness: event.target.value })} /></td>
                            <td className="px-3 py-2 text-right"><input className={numericInput} value={roll.qty} onChange={(event) => onUpdateRoll(container.id, pallet.id, roll.id, { qty: event.target.value })} /></td>
                            <td className="px-3 py-2 text-right"><input className={numericInput} value={roll.netKg} onChange={(event) => onUpdateRoll(container.id, pallet.id, roll.id, { netKg: event.target.value })} /></td>
                            <td className="px-3 py-2 text-right"><input className={numericInput} value={roll.grossKg} onChange={(event) => onUpdateRoll(container.id, pallet.id, roll.id, { grossKg: event.target.value })} /></td>
                            <td className="px-3 py-2 text-right">
                              <button type="button" onClick={() => onRemoveRoll(container.id, pallet.id, roll.id)} className="text-rose-500">
                                <I.Trash className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
            <div className={cx("mt-3 text-xs", muted)}>Konteyner {containerIndex + 1}: sənəd keçəndə rulolar əvvəlcə antrepo/gömrük statusu ilə yaranacaq.</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function SelectedMovementStockPanel({
  selection,
  loading,
  isDark,
  onComplete,
  onChange,
  onClear,
}: {
  selection: MovementSuggestion;
  loading: boolean;
  isDark: boolean;
  onComplete: () => void;
  onChange: () => void;
  onClear: () => void;
}) {
  const border = isDark ? "border-white/10" : "border-slate-200";
  const soft = isDark ? "bg-white/5" : "bg-slate-50";
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  return (
    <section className={cx("mt-5 overflow-hidden rounded-2xl border", selection.incomplete ? "border-amber-300" : "border-emerald-300")}>
      <div className={cx("flex flex-col gap-3 border-b p-4 xl:flex-row xl:items-center xl:justify-between", border, soft)}>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold">Seçilmiş stok</h3>
            <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold", selection.incomplete ? "bg-amber-500/12 text-amber-700" : "bg-emerald-500/12 text-emerald-700")}>
              {selection.incomplete ? "Tamamlanmalıdır" : "Tələb qarşılanır"}
            </span>
          </div>
          <p className={cx("mt-1 text-xs", muted)}>Bu konkret palet və rulolar sənədlə birlikdə saxlanır və redaktədə dəyişmədən qalır.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {selection.incomplete && (
            <button type="button" onClick={onComplete} disabled={loading} className="surface-primary h-10 rounded-xl px-4 text-sm font-semibold">
              Çatışmayanı tamamla
            </button>
          )}
          <button type="button" onClick={onChange} disabled={loading} className={cx("h-10 rounded-xl border px-4 text-sm font-semibold", border)}>Seçimi dəyiş</button>
          <button type="button" onClick={onClear} className={cx("h-10 rounded-xl border px-4 text-sm font-semibold text-rose-600", border)}>Təmizlə</button>
        </div>
      </div>

      <div className="grid gap-3 p-3 lg:grid-cols-2">
        {selection.lines.map((line) => {
          const selected = line.mode === "fullPallet"
            ? `${line.selectedPalletCount ?? 0} palet · ${line.selectedQty} mt`
            : line.mode === "rollCount"
              ? `${line.selectedRollCount ?? 0} rulo · ${line.selectedQty} mt`
              : `${line.selectedQty} mt · ${line.selectedRollCount ?? 0} rulo`;
          const requested = line.mode === "fullPallet" ? `${line.qty} palet` : line.mode === "rollCount" ? `${line.qty} rulo` : `${line.qty} mt`;
          const shortage = line.mode === "fullPallet"
            ? `${line.shortagePalletCount ?? 0} palet`
            : line.mode === "rollCount"
              ? `${line.shortageRollCount ?? 0} rulo`
              : `${line.shortageQty ?? 0} mt`;
          return (
            <div key={line.productId} className={cx("rounded-xl border p-3", border, soft)}>
              <div className="flex items-start justify-between gap-3">
                <span className="font-semibold">{line.name}</span>
                <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold", line.complete ? "bg-emerald-500/12 text-emerald-700" : "bg-amber-500/12 text-amber-700")}>
                  {line.complete ? "Hazır" : `${shortage} çatmır`}
                </span>
              </div>
              <div className={cx("mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs", muted)}>
                <span>Tələb: <strong className={isDark ? "text-slate-200" : "text-slate-700"}>{requested}</strong></span>
                <span>Seçilib: <strong className={isDark ? "text-slate-200" : "text-slate-700"}>{selected}</strong></span>
              </div>
            </div>
          );
        })}
      </div>

      <details className={cx("border-t", border)}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">
          Mənbələri göstər · {selection.declarationCount} bəyannamə · {selection.palletCount} palet · {selection.rollCount} rulo
        </summary>
        <div className="grid max-h-80 gap-3 overflow-auto px-3 pb-3 xl:grid-cols-2">
          {selection.containers.map((container) => (
            <div key={container.key} className={cx("rounded-xl border p-3", border, soft)}>
              <div className="flex items-center justify-between gap-3 text-sm font-semibold">
                <span>{container.declaration || container.number}</span>
                <span>{container.selectedQty} mt</span>
              </div>
              <div className={cx("mt-1 text-xs", muted)}>{container.number} · {container.palletCount} palet · {container.rollCount} rulo</div>
              {container.pallets.map((pallet) => (
                <div key={pallet.id} className={cx("mt-3 border-t pt-2", border)}>
                  <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                    <span>{pallet.number}</span>
                    <span className={muted}>{pallet.rollCount} rulo · {pallet.selectedQty} mt</span>
                  </div>
                  <div className={cx("mt-1 text-xs leading-5", muted)}>
                    {pallet.rolls.map((roll) => `${roll.rollNo || "Rulo"} · ${roll.qty} mt`).join("  |  ")}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}

function MovementSuggestionPanel({
  suggestions,
  selectedSuggestionId,
  action,
  hasSelection,
  loading,
  isDark,
  onFind,
  onSelect,
}: {
  suggestions: MovementSuggestion[];
  selectedSuggestionId: string;
  action: MovementSuggestionAction;
  hasSelection: boolean;
  loading: boolean;
  isDark: boolean;
  onFind: () => void;
  onSelect: (suggestion: MovementSuggestion) => void;
}) {
  const border = isDark ? "border-white/10" : "border-slate-200";
  const soft = isDark ? "bg-white/5" : "bg-slate-50";
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  return (
    <section className={cx("mt-5 overflow-hidden rounded-2xl border", border)}>
      <div className={cx("flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center lg:justify-between", border, soft)}>
        <div>
          <h3 className="font-semibold">Ağıllı stok seçimi</h3>
          <p className={cx("mt-1 text-xs", muted)}>
            Hər məhsul üçün tələb olunan metr, palet və ya rulo sayına görə ən uyğun stok seçilir.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onFind} disabled={loading} className={cx("surface-primary h-11 rounded-xl px-4 text-sm font-semibold", loading && "opacity-60")}>
            {loading ? "Hesablanır..." : hasSelection ? "Hamısını yenidən hesabla" : "Ən yaxşı variantları tap"}
          </button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="grid gap-3 p-3 xl:grid-cols-3">
          {suggestions.map((suggestion) => {
            const selected = selectedSuggestionId === suggestion.id;
            return (
              <article key={suggestion.id} className={cx("overflow-hidden rounded-xl border", selected ? "border-indigo-500 ring-2 ring-indigo-500/15" : border)}>
                <div className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-semibold">{suggestion.title}</h4>
                        {suggestion.recommended && <span className="rounded-full bg-emerald-500/12 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Tövsiyə</span>}
                        {suggestion.incomplete && <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Qismən</span>}
                      </div>
                      <p className={cx("mt-1 text-xs", muted)}>{suggestion.reason}</p>
                    </div>
                    {suggestion.overage > 0 && <span className={cx("shrink-0 rounded-lg px-2 py-1 text-xs font-semibold", isDark ? "bg-white/8" : "bg-slate-100")}>+{suggestion.overage} mt</span>}
                  </div>
                  <div className={cx("mt-3 space-y-1 rounded-lg px-2.5 py-2 text-xs", soft)}>
                    {suggestion.lines.map((line) => {
                      const shortage = line.mode === "fullPallet"
                        ? `${line.shortagePalletCount ?? 0} palet çatmır`
                        : line.mode === "rollCount"
                          ? `${line.shortageRollCount ?? 0} rulo çatmır`
                          : `${line.shortageQty ?? 0} mt çatmır`;
                      return (
                        <div key={line.productId} className="flex items-start justify-between gap-3">
                          <span className="truncate">{line.name}</span>
                          <span className="shrink-0 text-right font-semibold">
                            <span className="block">
                              {line.mode === "fullPallet"
                                ? `${line.qty} palet → ${line.selectedPalletCount ?? 0} palet · ${line.selectedQty} mt`
                                : line.mode === "rollCount"
                                  ? `${line.qty} rulo → ${line.selectedRollCount ?? 0} rulo · ${line.selectedQty} mt`
                                  : `${line.qty} mt → ${line.selectedQty} mt`}
                            </span>
                            {!line.complete && <span className="mt-0.5 block text-[11px] font-medium text-amber-700">{shortage}</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-1 text-center">
                    {[
                      ["Bəyannamə", suggestion.declarationCount],
                      ["Konteyner", suggestion.containerCount],
                      ["Palet", suggestion.palletCount],
                      ["Rulo", suggestion.rollCount],
                    ].map(([label, value]) => (
                      <div key={String(label)} className={cx("rounded-lg px-1 py-2", soft)}>
                        <div className="text-sm font-semibold">{value}</div>
                        <div className={cx("mt-0.5 text-[10px]", muted)}>{label}</div>
                      </div>
                    ))}
                  </div>
                  <button type="button" onClick={() => onSelect(suggestion)} className={cx("mt-3 h-9 w-full rounded-lg border text-sm font-semibold", selected ? "border-indigo-600 bg-indigo-600 text-white" : border)}>
                    {selected ? "Seçilib" : action === "append" ? "Bu əlavəni seç" : "Bu variantı seç"}
                  </button>
                </div>
                <details className={cx("border-t", border)}>
                  <summary className="cursor-pointer px-3 py-2 text-xs font-semibold">Palet və ruloları göstər</summary>
                  <div className="max-h-60 space-y-2 overflow-auto px-3 pb-3">
                    {suggestion.containers.map((container) => (
                      <div key={container.key} className={cx("rounded-lg border p-2", border, soft)}>
                        <div className="flex items-center justify-between gap-2 text-xs font-semibold">
                          <span className="truncate">{container.declaration || container.number}</span>
                          <span>{container.selectedQty} mt</span>
                        </div>
                        {container.pallets.map((pallet) => (
                          <div key={pallet.id} className={cx("mt-2 border-t pt-2 text-xs", border)}>
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">{pallet.number}</span>
                              <span className={muted}>{pallet.status === "closed" ? "Bağlı" : pallet.mixed ? "Açıq · qarışıq" : "Açıq"} · {pallet.rollCount} rulo</span>
                            </div>
                            <div className={cx("mt-1 leading-5", muted)}>
                              {pallet.rolls.map((roll) => `${roll.rollNo || "Rulo"} · ${roll.qty} mt`).join("  |  ")}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </details>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function ProductDocumentTable({
  kind,
  rows,
  isDark,
  stockSelection,
  selectedQuantities,
  movementFromAccount,
  movementToAccount,
  onRemove,
  onUpdate,
}: {
  kind: DocumentCreateKind;
  rows: ProductLine[];
  isDark: boolean;
  stockSelection?: boolean;
  selectedQuantities?: Map<number, number>;
  movementFromAccount?: string;
  movementToAccount?: string;
  onRemove: (id: number) => void;
  onUpdate: (id: number, patch: Partial<ProductLine>) => void;
}) {
  const border = isDark ? "border-white/10" : "border-slate-200";
  const isInventory = kind === "inventory";
  const isMovement = kind === "movement";
  const isStockSelection = isMovement || Boolean(stockSelection);
  return (
    <div className={cx("overflow-hidden rounded-2xl border", border)}>
      <table className="w-full min-w-[980px] text-sm">
        <thead className={isDark ? "bg-white/5 text-slate-400" : "bg-slate-50 text-slate-500"}>
          <tr>
            <th className="px-4 py-3 text-left">#</th>
            <th className="px-4 py-3 text-left">Ad</th>
            <th className="px-4 py-3 text-left">Ölçü vahidi</th>
            {isStockSelection ? (
              <>
                <th className="px-4 py-3 text-right">{movementFromAccount || "Mənbə"}</th>
                <th className="px-4 py-3 text-right">Tələb</th>
                {isMovement ? (
                  <th className="px-4 py-3 text-right">{movementToAccount || "Təyinat"}</th>
                ) : (
                  <>
                    <th className="px-4 py-3 text-right">Qiymət</th>
                    <th className="px-4 py-3 text-right">Endirim</th>
                    <th className="px-4 py-3 text-right">Ümumi nəticə</th>
                  </>
                )}
              </>
            ) : isInventory ? <><th className="px-4 py-3 text-right">Təxmini qalıq</th><th className="px-4 py-3 text-right">Faktiki qalıq</th><th className="px-4 py-3 text-right">Fərq</th></> : <><th className="px-4 py-3 text-right">Miqdar</th><th className="px-4 py-3 text-right">Qiymət</th><th className="px-4 py-3 text-right">Endirim</th><th className="px-4 py-3 text-right">Ümumi nəticə</th></>}
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const effectiveQty = selectedQuantities?.get(row.id) ?? row.qty ?? 1;
            return (
            <tr key={row.id} className={cx("border-t", border)}>
              <td className="px-4 py-3">{index + 1}</td>
              <td className="px-4 py-3 font-medium text-indigo-600"><span className="inline-flex items-center gap-2"><I.Box className="h-4 w-4 text-slate-400" />{row.name}</span></td>
              <td className="px-4 py-3">{row.unit}</td>
              {isStockSelection ? (
                <>
                  <td className="px-4 py-3 text-right">{movementFromAccount?.toLowerCase().includes("antrepo") ? row.warehouses?.antrepo ?? row.stock : row.warehouses?.depo ?? row.stock}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={row.qty ?? 1}
                        onChange={(event) => onUpdate(row.id, { qty: Number(event.target.value) || 1 })}
                        className="h-9 w-20 border-0 bg-transparent px-2 text-right tabular-nums outline-none focus:bg-indigo-50"
                      />
                      <select
                        value={row.movementMode ?? "meters"}
                        onChange={(event) => onUpdate(row.id, { movementMode: event.target.value as MovementSelectionMode, qty: 1 })}
                        className="h-9 border-0 border-l border-slate-200 bg-slate-50 px-2 text-xs font-semibold text-slate-700 outline-none"
                      >
                        <option value="meters">mt</option>
                        <option value="fullPallet">palet</option>
                        <option value="rollCount">rulo</option>
                      </select>
                    </span>
                  </td>
                  {isMovement ? (
                    <td className="px-4 py-3 text-right">{movementToAccount?.toLowerCase().includes("antrepo") ? row.warehouses?.antrepo ?? 0 : row.warehouses?.depo ?? 0}</td>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-right">
                        <NumberCell
                          value={row.price}
                          onChange={(value) => onUpdate(row.id, {
                            price: value,
                            priceSource: ["sale", "saleReturn"].includes(kind) ? "Əllə dəyişdirilib" : row.priceSource,
                          })}
                          step="0.01"
                        />
                        {["sale", "saleReturn"].includes(kind) && row.priceSource && (
                          <div className={cx("mt-1 whitespace-nowrap text-[10px]", row.priceSource === "Müştəri qiyməti" ? "text-indigo-600" : "text-slate-400")}>
                            {row.priceSource}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <NumberCell value={row.discount ?? 0} onChange={(value) => onUpdate(row.id, { discount: value })} step="0.01" />
                      </td>
                      <td className="px-4 py-3 text-right font-semibold">{Math.max(0, effectiveQty * row.price - (row.discount ?? 0)).toFixed(2)}</td>
                    </>
                  )}
                </>
              ) : isInventory ? (
                <>
                  <td className="px-4 py-3 text-right">{row.stock}</td>
                  <td className="bg-amber-50 px-4 py-3 text-right">
                    <NumberCell value={row.qty ?? 0} onChange={(value) => onUpdate(row.id, { qty: value })} />
                  </td>
                  <td className="px-4 py-3 text-right text-rose-600">{(row.qty ?? 0) - row.stock}</td>
                </>
              ) : (
                <>
                  <td className="bg-amber-50 px-4 py-3 text-right">
                    <NumberCell value={row.qty ?? 1} onChange={(value) => onUpdate(row.id, { qty: value })} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <NumberCell
                      value={row.price}
                      onChange={(value) => onUpdate(row.id, {
                        price: value,
                        priceSource: ["sale", "saleReturn"].includes(kind) ? "Əllə dəyişdirilib" : row.priceSource,
                      })}
                      step="0.01"
                    />
                    {["sale", "saleReturn"].includes(kind) && row.priceSource && (
                      <div className={cx("mt-1 whitespace-nowrap text-[10px]", row.priceSource === "Müştəri qiyməti" ? "text-indigo-600" : "text-slate-400")}>
                        {row.priceSource}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <NumberCell value={row.discount ?? 0} onChange={(value) => onUpdate(row.id, { discount: value })} step="0.01" />
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{Math.max(0, (row.qty ?? 1) * row.price - (row.discount ?? 0)).toFixed(2)}</td>
                </>
              )}
              <td className="px-4 py-3 text-right"><button type="button" onClick={() => onRemove(row.id)} className="text-rose-500"><I.Trash className="h-4 w-4" /></button></td>
            </tr>
          );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NumberCell({
  value,
  onChange,
  step = "1",
}: {
  value: number;
  onChange: (value: number) => void;
  step?: string;
}) {
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

function Totals({ kind, count, movementQty, total, isDark }: { kind: DocumentCreateKind; count: number; movementQty?: number; total: number; isDark: boolean }) {
  const showMoney = !["inventory", "writeOff", "movement"].includes(kind);
  return (
    <div className="mt-8 w-full space-y-4">
      <h3 className="text-2xl font-semibold">{kind === "inventory" ? "Ümumi nəticə" : "Ümumi nəticə:"}</h3>
      <TotalLine label={kind === "inventory" ? "Cəmi mövqe sayı" : "Mövqe sayı"} value={String(count)} />
      {showMoney && (
        <>
          <TotalLine label="Ödənilənlər" value="0.00 ₼" />
          <TotalLine label="Vergilər" value="0.00 ₼" />
          <TotalLine label="Sənəd üzrə endirim" value="0%" />
          <TotalLine label="Ümumi endirim" value="% (0.00 ₼)" />
          <TotalLine label="Yekun" value={`${total.toFixed(2)} ₼`} strong />
        </>
      )}
      {kind === "inventory" && (
        <>
          <TotalLine label="Mövqelər hesablanmayıb" value="0" />
          <TotalLine label="Uyğun gəlməyən mövqelərin sayı" value={String(count)} />
          <TotalLine label="Təxmini məbləğ" value="0.00 ₼" />
          <TotalLine label="Faktiki məbləğ" value="0.00 ₼" />
        </>
      )}
      {kind === "movement" && <TotalLine label="Köçürüləcək miqdar" value={String(movementQty ?? 0)} strong />}
      {kind === "writeOff" && <TotalLine label="Silinən mövqe sayı" value={String(count)} strong />}
      <div className={cx("h-px", isDark ? "bg-white/10" : "bg-slate-100")} />
    </div>
  );
}

function TotalLine({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="grid w-full grid-cols-[max-content_minmax(40px,1fr)_max-content] items-center gap-3">
      <span className="text-lg text-slate-600">{label}</span>
      <span className="border-b border-dotted border-slate-200" />
      <span className={cx("justify-self-end text-right text-lg tabular-nums", strong && "text-2xl font-semibold")}>{value}</span>
    </div>
  );
}

function PaymentTab({
  kind,
  isDark,
  total,
  account,
  method,
  paidAmount,
  note,
  payments,
  status,
  remaining,
  onAccountChange,
  onMethodChange,
  onPaidAmountChange,
  onNoteChange,
  onAddPayment,
  onRemovePayment,
}: {
  kind: DocumentCreateKind;
  isDark: boolean;
  total: number;
  counterpartyName: string;
  account: string;
  method: string;
  paidAmount: string;
  note: string;
  payments: NonNullable<ApiDocumentDraft["payments"]>;
  status: string;
  remaining: number;
  onAccountChange: (value: string) => void;
  onMethodChange: (value: string) => void;
  onPaidAmountChange: (value: string) => void;
  onNoteChange: (value: string) => void;
  onAddPayment: () => boolean;
  onRemovePayment: (index: number) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const border = isDark ? "border-white/10" : "border-slate-200";
  const soft = isDark ? "bg-white/7" : "bg-slate-50/90";
  const card = isDark ? "bg-slate-950/35" : "bg-white";
  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const input = cx("h-12 w-full rounded-xl border px-4 text-base font-semibold outline-none", border, isDark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-800");
  const paid = Math.max(0, toDraftNumber(paidAmount));
  const paidTotal = payments.reduce((sum, payment) => sum + Math.max(0, Number(payment.amount ?? 0)), 0);
  const direction = ["sale", "purchaseReturn"].includes(kind) ? "in" : "out";
  const isStockPayment = ["sale", "saleReturn", "purchase", "purchaseReturn"].includes(kind);
  const debtLabel = ["sale", "saleReturn"].includes(kind) ? "Müştəri borcu" : "Təchizatçı borcu";
  const statusTone = status === "Tam ödənilib"
    ? "bg-emerald-500/12 text-emerald-600"
    : status === "Qismən ödənilib"
      ? "bg-amber-500/12 text-amber-600"
      : "bg-slate-500/12 text-slate-500";

  if (!isStockPayment) {
    return (
      <div className={cx("rounded-2xl border p-5 text-sm", border, soft, muted)}>
        Bu sənəd növündə pul hərəkəti yoxdur. Ödəniş bölməsi satış, alış və geri qaytarma sənədləri üçün istifadə edilir.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 md:grid-cols-4">
        <PaymentMetric label="Sənəd yekunu" value={`${total.toFixed(2)} ₼`} isDark={isDark} />
        <PaymentMetric label="Ödənilib" value={`${paidTotal.toFixed(2)} ₼`} isDark={isDark} />
        <PaymentMetric label="Qalıq" value={`${remaining.toFixed(2)} ₼`} isDark={isDark} strong={remaining > 0} />
        <div className={cx("rounded-2xl border p-4", border, card)}>
          <div className={cx("text-xs font-semibold", muted)}>Ödəniş statusu</div>
          <div className={cx("mt-3 inline-flex rounded-full px-3 py-1.5 text-sm font-semibold", statusTone)}>{status}</div>
        </div>
      </div>

      <section className={cx("rounded-2xl border p-4", border, soft)}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="text-lg font-semibold">Edilən ödənişlər</div>
            <p className={cx("mt-1 text-sm", muted)}>
              Hər ödəniş Pul fəaliyyətində ayrıca {direction === "in" ? "mədaxil" : "məxaric"} kimi görünəcək.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFormOpen((value) => !value)}
            className={cx("h-10 rounded-xl px-4 text-sm font-semibold", formOpen ? "border border-indigo-300 text-indigo-600" : "surface-primary")}
          >
            {formOpen ? "Bağla" : "+ Ödəniş əlavə et"}
          </button>
        </div>

        {formOpen && (
          <div className={cx("mt-4 rounded-2xl border p-4", border, card)}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="font-semibold">Yeni ödəniş</div>
              <button
                type="button"
                onClick={() => onPaidAmountChange(remaining.toFixed(2))}
                disabled={remaining <= 0}
                className={cx("h-9 rounded-xl border px-3 text-sm font-semibold text-indigo-600 disabled:cursor-not-allowed disabled:opacity-40", border)}
              >
                Tam ödə
              </button>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-500">Hesab <span className="text-rose-500">*</span></span>
                <select value={account} onChange={(event) => onAccountChange(event.target.value)} className={input}>
                  {accounts.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-500">Ödəniş üsulu</span>
                <select value={method} onChange={(event) => onMethodChange(event.target.value)} className={input}>
                  {["Nağd", "Bank", "Kart", "Online", "Daxili"].map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-500">Ödənilən məbləğ</span>
                <input
                  type="number"
                  min="0"
                  max={remaining}
                  step="0.01"
                  value={paidAmount}
                  onChange={(event) => onPaidAmountChange(event.target.value)}
                  className={cx(input, "text-right text-lg tabular-nums")}
                />
              </label>
              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-500">{debtLabel}</span>
                <div className={cx("flex h-12 items-center justify-end rounded-xl border px-4 text-lg font-semibold tabular-nums", border, card, remaining > 0 ? "text-amber-600" : "text-emerald-600")}>
                  {remaining.toFixed(2)} ₼
                </div>
              </label>
            </div>
            <label className="mt-4 block">
              <span className="mb-2 block text-sm font-semibold text-slate-500">Ödəniş qeydi</span>
              <textarea
                value={note}
                onChange={(event) => onNoteChange(event.target.value)}
                placeholder="Məsələn: avans, bank köçürməsi, təchizatçıya qismən ödəniş..."
                className={cx("h-20 w-full rounded-xl border p-3 text-sm outline-none", border, isDark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-800")}
              />
            </label>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  if (onAddPayment()) setFormOpen(false);
                }}
                disabled={paid <= 0 || remaining <= 0}
                className="surface-primary h-10 rounded-xl px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"
              >
                Əlavə et
              </button>
            </div>
          </div>
        )}

        {payments.length === 0 ? (
          <div className={cx("mt-4 rounded-xl border p-4 text-sm", border, card, muted)}>
            Hələ ödəniş əlavə edilməyib.
          </div>
        ) : (
          <div className={cx("mt-4 overflow-auto rounded-2xl border", border, card)}>
            <table className="w-full min-w-[820px] text-sm">
              <thead className={isDark ? "bg-white/5 text-slate-400" : "bg-slate-50 text-slate-500"}>
                <tr>
                  <th className="px-4 py-3 text-left">Ödəniş</th>
                  <th className="px-4 py-3 text-left">Tarix</th>
                  <th className="px-4 py-3 text-left">Hesab</th>
                  <th className="px-4 py-3 text-left">Üsul</th>
                  <th className="px-4 py-3 text-left">Qeyd</th>
                  <th className="px-4 py-3 text-right">Məbləğ</th>
                  <th className="w-14 px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {payments.map((payment, index) => (
                  <tr key={`${payment.date ?? "payment"}-${index}`} className={cx("border-t", border)}>
                    <td className="px-4 py-3">
                      <span className={cx("rounded-full px-2.5 py-1 text-xs font-semibold", direction === "in" ? "bg-emerald-500/12 text-emerald-600" : "bg-rose-500/12 text-rose-600")}>
                        {direction === "in" ? "Mədaxil" : "Məxaric"} #{index + 1}
                      </span>
                    </td>
                    <td className="px-4 py-3">{formatPanelDate(payment.date)}</td>
                    <td className="px-4 py-3 font-medium">{payment.account ?? "—"}</td>
                    <td className="px-4 py-3">{payment.method ?? "—"}</td>
                    <td className={cx("max-w-[260px] truncate px-4 py-3", muted)}>{payment.note || "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatPanelMoney(Number(payment.amount ?? 0))} ₼</td>
                    <td className="px-3 py-3 text-right">
                      <button type="button" onClick={() => onRemovePayment(index)} className="flex h-8 w-8 items-center justify-center rounded-lg text-rose-500 hover:bg-rose-500/10" aria-label="Ödənişi sil">
                        <I.X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className={cx("mt-3 text-xs", muted)}>
          Yol, gömrük, antrepo və digər maya xərcləri ayrıca “Çəkilən xərclər / Maya” tabında izlənir.
        </div>
      </section>
    </div>
  );
}

function PaymentMetric({ label, value, isDark, strong }: { label: string; value: string; isDark: boolean; strong?: boolean }) {
  return (
    <div className={cx("rounded-2xl border p-4", isDark ? "border-white/10 bg-slate-950/35" : "border-slate-200 bg-white")}>
      <div className={cx("text-xs font-semibold", isDark ? "text-slate-400" : "text-slate-500")}>{label}</div>
      <div className={cx("mt-2 text-xl tabular-nums", strong ? "font-semibold text-amber-600" : "font-semibold")}>{value}</div>
    </div>
  );
}

function MoneyForm({
  kind,
  isDark,
  account,
  target,
  category,
  method,
  amount,
  comment,
  costLinkEnabled,
  documentLinkType,
  linkedDocumentId,
  linkDocumentOptions,
  costCategory,
  costContainerKeys,
  costContainerOptions,
  costPreview,
  onAccountChange,
  onTargetChange,
  onCategoryChange,
  onMethodChange,
  onAmountChange,
  onCommentChange,
  onCostLinkEnabledChange,
  onDocumentLinkTypeChange,
  onLinkedDocumentIdChange,
  onCostCategoryChange,
  onCostContainerKeysChange,
}: {
  kind: DocumentCreateKind;
  isDark: boolean;
  account: string;
  target: string;
  category: string;
  method: string;
  amount: string;
  comment: string;
  costLinkEnabled: boolean;
  documentLinkType: DocumentLinkType;
  linkedDocumentId: string;
  linkDocumentOptions: LinkDocumentOption[];
  costCategory: string;
  costContainerKeys: string[];
  costContainerOptions: CostContainerOption[];
  costPreview: { amount: number; qty: number; unit: number };
  onAccountChange: (value: string) => void;
  onTargetChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onMethodChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onCommentChange: (value: string) => void;
  onCostLinkEnabledChange: (value: boolean) => void;
  onDocumentLinkTypeChange: (value: DocumentLinkType) => void;
  onLinkedDocumentIdChange: (value: string) => void;
  onCostCategoryChange: (value: string) => void;
  onCostContainerKeysChange: (value: string[]) => void;
}) {
  const border = isDark ? "border-white/10" : "border-slate-200";
  const soft = isDark ? "bg-white/7" : "bg-slate-50/90";
  const input = cx("h-12 w-full rounded-xl border px-4 text-base font-semibold outline-none", border, isDark ? "bg-slate-950 text-slate-100" : "bg-white text-slate-800");
  const subtle = isDark ? "text-slate-400" : "text-slate-500";
  const fromTo = kind === "cashTransfer";
  const isExpense = kind === "cashOut";
  const visibleLinkDocuments = linkDocumentOptions.filter((document) => matchesDocumentLinkType(document, documentLinkType));
  const selectedLinkedDocument = visibleLinkDocuments.find((document) => document.id === linkedDocumentId);
  const visibleCostContainers = costContainerOptions.filter((container) => !linkedDocumentId || container.documentId === linkedDocumentId);
  const paymentCategories = isExpense
    ? ["Təchizatçı ödənişi", "Nəqliyyat", "Gömrük/vergi", "Antrepo saxlama", "Broker xidməti", "Digər xərc"]
    : ["Satış ödənişi", "Avans", "Qaytarma", "Digər mədaxil"];
  const costCategories = ["Nəqliyyat", "Gömrük/vergi", "Antrepo saxlama", "Broker xidməti", "Sığorta", "Digər xərc"];
  const toggleContainer = (key: string) => {
    onCostContainerKeysChange(costContainerKeys.includes(key) ? costContainerKeys.filter((item) => item !== key) : [...costContainerKeys, key]);
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-500">{fromTo ? "Hesabdan" : "Hesab"} <span className="text-rose-500">*</span></span>
          <select value={account} onChange={(event) => onAccountChange(event.target.value)} className={input}>
            {accounts.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-sm font-semibold text-slate-500">{fromTo ? "Hesaba" : "Kontragent"} <span className="text-rose-500">*</span></span>
          <input value={target} onChange={(event) => onTargetChange(event.target.value)} placeholder="daxil edin" className={input} />
        </label>
      </div>

      {!fromTo && (
        <div className="grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-500">Ödəniş kateqoriyası <span className="text-rose-500">*</span></span>
            <select value={category} onChange={(event) => onCategoryChange(event.target.value)} className={input}>
              <option value="">daxil edin</option>
              {paymentCategories.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-slate-500">Ödəniş üsulu</span>
            <select value={method} onChange={(event) => onMethodChange(event.target.value)} className={input}>
              {['Bank', 'Nağd', 'Kart', 'Daxili'].map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
          </label>
        </div>
      )}

      <label className="block">
        <span className="mb-2 block text-sm font-semibold text-slate-500">Məbləğ, ₼ <span className="text-rose-500">*</span></span>
        <input type="number" min="0" step="0.01" value={amount} onChange={(event) => onAmountChange(event.target.value)} className={cx(input, "text-right text-lg tabular-nums")} />
      </label>

      {!fromTo && (
        <section className={cx("rounded-2xl border p-4", border, soft)}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="text-lg font-semibold">Sənədlə əlaqələndir</div>
              <p className={cx("mt-1 max-w-3xl text-sm leading-5", subtle)}>
                Borc ödənişi sənədin qalıq borcunu azaldır. Antrepo və depoya düşüm xərcləri isə aid olduqları partiyanın mayasına ayrıca əlavə edilir.
              </p>
            </div>
            <button type="button" onClick={() => onCostLinkEnabledChange(!costLinkEnabled)} className={cx("inline-flex h-10 items-center gap-3 rounded-xl border px-4 text-sm font-semibold", border, costLinkEnabled ? "bg-indigo-600 text-white" : isDark ? "bg-white/5" : "bg-white")}> 
              <span className={cx("h-3 w-3 rounded-full", costLinkEnabled ? "bg-white" : "bg-slate-300")} />
              {costLinkEnabled ? "Əlaqələndirilib" : "Sənədə bağla"}
            </button>
          </div>

          {costLinkEnabled && (
            <div className="mt-4 space-y-4">
              <div className={cx("grid gap-2 rounded-2xl border p-2 lg:grid-cols-3", border, isDark ? "bg-slate-950/35" : "bg-white")}>
                <button type="button" onClick={() => onDocumentLinkTypeChange("debtPayment")} className={cx("rounded-xl px-4 py-3 text-left transition", documentLinkType === "debtPayment" ? "bg-indigo-600 text-white" : isDark ? "hover:bg-white/7" : "hover:bg-slate-50")}>
                  <span className="block font-semibold">Borc ödənişi</span>
                  <span className={cx("mt-1 block text-xs", documentLinkType === "debtPayment" ? "text-indigo-100" : subtle)}>Sənədin qalıq borcunu azaldır, mayanı dəyişmir.</span>
                </button>
                <button type="button" disabled={!isExpense} onClick={() => onDocumentLinkTypeChange("landedCost")} className={cx("rounded-xl px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40", documentLinkType === "landedCost" ? "bg-indigo-600 text-white" : isDark ? "hover:bg-white/7" : "hover:bg-slate-50")}>
                  <span className="block font-semibold">Antrepo xərci</span>
                  <span className={cx("mt-1 block text-xs", documentLinkType === "landedCost" ? "text-indigo-100" : subtle)}>Tarixdə qalan alış partiyasının mayasına əlavə edir.</span>
                </button>
                <button type="button" disabled={!isExpense} onClick={() => onDocumentLinkTypeChange("movementCost")} className={cx("rounded-xl px-4 py-3 text-left transition disabled:cursor-not-allowed disabled:opacity-40", documentLinkType === "movementCost" ? "bg-indigo-600 text-white" : isDark ? "hover:bg-white/7" : "hover:bg-slate-50")}>
                  <span className="block font-semibold">Depoya düşüm xərci</span>
                  <span className={cx("mt-1 block text-xs", documentLinkType === "movementCost" ? "text-indigo-100" : subtle)}>Konkret yerdəyişmə ilə yaranan depo partiyasına əlavə edir.</span>
                </button>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-semibold text-slate-500">Sənəd seçimi <span className="text-rose-500">*</span></span>
                <select value={linkedDocumentId} onChange={(event) => onLinkedDocumentIdChange(event.target.value)} className={input}>
                  <option value="">Sənəd seçin</option>
                  {visibleLinkDocuments.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.title} · {document.counterparty || "Kontragent yoxdur"}{document.type === "movement" ? ` · ${document.qty.toLocaleString('az-Latn-AZ')} miqdar` : ` · Qalıq ${document.remaining.toFixed(2)} ₼`}
                    </option>
                  ))}
                </select>
              </label>

              {selectedLinkedDocument && documentLinkType === "debtPayment" && (
                <div className={cx("grid gap-3 rounded-2xl border p-4 sm:grid-cols-3", border, isDark ? "bg-slate-950/35" : "bg-white")}>
                  <PaymentMetric label="Sənəd yekunu" value={`${selectedLinkedDocument.total.toFixed(2)} ₼`} isDark={isDark} />
                  <PaymentMetric label="Ödənilib" value={`${selectedLinkedDocument.paid.toFixed(2)} ₼`} isDark={isDark} />
                  <PaymentMetric label="Qalıq borc" value={`${selectedLinkedDocument.remaining.toFixed(2)} ₼`} isDark={isDark} strong />
                </div>
              )}

              {(documentLinkType === "landedCost" || documentLinkType === "movementCost") && (
                <>
                  <label className="block max-w-md">
                    <span className="mb-2 block text-sm font-semibold text-slate-500">Xərc növü</span>
                    <select value={costCategory} onChange={(event) => onCostCategoryChange(event.target.value)} className={input}>
                      {costCategories.map((item) => <option key={item} value={item}>{item}</option>)}
                    </select>
                  </label>

                  <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px]">
                    {documentLinkType === "landedCost" ? (
                      <div className={cx("max-h-64 overflow-auto rounded-2xl border", border, isDark ? "bg-slate-950/35" : "bg-white")}>
                        {!linkedDocumentId ? (
                          <div className={cx("p-4 text-sm", subtle)}>Əvvəlcə alış sənədini seç.</div>
                        ) : visibleCostContainers.length === 0 ? (
                          <div className={cx("p-4 text-sm", subtle)}>Bu sənəddə konteyner tapılmadı.</div>
                        ) : visibleCostContainers.map((container) => (
                        <button
                          key={container.key}
                          type="button"
                          onClick={() => toggleContainer(container.key)}
                          className={cx("flex w-full items-center gap-3 border-b px-4 py-3 text-left transition last:border-b-0", border, costContainerKeys.includes(container.key) ? "bg-indigo-500/10" : isDark ? "hover:bg-white/5" : "hover:bg-slate-50")}
                        >
                          <span className={cx("flex h-5 w-5 shrink-0 items-center justify-center rounded-md border", costContainerKeys.includes(container.key) ? "border-indigo-600 bg-indigo-600 text-white" : border)}>
                            {costContainerKeys.includes(container.key) && <I.Check className="h-3.5 w-3.5" />}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold">{container.number}</span>
                            <span className={cx("block truncate text-xs", subtle)}>{container.pallets} palet · {container.rolls} rulo · {container.qty.toLocaleString('az-Latn-AZ')} miqdar</span>
                          </span>
                        </button>
                        ))}
                      </div>
                    ) : (
                      <div className={cx("rounded-2xl border p-4", border, isDark ? "bg-slate-950/35" : "bg-white")}>
                        <div className="text-sm font-semibold">Düşüm partiyası</div>
                        {selectedLinkedDocument ? (
                          <div className="mt-3 space-y-2 text-sm">
                            <div className="flex justify-between gap-3"><span className={subtle}>Sənəd</span><strong>{selectedLinkedDocument.title}</strong></div>
                            <div className="flex justify-between gap-3"><span className={subtle}>Tarix</span><strong>{new Date(selectedLinkedDocument.documentDate).toLocaleString('az-Latn-AZ')}</strong></div>
                            <div className="flex justify-between gap-3"><span className={subtle}>Partiya miqdarı</span><strong className="tabular-nums">{selectedLinkedDocument.qty.toLocaleString('az-Latn-AZ')}</strong></div>
                          </div>
                        ) : <div className={cx("mt-3 text-sm", subtle)}>Əvvəlcə depoya düşüm sənədini seç.</div>}
                      </div>
                    )}

                    <div className={cx("rounded-2xl border p-4", border, isDark ? "bg-slate-950/35" : "bg-white")}> 
                      <div className="text-sm font-semibold">Maya hesablaması</div>
                      <div className="mt-3 space-y-2 text-sm">
                        <div className="flex justify-between gap-3"><span className={subtle}>Məbləğ</span><strong className="tabular-nums">{costPreview.amount.toFixed(2)} ₼</strong></div>
                        <div className="flex justify-between gap-3"><span className={subtle}>Seçilən miqdar</span><strong className="tabular-nums">{costPreview.qty.toLocaleString('az-Latn-AZ')}</strong></div>
                        <div className="h-px bg-slate-200/70" />
                        <div className="flex justify-between gap-3"><span className={subtle}>Vahid maya əlavəsi</span><strong className="tabular-nums">{costPreview.unit.toFixed(4)} ₼</strong></div>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      <label className="block">
        <span className="mb-2 block text-lg font-semibold text-slate-400">Şərh</span>
        <textarea value={comment} onChange={(event) => onCommentChange(event.target.value)} className={cx("h-36 w-full rounded-xl border p-3 outline-none", border, isDark ? "bg-white/5" : "bg-white")} />
      </label>
    </div>
  );
}


