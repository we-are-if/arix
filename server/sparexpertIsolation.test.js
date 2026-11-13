import test from "node:test";
import assert from "node:assert/strict";
import { buildSparexpertSeedData, SPAREXPERT_ACCOUNTS, SPAREXPERT_ENTRIES } from "./dailySparexpertSeed.js";

test("sparexpert: seed data integrity and zero invoice leaks", () => {
  const seed = buildSparexpertSeedData();

  // Must have 0 invoices because qaime is disabled for SpareXpert
  assert.equal(seed.snapshot.invoices.length, 0);

  // Must have real entries from sheets
  assert.equal(seed.snapshot.state.entries.length >= 950, true);

  // Must have 49 accounts
  assert.equal(seed.snapshot.accounts.length, 49);

  // Total opening balance of accounts matches October I Hefta opening (3,554.63 AZN)
  const totalOpening = seed.snapshot.accounts.reduce((sum, a) => sum + (a.opening || 0), 0);
  assert.equal(Math.round(totalOpening * 100) / 100, 3554.63);
});

test("sparexpert: investor tracking logic (Yatırım vs Y. Ödəniş)", () => {
  const investors = ["Y. Adil", "Y. Kənan", "Y. Fuad", "Y. Ceyhun"];
  const balances = Object.fromEntries(investors.map((inv) => [inv, { in: 0, out: 0 }]));

  for (const entry of SPAREXPERT_ENTRIES) {
    const cp = (entry.counterparty || "").trim();
    const cat = (entry.category || "").trim();
    const amt = Math.abs(entry.amount);

    for (const inv of investors) {
      const code = inv.split(" ")[1][0]; // A, K, F, C
      const isMatch = cp === inv || cat === `Y. Ödəniş (${code})` || (cat === "Yatırım" && cp === inv);
      if (isMatch) {
        if (entry.kind === "income" || cat === "Yatırım") {
          balances[inv].in += amt;
        } else if (entry.kind === "expense" || cat.startsWith("Y. Ödəniş")) {
          balances[inv].out += amt;
        }
      }
    }
  }

  // Y. Ceyhun had significant capital injected (over 40,000 AZN)
  assert.equal(balances["Y. Ceyhun"].in > 40000, true);
  // Y. Kənan had repayments (over 7,000 AZN)
  assert.equal(balances["Y. Kənan"].out > 7000, true);
});

test("sparexpert: internal transfer logic is separate from operational expense", () => {
  const transfers = SPAREXPERT_ENTRIES.filter((e) => e.kind === "transfer" || (e.category || "").includes("Köçürmə"));
  assert.equal(transfers.length > 30, true);

  // Transfers have accountId and targetAccountId (or counterparty account)
  for (const tr of transfers) {
    assert.equal(Boolean(tr.accountId), true);
  }
});
