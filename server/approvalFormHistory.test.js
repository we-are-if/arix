import test from "node:test";
import assert from "node:assert/strict";
import { collapseMergedApprovalRows, isReadOnlyApprovalPreview, mergedApprovalHistory, sortApprovalHistory } from "../shared/approvalFormHistory.js";

const source = (id) => ({ id, number: `ORD-${id}`, approvalForm: { number: `SOF-${id}`, documentType: "domestic", status: "rejected", updatedAt: "2026-11-05T10:10:00Z", lines: [{ quantity: 5, unitPrice: 3.4 }], revisions: [{ id: "old", status: "approved" }] } });

test("merged source forms appear only in new form menu, not as standalone rows", () => {
  const sources = [source("yesterday"), source("today-1"), source("today-2")].map((order) => ({ ...order, mergedIntoOrderId: "new" }));
  const merged = { id: "new", approvalForm: { number: "SOF-new", revisions: mergedApprovalHistory({ id: "new", mergedOrderIds: sources.map((s) => s.id) }, sources) } };
  const rows = [merged, ...sources];
  const before = structuredClone(rows);
  assert.deepEqual(collapseMergedApprovalRows(rows).map((order) => order.id), ["new"]);
  assert.equal(merged.approvalForm.revisions.length, 3);
  assert.deepEqual(rows, before);
});

test("source rows remain accessible when final form or history is missing or unauthorized", () => {
  const original = { ...source("old"), mergedIntoOrderId: "new" };
  for (const target of [null, { id: "new" }, { id: "new", approvalForm: { revisions: [] } }]) {
    const rows = target ? [original, target] : [original];
    assert.ok(collapseMergedApprovalRows(rows).includes(original));
  }
});

test("unmerge restores source rows and cancelled container cannot hide them", () => {
  const original = source("old");
  const target = { id: "new", mergeUndoneAt: "now", approvalForm: { revisions: [{ sourceOrderId: "old" }] } };
  assert.ok(collapseMergedApprovalRows([original, target]).includes(original));
});

test("nested source rows collapse under final form, not intermediate rows", () => {
  const old = { ...source("old"), mergedIntoOrderId: "middle" };
  const middle = { ...source("middle"), mergedIntoOrderId: "final" };
  const final = { id: "final", approvalForm: { revisions: [{ sourceOrderId: "old" }, { sourceOrderId: "middle" }] } };
  assert.deepEqual(collapseMergedApprovalRows([old, middle, final]).map((row) => row.id), ["final"]);
});

test("merged order shows each cancelled source form once without changing stored forms", () => {
  const orders = [source("yesterday"), source("today-1"), source("today-2")];
  const order = { id: "merged", mergeSourceOrderIds: orders.map((o) => o.id), mergedOrderIds: orders.map((o) => o.id) };
  const before = structuredClone(orders);
  const history = mergedApprovalHistory(order, orders);
  assert.equal(history.length, 3);
  assert.ok(history.every((revision) => revision.status === "rejected" && revision.form.status === "rejected" && revision.sourceOrderId));
  assert.equal(history[0].form.lines[0].unitPrice, 3.4);
  history[0].form.lines[0].unitPrice = 10;
  assert.deepEqual(orders, before);
});

test("nested merge history is cycle-safe and preserves document identities", () => {
  const a = source("a"); const b = source("b");
  a.mergedOrderIds = ["b", "root"]; b.mergedOrderIds = ["a"];
  const history = mergedApprovalHistory({ id: "root", mergedOrderIds: ["a", "b", "missing"] }, [a, b]);
  assert.equal(history.length, 2);
  assert.deepEqual(new Set(history.map((r) => r.form.number)), new Set(["SOF-a", "SOF-b"]));
});

test("source form permissions are respected", () => {
  assert.deepEqual(mergedApprovalHistory({ id: "m", mergedOrderIds: ["a"] }, [source("a")], () => false), []);
});

test("export variants are deduplicated and keep actual rejection statuses", () => {
  const a = source("a");
  a.approvalForm.documentType = "proforma";
  a.approvalForm.exportDocuments = { proforma: { ...a.approvalForm }, packing_list: { documentType: "packing_list", number: "PCK-a", status: "rejected" } };
  const history = mergedApprovalHistory({ id: "m", mergedOrderIds: ["a"] }, [a]);
  assert.equal(history.length, 2);
  assert.ok(history.every((r) => r.status === "rejected"));
});

test("current form precedes old approvals, rejected versions, and source documents", () => {
  const rows = [
    { id: "ret", status: "rejected", isCurrent: true, createdAt: "2026-11-05" },
    { id: "approved", status: "approved", createdAt: "2026-11-04" },
    { id: "current", status: "draft", isCurrent: true, createdAt: "2026-11-06" },
    { id: "source", status: "rejected", sourceOrderId: "old", createdAt: "2026-11-07" },
  ];
  assert.deepEqual(sortApprovalHistory(rows).map((r) => r.id), ["current", "approved", "ret", "source"]);
  assert.equal(rows[0].id, "ret");
});

test("only PDF preview gets read-only exemption, not archive, reject or save", () => {
  assert.equal(isReadOnlyApprovalPreview("POST", "approval-form", "preview-pdf"), true);
  for (const [method, action, subaction] of [["POST", "approval-form", "reject"], ["POST", "approval-form", "archive"], ["PUT", "approval-form", undefined], ["PATCH", "approval-form", "preview-pdf"]]) {
    assert.equal(isReadOnlyApprovalPreview(method, action, subaction), false);
  }
});
