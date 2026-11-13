import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSQLiteStateStore } from "./database.js";
import { createPushOutbox, stageDailyPush } from "./dailyPushOutbox.js";
import { createMutationScheduler } from "./mutationScheduler.js";
import { sendDailySnapshot } from "./dailySnapshotResponse.js";
import { installDailyTransport } from "../shared/dailyTransport.js";
import { createDailyImages } from "./dailyImages.js";

const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise((r) => setImmediate(r));

test("company writes progress independently; shared changes are barriers; failed jobs release locks", async () => {
  const enqueue = createMutationScheduler(), gate = deferred(), events = [];
  const a = enqueue("azart", async () => { events.push("a1"); await gate.promise; });
  const a2 = enqueue("azart", () => events.push("a2"));
  const b = enqueue("spare", () => events.push("b"));
  await b; assert.deepEqual(events, ["a1", "b"]);
  const admin = enqueue(null, () => events.push("admin"));
  const later = enqueue("spare", () => events.push("later"));
  gate.resolve(); await Promise.all([a, a2, admin, later]);
  assert.deepEqual(events, ["a1", "b", "a2", "admin", "later"]);
  await assert.rejects(enqueue("spare", () => { throw Error("fail"); }));
  await enqueue("spare", () => events.push("recovered"));
});

test("business commit stores push job durably without waiting for delivery", async () => {
  const dir = await mkdtemp(join(tmpdir(), "daily-perf-"));
  const dbPath = join(dir, "test.sqlite");
  let store;
  try {
    store = createSQLiteStateStore({ dataDir: dir, jsonPath: join(dir, "none"), sqlitePath: dbPath, pushDelivery: async () => { throw Error("offline"); } });
    await store.initialize({ snapshot: { entries: [] }, pushSubscriptions: [{ userId: "u", endpoint: "e" }] }, (v) => v);
    const next = await store.read(); next.snapshot.entries.push({ id: "1", amount: 42 });
    stageDailyPush(next, { recipientUserId: "u", title: "saved" });
    await store.write(next);
    assert.equal((await store.read()).snapshot.entries.length, 1);
    assert.equal((await store.read()).__dailyPushJobs, undefined);
    store.close(); store = null;
    const db = new DatabaseSync(dbPath);
    assert.equal(db.prepare("SELECT count(*) AS n FROM daily_push_outbox WHERE completed_at IS NULL").get().n, 1);
    const delivered = [];
    const worker = createPushOutbox(db, async (job) => delivered.push(job.message.title));
    await worker.drain(); await worker.drain();
    assert.deepEqual(delivered, ["saved"]); worker.stop(); db.close();
  } finally { store?.close(); await rm(dir, { recursive: true, force: true }); }
});

test("failed financial write does not commit a push job", async () => {
  const dir = await mkdtemp(join(tmpdir(), "daily-rollback-"));
  const dbPath = join(dir, "test.sqlite");
  const store = createSQLiteStateStore({ dataDir: dir, jsonPath: join(dir, "none"), sqlitePath: dbPath, pushDelivery: async () => {} });
  try {
    await store.initialize({ snapshot: {}, pushSubscriptions: [{ userId: "u" }] }, (v) => v);
    const external = new DatabaseSync(dbPath);
    external.exec("CREATE TRIGGER fail_write BEFORE UPDATE ON app_state BEGIN SELECT RAISE(ABORT,'test failure'); END");
    const next = await store.read(); stageDailyPush(next, { recipientUserId: "u" });
    await assert.rejects(store.write(next), /test failure/);
    assert.equal(external.prepare("SELECT count(*) AS n FROM daily_push_outbox").get().n, 0);
    external.close();
  } finally { store.close(); await rm(dir, { recursive: true, force: true }); }
});

function snapshotResponse(company, user, current, etag) {
  const out = {};
  sendDailySnapshot({ authUser: { id: user }, headers: { "if-none-match": etag } }, {
    writeHead(status, headers) { out.status = status; out.headers = headers; }, end(body) { out.body = body; },
  }, current, company);
  return out;
}
test("snapshot cache isolates company and user, invalidates revisions, skips unchanged body", () => {
  const state = { snapshot: { amount: 42 }, snapshotRevision: 1, updatedAt: "now" };
  const a = snapshotResponse("azart", "u1", state);
  assert.equal(snapshotResponse("azart", "u1", state, a.headers.ETag).status, 304);
  assert.equal(snapshotResponse("spare", "u1", state, a.headers.ETag).status, 200);
  assert.equal(snapshotResponse("azart", "u2", state, a.headers.ETag).status, 200);
  const next = { ...state, snapshot: { amount: 99 }, snapshotRevision: 2 };
  const b = snapshotResponse("azart", "u1", next, a.headers.ETag);
  assert.equal(b.status, 200); assert.equal(JSON.parse(b.body).data.amount, 99);
});

test("transport reuses only server-authorized 304 responses, clears on logout, propagates failures", async () => {
  const seen = [], replies = [
    new Response('{"revision":1}', { headers: { etag: '"a"' } }),
    new Response(null, { status: 304 }), new Response("{}"),
    new Response("denied", { status: 401 }),
  ];
  const target = { location: new URL("https://daily.example/"), fetch: async (url, init) => { seen.push(new Headers(init?.headers)); return replies.shift(); } };
  installDailyTransport(target);
  assert.deepEqual(await (await target.fetch("/api/daily")).json(), { revision: 1 });
  assert.deepEqual(await (await target.fetch("/api/daily")).json(), { revision: 1 });
  assert.equal(seen[1].get("if-none-match"), '"a"');
  await target.fetch("/api/daily-auth/logout", { method: "POST" });
  assert.equal((await target.fetch("/api/daily")).status, 401);
  assert.equal(seen[3].get("if-none-match"), null);
});

test("slow push retries do not block another company or discard failed jobs", async () => {
  const db = new DatabaseSync(":memory:"); let now = 100, calls = 0;
  const worker = createPushOutbox(db, async () => { calls++; if (calls === 1) throw Error("network"); }, { now: () => now });
  worker.enqueue([{ id: "one", message: {}, subscriptions: [] }]);
  await worker.drain(); assert.equal(db.prepare("SELECT completed_at FROM daily_push_outbox").get().completed_at, null);
  await worker.drain(); assert.equal(calls, 1);
  now = 20000; await worker.drain(); assert.equal(calls, 2);
  worker.stop(); db.close();
});

test("lazy invoice images preserve originals, restore edits, persist across restart and reject cross-company references", async () => {
  const dir = await mkdtemp(join(tmpdir(), "daily-images-"));
  let images = createDailyImages(dir);
  try {
    const original = { invoices: [{ id: "i", screenshotDataUrl: "data:image/png;base64,aGVsbG8=", amount: 42 }] };
    const projected = images.project(original, "sparexpert");
    const url = projected.invoices[0].screenshotDataUrl;
    assert.match(url, /^\/api\/daily\/image\/sparexpert\/[a-f0-9]{64}$/);
    assert.equal(original.invoices[0].screenshotDataUrl, "data:image/png;base64,aGVsbG8=");
    assert.deepEqual(images.hydrate(structuredClone(projected), "sparexpert"), original);
    assert.equal(images.hydrate(structuredClone(projected), "azartmembran").invoices[0].screenshotDataUrl, undefined);
    assert.equal(images.get("azartmembran", url.split("/").at(-1)), null);
    images.close(); images = createDailyImages(dir);
    assert.equal(Buffer.from(images.get("sparexpert", url.split("/").at(-1)).data).toString(), "hello");
    assert.deepEqual(images.hydrate(structuredClone(projected), "sparexpert"), original);
  } finally { images.close(); await rm(dir, { recursive: true, force: true }); }
});
