type Identified = { id: string };
type Dated = { date: string };

export type MergeableDailySnapshot = {
  state: {
    entries: Identified[];
    closes: Dated[];
  };
  peopleList: unknown;
  channelList: unknown;
  categoryList: unknown;
  customerList: unknown;
  rules: unknown;
  customerDebts: unknown;
  pastMonthUninvoiced: unknown;
  invoices: Identified[];
  cardLimitSettings?: unknown;
};

const same = (left: unknown, right: unknown) => JSON.stringify(left ?? null) === JSON.stringify(right ?? null);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

function mergeValue(base: unknown, local: unknown, remote: unknown): unknown {
  if (same(local, base)) return remote;
  if (same(remote, base)) return local;
  if (!isPlainObject(base) || !isPlainObject(local) || !isPlainObject(remote)) return remote;

  const merged: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const key of keys) {
    const value = mergeValue(base[key], local[key], remote[key]);
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

function mergeKeyedCollection<T extends object>(
  baseItems: T[],
  localItems: T[],
  remoteItems: T[],
  keyOf: (item: T) => string,
): T[] {
  const baseById = new Map(baseItems.map((item) => [keyOf(item), item]));
  const remoteById = new Map(remoteItems.map((item) => [keyOf(item), item]));
  const merged = [...remoteItems];
  const mergedIndexes = new Map(merged.map((item, index) => [keyOf(item), index]));

  for (const localItem of localItems) {
    const key = keyOf(localItem);
    const baseItem = baseById.get(key);
    const remoteItem = remoteById.get(key);
    if (!baseItem) {
      if (!remoteItem) {
        mergedIndexes.set(key, merged.length);
        merged.push(localItem);
      }
      continue;
    }
    if (!remoteItem || same(localItem, baseItem) || !same(remoteItem, baseItem)) continue;
    const index = mergedIndexes.get(key);
    if (index !== undefined) merged[index] = localItem;
  }
  return merged;
}

export function rebaseDailySnapshot<T extends MergeableDailySnapshot>(base: T, local: T, remote: T): T {
  return {
    ...remote,
    state: {
      ...remote.state,
      entries: mergeKeyedCollection(base.state.entries, local.state.entries, remote.state.entries, (entry) => entry.id),
      closes: mergeKeyedCollection(base.state.closes, local.state.closes, remote.state.closes, (close) => close.date),
    },
    peopleList: mergeValue(base.peopleList, local.peopleList, remote.peopleList),
    channelList: mergeValue(base.channelList, local.channelList, remote.channelList),
    categoryList: mergeValue(base.categoryList, local.categoryList, remote.categoryList),
    customerList: mergeValue(base.customerList, local.customerList, remote.customerList),
    rules: mergeValue(base.rules, local.rules, remote.rules),
    customerDebts: mergeValue(base.customerDebts, local.customerDebts, remote.customerDebts),
    pastMonthUninvoiced: mergeValue(base.pastMonthUninvoiced, local.pastMonthUninvoiced, remote.pastMonthUninvoiced),
    invoices: mergeKeyedCollection(base.invoices, local.invoices, remote.invoices, (invoice) => invoice.id),
    cardLimitSettings: mergeValue(base.cardLimitSettings, local.cardLimitSettings, remote.cardLimitSettings),
  } as T;
}
