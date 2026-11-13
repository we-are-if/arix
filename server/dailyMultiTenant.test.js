import test from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createSQLiteStateStore } from "./database.js";
import { buildSparexpertSeedData } from "./dailySparexpertSeed.js";

test("multi-tenant: creates isolated stores for azartmembran and sparexpert", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "arix-mt-test-"));
  try {
    const azartStore = createSQLiteStateStore({
      dataDir: tempDir,
      jsonPath: join(tempDir, "azart.json"),
      sqlitePath: join(tempDir, "azart.sqlite"),
    });

    const sparexpertStore = createSQLiteStateStore({
      dataDir: tempDir,
      jsonPath: join(tempDir, "sparexpert.json"),
      sqlitePath: join(tempDir, "sparexpert.sqlite"),
    });

    const azartPayload = {
      snapshot: { version: 3, invoices: [{ id: "inv-1", invoiceNo: "101", customer: "Müştəri 1" }] },
      companyJoinCode: "BFCLTMYJ",
      authUsers: [{ id: "user-azart", name: "Azart İstifadəçi", email: "azart@arix.az", role: "Sahib" }],
    };

    const sparexpertPayload = buildSparexpertSeedData();

    await azartStore.initialize(azartPayload, (x) => x);
    await azartStore.write(azartPayload);

    await sparexpertStore.initialize(sparexpertPayload, (x) => x);
    await sparexpertStore.write(sparexpertPayload);

    const azartData = await azartStore.read();
    const sparexpertData = await sparexpertStore.read();

    // Check separation
    assert.equal(azartData.companyJoinCode, "BFCLTMYJ");
    assert.equal(sparexpertData.companyJoinCode, "SPAREXPERT");

    // Azart has invoice
    assert.equal(azartData.snapshot.invoices.length, 1);
    // SparExpert has 0 invoices (no qaimə)
    assert.equal(sparexpertData.snapshot.invoices.length, 0);

    // SparExpert has 49 accounts
    assert.equal(sparexpertData.snapshot.accounts.length, 49);
    assert.equal(sparexpertData.snapshot.rules.openBalance, 3554.63);
    assert.equal(sparexpertData.snapshot.state.entries.length > 500, true);

    azartStore.close();
    sparexpertStore.close();
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    } catch {
      // safe cleanup
    }
  }
});
