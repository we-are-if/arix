import assert from "node:assert/strict";
import { after, test } from "node:test";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rm } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const outputPath = join(tmpdir(), `arix-daily-snapshot-merge-${process.pid}.mjs`);
await build({
  entryPoints: ["daily-app/src/dailySnapshotMerge.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: outputPath,
  logLevel: "silent",
});

const { rebaseDailySnapshot } = await import(`${pathToFileURL(outputPath).href}?v=${Date.now()}`);
after(async () => rm(outputPath, { force: true }));

const entry = (id, amount) => ({ id, date: "2026-11-02", amount });
const invoice = (id, amount) => ({ id, salesAmount: amount });
const snapshot = ({ entries, invoices = [], debts = {} }) => ({
  version: 3,
  state: { entries, closes: [] },
  peopleList: [],
  channelList: [],
  categoryList: [],
  customerList: [],
  rules: {},
  customerDebts: debts,
  pastMonthUninvoiced: {},
  invoices,
});

test("keeps entries newly created by both users after a revision conflict", () => {
  const base = snapshot({ entries: [entry("base", 10)] });
  const local = snapshot({ entries: [entry("base", 10), entry("local", 20)] });
  const remote = snapshot({ entries: [entry("base", 10), entry("remote", 30)] });
  const merged = rebaseDailySnapshot(base, local, remote);
  assert.deepEqual(merged.state.entries.map((item) => item.id), ["base", "remote", "local"]);
});

test("keeps a local invoice edit when the remote user only added an entry", () => {
  const base = snapshot({ entries: [entry("base", 10)], invoices: [invoice("invoice", 100)] });
  const local = snapshot({ entries: [entry("base", 10)], invoices: [invoice("invoice", 125)] });
  const remote = snapshot({ entries: [entry("base", 10), entry("remote", 30)], invoices: [invoice("invoice", 100)] });
  const merged = rebaseDailySnapshot(base, local, remote);
  assert.equal(merged.invoices[0].salesAmount, 125);
  assert.deepEqual(merged.state.entries.map((item) => item.id), ["base", "remote"]);
});

test("uses the server copy when both users changed the same record", () => {
  const base = snapshot({ entries: [entry("same", 10)] });
  const local = snapshot({ entries: [entry("same", 20)] });
  const remote = snapshot({ entries: [entry("same", 30)] });
  const merged = rebaseDailySnapshot(base, local, remote);
  assert.equal(merged.state.entries[0].amount, 30);
});

test("preserves newly created local non-sheet expenses even when base snapshot matches remote", () => {
  const base = snapshot({ entries: [entry("sheet-1", 10)] });
  const local = snapshot({ entries: [entry("sheet-1", 10), entry("expense-1", -50)] });
  const remote = snapshot({ entries: [entry("sheet-1", 10)] });
  const merged = rebaseDailySnapshot(base, local, remote);
  assert.deepEqual(merged.state.entries.map((item) => item.id), ["sheet-1", "expense-1"]);
  assert.equal(merged.state.entries[1].amount, -50);
});
