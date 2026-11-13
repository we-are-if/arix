import test from "node:test";
import assert from "node:assert/strict";
import { summarizeDeliveryWaiting, syncPreparedDeliveryRelease, validateDeliveryReleaseItem } from "./deliveryWaitingBalance.js";

function fixture(quantity = 500, orderedRollCount = 5, requested = { quantity: 500 }) {
  const item = { id: "line", productId: 1, productName: "Krem", quantity, orderedRollCount };
  const release = { id: "release", orderId: "order", items: [{ waitingItemId: "line", productId: 1, ...requested }] };
  return { waiting: { items: [item], releases: [release] }, release };
}
const actual = (quantity, preparedRollCount = 5) => [{ waitingItemId: "line", productId: 1, preparedQuantity: quantity, preparedRollCount }];

test("500 requested, 470 ready returns 30 immediately, before delivery", () => {
  const { waiting, release } = fixture();
  syncPreparedDeliveryRelease(waiting, release, actual(470), "ready", "Warehouse");
  const summary = summarizeDeliveryWaiting(waiting);
  assert.equal(summary.items[0].remainingQuantity, 30);
  assert.equal(summary.items[0].releasedQuantity, 470);
  assert.equal(summary.items[0].deliveredQuantity, 0);
  assert.equal(release.requestedItems[0].quantity, 500);
  assert.equal(summary.status, "waiting");
});

test("legacy ready orders use actual preparation, not stale release request", () => {
  const { waiting } = fixture();
  const summary = summarizeDeliveryWaiting(waiting, [{ id: "order", status: "ready", readyAt: "now", items: actual(470) }]);
  assert.equal(summary.items[0].remainingQuantity, 30);
  assert.equal(waiting.releases[0].items[0].quantity, 500);
});

test("roll-only request from meter invoice makes no invented meter conversion", () => {
  const { waiting, release } = fixture(500, 0, { quantity: null, orderedRollCount: 1 });
  validateDeliveryReleaseItem(summarizeDeliveryWaiting({ ...waiting, releases: [] }).items[0], 0, 1);
  const before = summarizeDeliveryWaiting(waiting).items[0];
  assert.equal(before.releasedQuantity, 0);
  assert.equal(before.releasedRollCount, 1);
  assert.equal(before.pendingMeasurement, true);
  assert.throws(() => validateDeliveryReleaseItem(before, 100, 0));
  syncPreparedDeliveryRelease(waiting, release, actual(470, 1), "ready", "Warehouse");
  assert.equal(summarizeDeliveryWaiting(waiting).items[0].remainingQuantity, 30);
});

test("meter-only request from roll invoice waits for actual rolls", () => {
  const { waiting, release } = fixture(0, 5, { quantity: 470 });
  validateDeliveryReleaseItem(summarizeDeliveryWaiting({ ...waiting, releases: [] }).items[0], 470, 0);
  assert.equal(summarizeDeliveryWaiting(waiting).items[0].pendingMeasurement, true);
  syncPreparedDeliveryRelease(waiting, release, actual(470, 4), "ready", "Warehouse");
  assert.equal(summarizeDeliveryWaiting(waiting).items[0].remainingRollCount, 1);
});

test("30 meter remainder can be released and completed even when original rolls are exhausted", () => {
  const { waiting, release } = fixture();
  syncPreparedDeliveryRelease(waiting, release, actual(470), "first", "Warehouse");
  validateDeliveryReleaseItem(summarizeDeliveryWaiting(waiting).items[0], 30, 0);
  const last = { id: "last", items: [{ waitingItemId: "line", quantity: 30 }] };
  waiting.releases.push(last);
  syncPreparedDeliveryRelease(waiting, last, actual(30, 1), "last", "Warehouse");
  for (const entry of waiting.releases) { entry.deliveredAt = "done"; entry.items = entry.items.map((item) => ({ ...item, deliveredQuantity: item.preparedQuantity, deliveredRollCount: item.preparedRollCount })); }
  const summary = summarizeDeliveryWaiting(waiting);
  assert.equal(summary.items[0].deliveredQuantity, 500);
  assert.equal(summary.status, "completed");
});

test("ready corrections are idempotent and protect other reservations atomically", () => {
  const { waiting, release } = fixture();
  syncPreparedDeliveryRelease(waiting, release, actual(470), "ready", "Warehouse");
  syncPreparedDeliveryRelease(waiting, release, actual(470), "repeat", "Warehouse");
  assert.equal(summarizeDeliveryWaiting(waiting).items[0].remainingQuantity, 30);
  waiting.releases.push({ id: "other", items: [{ waitingItemId: "line", quantity: 30 }] });
  const before = structuredClone(waiting);
  assert.throws(() => syncPreparedDeliveryRelease(waiting, release, actual(480), "edit", "Warehouse"));
  assert.deepEqual(waiting, before);
});

test("actual quantity above total is rejected instead of silently clamped", () => {
  const { waiting, release } = fixture();
  assert.throws(() => syncPreparedDeliveryRelease(waiting, release, actual(501), "ready", "Warehouse"));
  assert.equal(release.preparedAt, undefined);
});

test("delivered release consumes actual amount once; cancellation releases reservations", () => {
  const { waiting, release } = fixture();
  syncPreparedDeliveryRelease(waiting, release, actual(470), "ready", "Warehouse");
  release.deliveredAt = "done";
  let summary = summarizeDeliveryWaiting(waiting);
  assert.equal(summary.items[0].deliveredQuantity, 470);
  assert.equal(summary.items[0].releasedQuantity, 0);
  assert.equal(summary.items[0].remainingQuantity, 30);
  assert.throws(() => syncPreparedDeliveryRelease(waiting, release, actual(400), "later", "Warehouse"));
  delete release.deliveredAt;
  release.cancelledAt = "cancelled";
  summary = summarizeDeliveryWaiting(waiting);
  assert.equal(summary.items[0].remainingQuantity, 500);
});

test("same product on separate invoice rows is not subtracted from both rows", () => {
  const { waiting } = fixture();
  waiting.items.push({ ...waiting.items[0], id: "line2", quantity: 200 });
  const summary = summarizeDeliveryWaiting(waiting);
  assert.equal(summary.items[0].releasedQuantity, 500);
  assert.equal(summary.items[1].remainingQuantity, 200);
});

test("roll-based invoice completes by rolls without inventing total meters", () => {
  const { waiting, release } = fixture(0, 5, { orderedRollCount: 5 });
  syncPreparedDeliveryRelease(waiting, release, actual(470), "ready", "Warehouse");
  release.deliveredAt = "done";
  assert.equal(summarizeDeliveryWaiting(waiting).status, "completed");
});
