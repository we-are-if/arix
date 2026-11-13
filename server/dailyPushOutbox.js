import { randomUUID } from "node:crypto";

// Jobs travel with the next business write and are inserted in the same transaction.
export function stageDailyPush(current, message) {
  const subscriptions = (current.pushSubscriptions || []).filter((s) => String(s.userId) === String(message.recipientUserId));
  if (!subscriptions.length) return;
  (current.__dailyPushJobs ||= []).push({ id: randomUUID(), message, subscriptions: structuredClone(subscriptions) });
}

export function createPushOutbox(db, deliver, { intervalMs = 1000, now = Date.now } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS daily_push_outbox (
    id TEXT PRIMARY KEY, payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
    available_at INTEGER NOT NULL, completed_at INTEGER, created_at INTEGER NOT NULL
  )`);
  let stopped = false, running = false;
  const insert = db.prepare("INSERT OR IGNORE INTO daily_push_outbox(id,payload,available_at,created_at) VALUES(?,?,?,?)");
  const enqueue = (jobs) => { for (const job of jobs) insert.run(job.id, JSON.stringify(job), now(), now()); };
  const drain = async () => {
    if (running || stopped) return;
    running = true;
    try {
      const jobs = db.prepare("SELECT id,payload,attempts FROM daily_push_outbox WHERE completed_at IS NULL AND available_at <= ? ORDER BY created_at LIMIT 4").all(now());
      await Promise.all(jobs.map(async (row) => {
        try {
          await deliver(JSON.parse(row.payload));
          if (!stopped) db.prepare("UPDATE daily_push_outbox SET completed_at=?,payload='{}' WHERE id=?").run(now(), row.id);
        } catch {
          if (stopped) return;
          const attempts = row.attempts + 1;
          // Keep failed jobs inspectable; transient failures retry without blocking writes.
          db.prepare("UPDATE daily_push_outbox SET attempts=?,available_at=? WHERE id=?")
            .run(attempts, now() + Math.min(3_600_000, 5000 * 2 ** Math.min(attempts, 10)), row.id);
        }
      }));
    } finally { running = false; }
  };
  const timer = setInterval(() => { void drain().catch(() => {}); }, intervalMs);
  timer.unref();
  return { enqueue, drain, stop() { stopped = true; clearInterval(timer); } };
}
