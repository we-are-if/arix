export interface CatalogProduct { name: string; code: string; stock?: number; }
export const OFFICIAL_PRODUCT_CATALOG: Record<string, string> = {};
export const OFFICIAL_PRODUCT_LIST: CatalogProduct[] = [];
