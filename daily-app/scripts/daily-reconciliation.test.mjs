import test from 'node:test';
import assert from 'node:assert/strict';
import { IMPORTED_ACCOUNTS, IMPORTED_RECONCILIATION } from '../src/importedData.ts';

const ACCOUNTS = IMPORTED_ACCOUNTS;
const RECONCILIATION_BY_DATE = IMPORTED_RECONCILIATION;

const normalizePersonName = (value) => {
  if (!value) return "Eşqin";
  if (/^K\.X(\d+)$/i.test(value)) return value.replace(/^K\.X/i, "Kart X");
  if (/^K\./i.test(value)) return value.replace(/^K\.\s*/i, "").trim();
  return value;
};

const isAggregateAccount = (name) => name.trim().toLocaleLowerCase("az-AZ") === "ümumi";

const isAutoSupplierCollector = (name) => {
  const autoList = ["Emil", "Xəqan", "T1", "T2", "T3", "T4"];
  const clean = name.trim().toLocaleLowerCase("az-AZ");
  return autoList.some((acc) => acc.trim().toLocaleLowerCase("az-AZ") === clean);
};

const pairAccountId = (person, channel) =>
  `pair:${encodeURIComponent(normalizePersonName(person))}:${encodeURIComponent(channel.trim() || "Kassa")}`;

const findAccountForPersonChannel = (person, channel) => {
  const cleanPerson = normalizePersonName(person);
  const cleanChannel = (channel || "").trim() || "Kassa";
  const isCash = cleanChannel.toLocaleLowerCase("az-AZ") === "kassa";

  if (isCash) {
    const match = ACCOUNTS.find(
      (acc) =>
        acc.type === "cash" &&
        !isAggregateAccount(acc.name) &&
        acc.name.toLocaleLowerCase("az-AZ") === cleanPerson.toLocaleLowerCase("az-AZ")
    );
    if (match) return match;
  } else {
    const match = ACCOUNTS.find(
      (acc) =>
        acc.name.startsWith("K.") &&
        normalizePersonName(acc.name).toLocaleLowerCase("az-AZ") === cleanPerson.toLocaleLowerCase("az-AZ")
    );
    if (match) return match;
    const matchDirect = ACCOUNTS.find(
      (acc) =>
        acc.type === "card" &&
        acc.name.toLocaleLowerCase("az-AZ") === cleanPerson.toLocaleLowerCase("az-AZ")
    );
    if (matchDirect) return matchDirect;
  }

  return {
    id: pairAccountId(cleanPerson, cleanChannel),
    name: `${cleanPerson} · ${cleanChannel}`,
    type: isCash ? "cash" : "bank",
    currency: "AZN",
    opening: 0,
    person: cleanPerson,
    channel: cleanChannel,
  };
};

const shiftDate = (iso, days) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
};

const balanceAt = (entries, account, endDate, beforeDay = false) => {
  if (isAutoSupplierCollector(account.name)) return 0;
  const cutoff = beforeDay ? shiftDate(endDate, -1) : endDate;
  const snapshotDate = Object.keys(RECONCILIATION_BY_DATE)
    .filter((key) => key <= cutoff && RECONCILIATION_BY_DATE[key].some(([name]) => name === account.name))
    .sort((a, b) => b.localeCompare(a))[0];
  const snapshot = snapshotDate ? RECONCILIATION_BY_DATE[snapshotDate].find(([name]) => name === account.name) : undefined;
  const base = snapshot ? snapshot[1] + snapshot[2] - snapshot[3] - snapshot[4] : account.opening;
  const after = snapshotDate ?? "0000-00-00";
  return entries.reduce((total, entry) => {
    const inRange = !entry.id.startsWith("sheet-") && entry.date > after && entry.date <= cutoff;
    if (!inRange) return total;
    const amt = Math.abs(entry.amount);
    if (entry.kind === "income" && entry.accountId === account.id) return total + amt;
    if (entry.kind === "expense" && entry.accountId === account.id) return total - amt;
    if (entry.kind === "transfer" && entry.accountId === account.id) return total - amt;
    if (entry.kind === "transfer" && entry.targetAccountId === account.id) return total + amt;
    return total;
  }, base);
};

test('findAccountForPersonChannel maps correctly to sheet accounts without phantom pairs', () => {
  assert.equal(findAccountForPersonChannel('Eşqin', 'Kassa').id, 'sheet-account-02');
  assert.equal(findAccountForPersonChannel('Eşqin', 'Kapital Bank').id, 'sheet-account-09');
  assert.equal(findAccountForPersonChannel('Xəqan', 'Kassa').id, 'sheet-account-04');
  assert.equal(findAccountForPersonChannel('Nuray', 'Kapital Bank').id, 'sheet-account-16');
  assert.equal(findAccountForPersonChannel('Arif', 'ABB').id, 'sheet-account-10');
});

test('daily turnover attributes to responsible account and rolls forward to next day opening balance', () => {
  const entries = [
    {
      id: 'nov2-01',
      date: '2026-11-02',
      time: '10:00',
      kind: 'income',
      amount: 13280,
      accountId: findAccountForPersonChannel('Eşqin', 'Kassa').id,
      responsible: 'Eşqin',
      bank: 'Kassa',
    },
    {
      id: 'nov2-02',
      date: '2026-11-02',
      time: '10:05',
      kind: 'income',
      amount: 460,
      accountId: findAccountForPersonChannel('Eşqin', 'Kapital Bank').id,
      responsible: 'Eşqin',
      bank: 'Kapital Bank',
    },
    {
      id: 'nov2-03',
      date: '2026-11-02',
      time: '10:10',
      kind: 'income',
      amount: 195,
      accountId: findAccountForPersonChannel('Xəqan', 'Kassa').id,
      responsible: 'Xəqan',
      bank: 'Kassa',
    },
  ];

  const esqinKassa = ACCOUNTS.find(a => a.name === 'Eşqin');
  const esqinKart = ACCOUNTS.find(a => a.name === 'K.Eşqin');
  const xaqanKassa = ACCOUNTS.find(a => a.name === 'Xəqan');

  // Nov 2 Opening Balance (from Nov 1 closing)
  assert.equal(balanceAt(entries, esqinKassa, '2026-11-02', true), 0.70);
  assert.equal(balanceAt(entries, esqinKart, '2026-11-02', true), 221.63);
  assert.equal(balanceAt(entries, xaqanKassa, '2026-11-02', true), 0.00);

  // Nov 3 Opening Balance (rolls forward Nov 2 closing)
  // Eşqin Kassa: 0.70 + 13280 = 13280.70
  assert.equal(balanceAt(entries, esqinKassa, '2026-11-03', true), 13280.70);
  // Eşqin Kart: 221.63 + 460 = 681.63
  assert.equal(balanceAt(entries, esqinKart, '2026-11-03', true), 681.63);
  // Xəqan is autoCollector, always rolls forward 0
  assert.equal(balanceAt(entries, xaqanKassa, '2026-11-03', true), 0.00);
});
