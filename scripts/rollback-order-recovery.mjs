import { DatabaseSync } from "node:sqlite";
import { readdirSync } from "node:fs";

const dataDir = "server/data";
const recoverySource = `${dataDir}/backups/arix-2026-10-23-06-03-58-924Z.sqlite`;
const safetyName = readdirSync(`${dataDir}/backups`)
  .filter((name) => name.startsWith("arix-before-order-recovery-") && name.endsWith(".sqlite"))
  .sort()
  .at(-1);

if (!safetyName) throw new Error("Sipariş kurtarma öncesi güvenlik kopyası bulunamadı.");

const live = new DatabaseSync(`${dataDir}/arix.sqlite`);
const safety = new DatabaseSync(`${dataDir}/backups/${safetyName}`, { readOnly: true });
const source = new DatabaseSync(recoverySource, { readOnly: true });
const liveState = JSON.parse(live.prepare("SELECT data FROM app_state WHERE id = 1").get().data);
const safetyState = JSON.parse(safety.prepare("SELECT data FROM app_state WHERE id = 1").get().data);
const sourceState = JSON.parse(source.prepare("SELECT data FROM app_state WHERE id = 1").get().data);
const preRecoveryIds = new Set((safetyState.orderBoard || []).map((order) => String(order.id)));
const recoveredIds = new Set((sourceState.orderBoard || [])
  .map((order) => String(order.id))
  .filter((id) => !preRecoveryIds.has(id)));
const removed = (liveState.orderBoard || []).filter((order) => recoveredIds.has(String(order.id)));
liveState.orderBoard = (liveState.orderBoard || []).filter((order) => !recoveredIds.has(String(order.id)));
const now = new Date().toISOString();

live.exec("BEGIN IMMEDIATE");
try {
  live.prepare("UPDATE app_state SET data = ?, revision = revision + 1, updated_at = ? WHERE id = 1")
    .run(JSON.stringify(liveState), now);
  live.exec("COMMIT");
} catch (error) {
  live.exec("ROLLBACK");
  throw error;
} finally {
  safety.close();
  source.close();
  live.close();
}

console.log(JSON.stringify({ removed: removed.map((order) => order.number), remaining: liveState.orderBoard.map((order) => order.number) }, null, 2));
