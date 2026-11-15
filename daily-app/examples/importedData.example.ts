// Empty development data. Never contains company records.
export const IMPORTED_ACCOUNTS: any[] = [];
export const IMPORTED_ENTRIES: any[] = [];
export const IMPORTED_RECONCILIATION: Record<string, any> = {};
export const IMPORTED_DAY_METRICS: Record<string, any> = {};
export const IMPORTED_CATEGORIES: any[] = [];
export const IMPORTED_PEOPLE: any[] = [];
export const IMPORTED_BANKS: any[] = [];
export const IMPORTED_CARD_REPORT: { bank: string; code: string; totalBalance: number; rows: any[] }[] = [];
export const IMPORTED_WEEKLY_CHARTS: { week: string; days: {date: string; collection: number; expense: number; supplierPayment: number}[] }[] = [];
export const IMPORTED_CUSTOMERS: any[] = [];
export const IMPORTED_PIVOT_REPORTS: Record<string, any[]> = { byCategory: [], byBank: [], byCard: [], dailySupplierPayments: [] };
export const IMPORTED_CUSTOMER_DEBTS: Record<string, any> = {};
export const IMPORTED_PAST_MONTH_UNINVOICED: Record<string, any> = {};
