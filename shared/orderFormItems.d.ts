type ItemIdentity = { productId?: number | string | null; productCode?: string; quantity?: number | null; preparedQuantity?: number | null; manual?: boolean };
export function orderLineMatchesItem(line: ItemIdentity, item: ItemIdentity): boolean;
export function matchOrderFormItems(lines: ItemIdentity[], items: ItemIdentity[]): number[];
type FormState = { number?: string; status?: string };
export function mergeFormWarning(orders: Array<{ number?: string; approvalForm?: FormState & { exportDocuments?: Record<string, FormState | undefined> } }>): string;
