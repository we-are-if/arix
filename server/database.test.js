import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createSQLiteStateStore } from "./database.js";

test("imports legacy JSON once and persists subsequent SQLite writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "arix-sqlite-"));
  let store;
  try {
    const jsonPath = join(dir, "db.json");
    await writeFile(jsonPath, JSON.stringify({ products: [{ id: 1 }], marker: "legacy" }), "utf8");
    store = createSQLiteStateStore({ dataDir: dir, jsonPath });
    const initial = await store.initialize({ products: [] }, (value) => value);
    assert.equal(initial.marker, "legacy");
    initial.products.push({ id: 2 });
    await store.write(initial);
    const saved = await store.read();
    assert.equal(saved.products.length, 2);
    assert.equal(JSON.parse(await readFile(jsonPath, "utf8")).products.length, 1);
    assert.equal(store.status().engine, "sqlite");
  } finally {
    store?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("refuses to replace a malformed legacy JSON database", async () => {
  const dir = await mkdtemp(join(tmpdir(), "arix-sqlite-invalid-"));
  let store;
  try {
    const jsonPath = join(dir, "db.json");
    await writeFile(jsonPath, "{broken", "utf8");
    store = createSQLiteStateStore({ dataDir: dir, jsonPath });
    await assert.rejects(() => store.initialize({ empty: true }, (value) => value), /left untouched/);
    assert.equal(await readFile(jsonPath, "utf8"), "{broken");
  } finally {
    store?.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test("can return cached state without cloning for read-only requests", async () => {
  const dir = await mkdtemp(join(tmpdir(), "arix-db-readonly-"));
  const jsonPath = join(dir, "db.json");
  const store = createSQLiteStateStore({ dataDir: dir, jsonPath });
  try {
    await store.initialize({ value: 1 }, (value) => value);
    const first = await store.read({ clone: false });
    const second = await store.read({ clone: false });
    const isolated = await store.read();
    assert.equal(first, second);
    assert.notEqual(first, isolated);
    assert.deepEqual(isolated, first);
  } finally {
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
