import test from "node:test";
import assert from "node:assert/strict";
import { buildAzartNotificationEvents, withAzartNotifications } from "./dailyNotifications.js";

const snapshot = (entries = [], invoices = []) => ({ state: { entries }, invoices });
const payment = { id: "p1", kind: "income", amount: 120, counterparty: "Müştəri" };
const draft = { id: "i1", status: "draft", invoiceNo: "15", customer: "Müştəri" };
const active = { ...draft, status: "active", approvedBy: "Rəhbər" };
const users = [
  { id: "owner", permissions: ["daily.view", "daily.invoices.view", "daily.invoices.approve"] },
  { id: "cashier", permissions: ["daily.view", "daily.invoices.view"] },
  { id: "disabled", active: false, permissions: ["daily.view"] },
  { id: "denied", permissions: [] },
];
const hasPermission = (user, permission) => user.permissions.includes(permission);

test("every income, expense and transfer creates its own payment event", () => {
  const entries = ["income", "expense", "transfer"].map((kind) => ({ ...payment, id: kind, kind }));
  const events = buildAzartNotificationEvents(snapshot(), snapshot(entries));
  assert.equal(events.length, 3);
  assert.deepEqual(events.map((event) => event.relatedId), ["income", "expense", "transfer"]);
  assert.match(events[0].message, /120.00 AZN/);
});

test("saving, linking or editing an existing payment does not notify again", () => {
  assert.deepEqual(buildAzartNotificationEvents(snapshot([payment]), snapshot([{ ...payment, invoiced: true, amount: 150 }])), []);
});

test("approval notifies once; active edits and retries do not repeat approval", () => {
  assert.equal(buildAzartNotificationEvents(snapshot([], [draft]), snapshot([], [active]))[0].type, "daily_invoice_approved");
  assert.equal(buildAzartNotificationEvents(snapshot(), snapshot([], [active]))[0].type, "daily_invoice_approved");
  assert.deepEqual(buildAzartNotificationEvents(snapshot([], [active]), snapshot([], [{ ...active, note: "edit" }])), []);
  assert.deepEqual(buildAzartNotificationEvents(snapshot([], [active]), snapshot([], [active])), []);
});

test("draft creation notifies, draft edits do not repeat", () => {
  assert.equal(buildAzartNotificationEvents(snapshot(), snapshot([], [draft]))[0].type, "daily_invoice_draft_pending");
  assert.deepEqual(buildAzartNotificationEvents(snapshot([], [draft]), snapshot([], [{ ...draft, note: "edit" }])), []);
});

test("invalid payments never create notifications", () => {
  for (const amount of [0, -1, "bad", Infinity]) {
    assert.deepEqual(buildAzartNotificationEvents(snapshot(), snapshot([{ ...payment, amount }])), []);
  }
});

function setup(options = {}) {
  const writes = [], pushes = [];
  const current = { snapshot: snapshot(), authUsers: users, notifications: [], pushSubscriptions: [{ endpoint: "azart" }] };
  const store = { write: async (next) => { writes.push(structuredClone(next)); return "saved"; } };
  const wrapped = withAzartNotifications({ store, current, companyId: "azartmembran", actor: { id: "owner", name: "Owner" }, hasPermission,
    sendPush: async (next, payload) => { assert.ok(writes.length); pushes.push(payload); }, ...options });
  return { current, store, wrapped, writes, pushes };
}

test("company isolation leaves SparExpert store and all its data untouched", async () => {
  const { store, wrapped, current, pushes } = setup({ companyId: "sparexpert" });
  assert.equal(wrapped, store);
  await wrapped.write(current);
  assert.deepEqual(current.notifications, []);
  assert.equal(pushes.length, 0);
});

test("SparExpert opt-in honors its own preferences and skips invoice and supplier notices", async () => {
  const { current, wrapped, pushes } = setup({ companyId: "sparexpert", enableSparexpert: true });
  current.dailyNoticePreferences = { cashier: ["expense"] };
  current.snapshot = snapshot([{ ...payment, kind: "expense", category: "Təchizatçı" }], [active]);
  current.snapshot.state.closes = [{ date: "2026-11-06", notificationTotals: { income: 0, expense: 120, supplier: 0, ending: 100 } }];
  await wrapped.write(current);
  assert.equal(pushes.length, 3);
  assert.ok(pushes.every((push) => push.companyId === "sparexpert"));
  assert.equal(pushes.filter((push) => push.type === "daily_payment_created").length, 1);
  assert.ok(pushes.every((push) => !/Təchizatçıya ödəniş|Qaimə/.test(push.body)));
});

test("authorized active recipients including actor get notifications; payment data is unchanged", async () => {
  const { wrapped, current, writes, pushes } = setup();
  current.snapshot = snapshot([payment], [active]);
  const expected = structuredClone(current.snapshot);
  assert.equal(await wrapped.write(current), "saved");
  assert.deepEqual(current.snapshot, expected);
  assert.equal(writes[0].notifications.length, 4);
  assert.equal(pushes.length, 4);
  assert.ok(pushes.every((push) => push.companyId === "azartmembran"));
  assert.deepEqual([...new Set(pushes.map((push) => push.recipientUserId))], ["owner", "cashier"]);
  await wrapped.write(current);
  assert.equal(pushes.length, 4);
});

test("draft notifications reach only approvers and duplicate users are not notified twice", async () => {
  const { wrapped, current, pushes } = setup();
  current.authUsers = [...users, users[0]];
  current.snapshot = snapshot([], [draft]);
  await wrapped.write(current);
  assert.deepEqual(pushes.map((push) => push.recipientUserId), ["owner"]);
});

test("failed persistence sends no push", async () => {
  const { wrapped, current, pushes } = setup({ store: { write: async () => { throw new Error("disk"); } } });
  current.snapshot = snapshot([payment]);
  await assert.rejects(wrapped.write(current), /disk/);
  assert.equal(pushes.length, 0);
});

test("push failure does not fail a saved payment or lose its in-app notification", async () => {
  const { wrapped, current, writes } = setup({ sendPush: async () => { throw new Error("offline"); } });
  current.snapshot = snapshot([payment]);
  await assert.doesNotReject(wrapped.write(current));
  assert.equal(writes[0].notifications.length, 2);
  assert.deepEqual(writes[0].snapshot.state.entries, [payment]);
});
