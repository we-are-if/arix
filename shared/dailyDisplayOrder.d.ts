type DisplayEntry = { kind: string; category?: string; time?: string };
export function isTrailingDailyEntry(entry: DisplayEntry, companyId: string): boolean;
export function orderDailyDisplayEntries<T extends DisplayEntry>(entries: readonly T[], companyId: string): T[];
