import { DatabaseSync, backup } from "node:sqlite";

const source = process.argv[2];
const destination = process.argv[3];

if (!source || !destination) {
  throw new Error("Usage: node create-daily-audit-snapshot.mjs <source.sqlite> <destination.sqlite>");
}

const database = new DatabaseSync(source, { readOnly: true });
try {
  await backup(database, destination);
} finally {
  database.close();
}
