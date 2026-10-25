import { DatabaseSync } from "node:sqlite";
import { copyFileSync } from "node:fs";

const livePath = "server/data/arix.sqlite";
const backupPath = "server/data/backups/arix-2026-10-23-06-03-58-924Z.sqlite";
const safetyPath = `server/data/backups/arix-before-order-recovery-${new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-")}.sqlite`;

const checkpoint = new DatabaseSync(livePath);
checkpoint.prepare("PRAGMA wal_checkpoint(TRUNCATE)").get();
checkpoint.close();
copyFileSync(livePath, safetyPath);
const live = new DatabaseSync(livePath);
const backup = new DatabaseSync(backupPath, { readOnly: true });
const liveRow = live.prepare("SELECT data FROM app_state WHERE id = 1").get();
const backupRow = backup.prepare("SELECT data FROM app_state WHERE id = 1").get();
const state = JSON.parse(liveRow.data);
const saved = JSON.parse(backupRow.data);
const knownIds = new Set((state.orderBoard || []).map((order) => String(order.id)));
const knownNumbers = new Set((state.orderBoard || []).map((order) => String(order.number)));
const recovered = (saved.orderBoard || []).filter((order) => !knownIds.has(String(order.id)) && !knownNumbers.has(String(order.number)));
state.orderBoard = [...(state.orderBoard || []), ...recovered];
const now = new Date().toISOString();
live.exec("BEGIN IMMEDIATE");
try {
  live.prepare("UPDATE app_state SET data = ?, revision = revision + 1, updated_at = ? WHERE id = 1").run(JSON.stringify(state), now);
  live.exec("COMMIT");
} catch (error) {
  live.exec("ROLLBACK");
  throw error;
} finally {
  backup.close();
  live.close();
}
console.log(JSON.stringify({ recovered: recovered.length, total: state.orderBoard.length, safetyPath }, null, 2));
