import test from "node:test";
import assert from "node:assert/strict";
import {
  applyDailyEntryChange,
  createDailyEntryChangeRequest,
  normalizeDailyEntryCreation,
  normalizeDailyEntryChange,
} from "./dailyApprovals.js";

const original = {
  id: "entry-1",
  date: "2026-11-01",
  time: "09:10",
  kind: "income",
  title: "Medaxil",
  counterparty: "Cemil",
  category: "Vesait qebulu",
  amount: 300,
  accountId: "pair:Esqin:Kassa",
  responsible: "Esqin",
  bank: "Kassa",
  note: "",
  invoiced: true,
  invoiceNo: "32609",
};

test("requires a category for income and expense changes", () => {
  assert.throws(
    () => normalizeDailyEntryChange(original, { ...original, category: "" }),
    /Kateqoriya/,
  );
});

test("keeps invoice linkage outside the editable financial fields", () => {
  const normalized = normalizeDailyEntryChange(original, {
    ...original,
    amount: 350,
    invoiced: false,
    invoiceNo: "OTHER",
  });
  assert.equal(normalized.amount, 350);
  assert.equal(normalized.invoiced, true);
  assert.equal(normalized.invoiceNo, "32609");
});

test("does not affect the ledger before explicit approval", () => {
  const snapshot = { state: { entries: [original], closes: [] } };
  const request = createDailyEntryChangeRequest({
    id: "request-1",
    currentEntry: original,
    proposedEntry: { ...original, amount: 350, category: "Avans" },
    actor: { id: "cashier", name: "Kassir" },
    now: "2026-11-01T09:30:00.000Z",
  });
  assert.equal(snapshot.state.entries[0].amount, 300);
  const result = applyDailyEntryChange(snapshot, request, { id: "owner", name: "Sahib" }, "2026-11-01T09:35:00.000Z");
  assert.equal(snapshot.state.entries[0].amount, 300);
  assert.equal(result.snapshot.state.entries[0].amount, 350);
  assert.equal(result.snapshot.state.entries[0].category, "Avans");
  assert.equal(result.snapshot.state.entries[0].editedBy, "Sahib");
});

test("rejects approval when the original entry changed after the request", () => {
  const request = createDailyEntryChangeRequest({
    id: "request-1",
    currentEntry: original,
    proposedEntry: { ...original, amount: 350 },
    actor: { id: "cashier", name: "Kassir" },
  });
  const snapshot = { state: { entries: [{ ...original, amount: 325 }], closes: [] } };
  assert.throws(() => applyDailyEntryChange(snapshot, request, { name: "Sahib" }), /dəyişib/);
});

test("adds a backdated entry only after approval", () => {
  const proposed = { ...original, id: "entry-backdated", date: "2026-10-28", invoiced: true, invoiceNo: "SHOULD-NOT-CARRY" };
  const normalized = normalizeDailyEntryCreation(proposed);
  assert.equal(normalized.invoiced, false);
  assert.equal(normalized.invoiceNo, undefined);

  const request = createDailyEntryChangeRequest({
    id: "request-backdated",
    action: "create_backdated",
    proposedEntry: proposed,
    actor: { id: "cashier", name: "Kassir" },
  });
  const snapshot = { state: { entries: [original], closes: [] } };
  const result = applyDailyEntryChange(snapshot, request, { id: "owner", name: "Sahib" }, "2026-11-02T09:00:00.000Z");
  assert.equal(snapshot.state.entries.length, 1);
  assert.equal(result.snapshot.state.entries.length, 2);
  assert.equal(result.snapshot.state.entries[1].id, "entry-backdated");
  assert.equal(result.snapshot.state.entries[1].createdBy, "Sahib");
});

test("removes an entry only after delete approval", () => {
  const request = createDailyEntryChangeRequest({
    id: "request-delete",
    action: "delete",
    currentEntry: original,
    actor: { id: "manager", name: "Rəhbər" },
  });
  const snapshot = { state: { entries: [original], closes: [] } };
  const result = applyDailyEntryChange(snapshot, request, { id: "owner", name: "Sahib" });
  assert.equal(snapshot.state.entries.length, 1);
  assert.equal(result.snapshot.state.entries.length, 0);
  assert.equal(result.entry.id, original.id);
});
