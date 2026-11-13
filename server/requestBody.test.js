import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { bufferRequestBody, parseJsonBody, runQueuedRequest } from "./requestBody.js";

function request() {
  const req = new EventEmitter();
  Object.assign(req, { headers: {}, complete: false, readableEnded: false, aborted: false, resume() {} });
  return req;
}
function end(req, body = "{}") { req.emit("data", Buffer.from(body)); req.complete = true; req.readableEnded = true; req.emit("end"); }
function queue() { let tail = Promise.resolve(); return (task) => { const run = tail.then(task, task); tail = run.catch(() => {}); return run; }; }

test("slow image upload does not hold mutation queue or block completed delivery request", async () => {
  const enqueue = queue(); const calls = [];
  const slow = request(); const fast = request();
  const slowResult = runQueuedRequest(slow, {}, enqueue, () => calls.push("upload"));
  const rejected = assert.rejects(slowResult, /interrupted/);
  const fastResult = runQueuedRequest(fast, {}, enqueue, async () => { calls.push("delivery"); assert.deepEqual(await parseJsonBody(fast), { status: "delivered" }); });
  end(fast, JSON.stringify({ status: "delivered" }));
  await fastResult;
  assert.deepEqual(calls, ["delivery"]);
  slow.aborted = true; slow.emit("aborted"); slow.emit("error", new Error("ECONNRESET"));
  await rejected;
  const later = request(); const laterResult = runQueuedRequest(later, {}, enqueue, () => calls.push("later")); end(later); await laterResult;
  assert.deepEqual(calls, ["delivery", "later"]);
});

test("aborted upload rejects, including abortion before listeners attach", async () => {
  const before = request(); before.aborted = true;
  await assert.rejects(bufferRequestBody(before), /interrupted/);
  const during = request(); const pending = bufferRequestBody(during); during.emit("close");
  await assert.rejects(pending, /interrupted/);
});

test("timed-out body rejects without occupying mutation queue", async () => {
  const req = request();
  await assert.rejects(bufferRequestBody(req, { timeoutMs: 10 }), (error) => error.statusCode === 408);
  assert.equal(req.listenerCount("data"), 0);
});

test("cached UTF-8 body is read once and route size limits remain enforced", async () => {
  const req = request(); const pending = bufferRequestBody(req);
  const body = JSON.stringify({ name: "İlknur Şeremet" }); const bytes = Buffer.from(body);
  req.emit("data", bytes.subarray(0, 11)); req.emit("data", bytes.subarray(11)); req.complete = true; req.emit("end");
  await pending;
  assert.deepEqual(await parseJsonBody(req), { name: "İlknur Şeremet" });
  await assert.rejects(parseJsonBody(req, 5), (error) => error.statusCode === 413);
});

test("disconnected queued client cannot perform a late stock mutation", async () => {
  let unblock; const blocked = new Promise((resolve) => { unblock = resolve; });
  const enqueue = queue(); const blocker = enqueue(() => blocked);
  const req = request(); const res = { destroyed: false }; let changed = false;
  const run = runQueuedRequest(req, res, enqueue, () => { changed = true; }); end(req);
  res.destroyed = true; unblock(); await blocker; await run;
  assert.equal(changed, false);
});

test("invalid JSON and oversized uploads reject predictably", async () => {
  const req = request(); const result = parseJsonBody(req); end(req, "{"); await assert.rejects(result, /Invalid JSON/);
  const large = request(); const tooLarge = bufferRequestBody(large, { limit: 2 }); end(large, "123"); await assert.rejects(tooLarge, (e) => e.statusCode === 413);
});
