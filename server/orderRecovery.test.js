import test from "node:test";
import assert from "node:assert/strict";
import { matchOrderFormItems, mergeFormWarning } from "../shared/orderFormItems.js";
import { removeLoanReturn, undoReadyMerge } from "./orderRecovery.js";

const item = (quantity) => ({ productId: 1, productCode: "ERSA 501", quantity, preparedQuantity: quantity });

test("merge requires cancelling pending or approved forms, including export variants", () => {
  for (const status of ["draft", "approved", undefined]) {
    const warning = mergeFormWarning([{ number: "ORD-1", approvalForm: { number: "SOF-1", status } }]);
    assert.match(warning, /Önce sipariş formunu iptal edin/);
    assert.match(warning, /ORD-1 \(SOF-1\)/);
  }
  assert.match(mergeFormWarning([{ approvalForm: { status: "rejected", exportDocuments: { proforma: { number: "PRF-1", status: "approved" } } } }]), /PRF-1/);
});

test("merge allows absent or cancelled forms without treating historical revisions as active", () => {
  assert.equal(mergeFormWarning([{ number: "ORD-1" }]), "");
  for (const status of ["rejected", "cancelled", "canceled"]) {
    const orders = [{ approvalForm: { status, revisions: [{ form: { status: "approved" } }], exportDocuments: { proforma: { status }, packing_list: undefined } } }];
    const before = structuredClone(orders);
    assert.equal(mergeFormWarning(orders), "");
    assert.deepEqual(orders, before);
  }
});

test("duplicate products consume distinct source rows, preserving reordered prices", () => {
  const items = [item(5), item(10), { productId: 2, productCode: "X", quantity: 2 }];
  const lines = [{ ...item(10), unitPrice: 3.4 }, { ...item(5), unitPrice: 3.8 }, { productId: 2, productCode: "X" }];
  assert.deepEqual(matchOrderFormItems(lines, items), [1, 0, 2]);
  assert.deepEqual(matchOrderFormItems([item(5)], items), [0]);
  assert.deepEqual(lines.map((line) => line.unitPrice), [3.4, 3.8, undefined]);
});

test("excess duplicate rows cannot replace a missing product", () => {
  assert.deepEqual(matchOrderFormItems([item(5), item(5)], [item(5), { productId: 2 }]), [0, -1]);
});

test("manual export rows do not consume source items", () => {
  assert.deepEqual(matchOrderFormItems([{ ...item(5), manual: true }, item(5)], [item(5)]), [-1, 0]);
  assert.deepEqual(matchOrderFormItems([{ productId: null }], [{ productId: null }]), [-1]);
});

function fixture() {
  const sources = [5, 10].map((quantity, index) => ({ id: `s${index}`, status: "fulfilled", mergedIntoOrderId: "m", mergedIntoOrderNumber: "ORD-M", items: [item(quantity)], approvalForm: { number: `SOF-${index}`, status: "approved" } }));
  const merged = { id: "m", status: "ready", mergedOrderIds: sources.map((source) => source.id), items: sources.flatMap((source) => structuredClone(source.items)), approvalForm: { number: "SOF-M" } };
  return { sources, merged, orders: [...sources, merged] };
}

test("undo restores ready sources without deleting any forms", () => {
  const { orders, sources, merged } = fixture();
  assert.equal(undoReadyMerge(orders, merged).length, 2);
  assert.equal(merged.status, "cancelled");
  assert.equal(merged.approvalForm.number, "SOF-M");
  assert.ok(sources.every((source) => source.status === "ready" && !source.mergedIntoOrderId && source.approvalForm.status === "approved"));
});

test("undo refuses delivered, modified, missing or locked sources atomically", () => {
  for (const change of [
    ({ merged }) => { merged.deliveredAt = "now"; },
    ({ merged }) => { merged.items[0].preparedQuantity = 8; },
    ({ orders }) => { orders.shift(); },
    ({ sources }) => { sources[0].lockedAt = "now"; },
    ({ orders }) => { orders.push({ id: "batch", partialDeliverySourceId: "m" }); },
  ]) {
    const state = fixture(); change(state);
    const before = structuredClone(state);
    assert.throws(() => undoReadyMerge(state.orders, state.merged));
    assert.deepEqual(state, before);
  }
});

test("direct source ids support safely undoing nested merges", () => {
  const { orders, merged, sources } = fixture();
  merged.mergeSourceOrderIds = merged.mergedOrderIds;
  merged.mergedOrderIds = ["old-leaf", "s1"];
  assert.equal(undoReadyMerge(orders, merged).length, 2);
  assert.equal(sources[0].status, "ready");
});

test("loan return can be removed before delivery, not after stock movement", () => {
  const order = { status: "ready", isLoanReturn: true, items: [item(5)] };
  removeLoanReturn(order);
  assert.equal(order.isLoanReturn, false);
  for (const extra of [{ status: "delivered" }, { deliveredAt: "now" }, { hasPartialDelivery: true }, { mergedOrderIds: ["a"] }]) {
    const protectedOrder = { ...order, isLoanReturn: true, ...extra };
    assert.throws(() => removeLoanReturn(protectedOrder));
    assert.equal(protectedOrder.isLoanReturn, true);
  }
});
