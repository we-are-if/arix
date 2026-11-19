import { join } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";
import { createSQLiteStateStore } from "../server/database.js";
import { buildSparexpertSeedData } from "../server/dailySparexpertSeed.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DAILY_DATA_DIR = join(__dirname, "..", "server", "data", "daily");

async function main() {
  const sqlitePath = process.argv[2] || join(DAILY_DATA_DIR, "sparexpert.sqlite");
  const jsonPath = process.argv[3] || join(DAILY_DATA_DIR, "sparexpert-db.json");
  const dataDir = dirname(sqlitePath);

  console.log(`Seeding SparExpert database at ${sqlitePath}...`);
  const store = createSQLiteStateStore({
    dataDir,
    jsonPath,
    sqlitePath,
  });

  const payload = buildSparexpertSeedData();
  await store.initialize(payload, (x) => x);
  await store.write(payload);
  console.log("SparExpert database successfully seeded!");
  console.log(`Accounts: ${payload.snapshot.accounts.length}`);
  console.log(`Customers: ${payload.snapshot.customerList.length}`);
  console.log(`Categories: ${payload.snapshot.categoryList.length}`);
  console.log(`Users: ${payload.authUsers.map((u) => u.name).join(", ")}`);
  console.log(`Join code: ${payload.companyJoinCode}`);
  store.close();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error("Failed to seed SparExpert database:", err);
    process.exit(1);
  });
}
