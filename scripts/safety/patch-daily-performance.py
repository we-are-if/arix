"""Apply the same focused edits to the working source and a captured production baseline."""
from pathlib import Path

def replace(text, old, new, count=1):
    if text.count(old) != count:
        raise RuntimeError(f'Expected {count} matches, got {text.count(old)}: {old[:100]}')
    return text.replace(old, new)

def patch_database(text):
    text = replace(text, 'import { DatabaseSync } from "node:sqlite";', 'import { DatabaseSync } from "node:sqlite";\nimport { createPushOutbox } from "./dailyPushOutbox.js";')
    text = replace(text, 'sqlitePath = join(dataDir, "arix.sqlite") })', 'sqlitePath = join(dataDir, "arix.sqlite"), pushDelivery = null })')
    text = replace(text, 'let cachedState = null;', 'let cachedState = null;\n  let outbox = null;')
    text = replace(text, '    return database;\n  };', '    if (pushDelivery) outbox = createPushOutbox(database, (job) => pushDelivery(job, cachedState));\n    return database;\n  };')
    text = replace(text, '    const snapshot = cloneState(value);', '    const snapshot = cloneState(value);\n    const pushJobs = snapshot.__dailyPushJobs || [];\n    delete snapshot.__dailyPushJobs;')
    text = replace(text, '        db.exec("COMMIT");', '        if (outbox) outbox.enqueue(pushJobs);\n        db.exec("COMMIT");')
    text = replace(text, '    database.close();', '    outbox?.stop();\n    database.close();')
    text = replace(text, 'return { initialize, read, write, createDailyBackup, status, close };', 'return { initialize, read, write, createDailyBackup, status, close,\n    supportsAtomicPush: Boolean(pushDelivery),\n    enqueuePush: (jobs) => { open(); outbox?.enqueue(jobs); },\n  };')
    return text

def patch_index(text):
    text = replace(text, 'import "dotenv/config";', 'import "dotenv/config";\nimport { stageDailyPush } from "./dailyPushOutbox.js";\nimport { sendDailySnapshot } from "./dailySnapshotResponse.js";\nimport { createMutationScheduler } from "./mutationScheduler.js";')
    text = replace(text, 'sqlitePath: join(DAILY_DATA_DIR, comp.sqliteFile),', 'sqlitePath: join(DAILY_DATA_DIR, comp.sqliteFile),\n      pushDelivery: deliverDailyPushJob,')
    text = replace(text, 'const normalizeDailyDb = (value) => ({', 'const normalizeDailyDb = (value) => ({\n  ...(value?.__dailyPushJobs?.length ? { __dailyPushJobs: value.__dailyPushJobs } : {}),')
    begin = text.index('async function sendDailyPushNotification(')
    end = text.index('\n}', begin) + 2
    text = text[:begin] + '''async function sendDailyPushNotification(current, message) {
  if (VAPID_PUBLIC_KEY) stageDailyPush(current, message);
}

async function deliverDailyPushJob(job, latest) {
  if (!VAPID_PUBLIC_KEY || !latest) throw new Error("Daily push not ready");
  const user = latest.authUsers?.find((u) => String(u.id) === String(job.message.recipientUserId));
  if (!user || user.active === false || !allowsDailyNotice(latest, user.id, job.message)) return;
  const liveEndpoints = new Set((latest.pushSubscriptions || []).filter((s) => String(s.userId) === String(user.id)).map((s) => s.endpoint));
  const { title, body, type = "daily", url = "/", relatedId = "" } = job.message;
  const results = await Promise.allSettled(job.subscriptions.filter((s) => liveEndpoints.has(s.endpoint)).map(async (item) => {
    try {
      await webPush.sendNotification(item.subscription, JSON.stringify({ title, body, type, url, relatedId }), { TTL: 86_400, urgency: "high", timeout: 5000 });
    } catch (error) {
      if (![404, 410].includes(error?.statusCode)) throw error;
    }
  }));
  if (results.some((r) => r.status === "rejected")) throw new Error("Daily push temporarily unavailable");
}''' + text[end:]
    if 'function deferDailyInvoicePush(' in text:
        begin = text.index('function deferDailyInvoicePush(')
        end = text.index('\n}', begin) + 2
        text = text[:begin] + '''function deferDailyInvoicePush(store, current, message) {
  const staged = { pushSubscriptions: current.pushSubscriptions };
  if (VAPID_PUBLIC_KEY) stageDailyPush(staged, message);
  if (staged.__dailyPushJobs?.length) store.enqueuePush(staged.__dailyPushJobs);
}''' + text[end:]
    # Read-only authorization never needs to copy invoice images. Mutating auth
    # endpoints retain their defensive copies (switch-company modifies sessionDb).
    begin = text.index('async function getAvailableCompaniesForUser(')
    end = text.index('\nasync function findDailySessionAndUser(', begin)
    segment = text[begin:end].replace('.read()', '.read({ clone: false })')
    text = text[:begin] + segment + text[end:]
    begin = text.index('async function findDailySessionAndUser(')
    end = text.index('\n}', begin) + 2
    segment = text[begin:end].replace('.read()', '.read({ clone: String(req.url || "").startsWith("/api/daily-auth/") && databaseReadContext.getStore()?.clone !== false })')
    text = text[:begin] + segment + text[end:]
    begin = text.index('async function handleDaily(')
    end = text.index('\n}', begin) + 2
    segment = text[begin:end]
    if 'const current = await notificationStore.read();' in segment:
        segment = replace(segment, 'const current = await notificationStore.read();', 'const current = await notificationStore.read({ clone: req.method !== "GET" && req.method !== "HEAD" });')
    else:
        segment = replace(segment, 'const current = await store.read();', 'const current = await store.read({ clone: req.method !== "GET" && req.method !== "HEAD" });')
    old = '''    return send(res, 200, {
      data: current.snapshot,
      revision: current.snapshotRevision,
      updatedAt: current.updatedAt,
      updatedBy: current.updatedBy,
    });'''
    segment = replace(segment, old, '    return sendDailySnapshot(req, res, current, notificationCompanyId);')
    text = text[:begin] + segment + text[end:]
    text = replace(text, 'let mutationQueue = Promise.resolve();\n\nfunction enqueueMutation(task) {\n  const result = mutationQueue.then(task, task);\n  mutationQueue = result.catch(() => undefined);\n  return result;\n}', '''const scheduleMutation = createMutationScheduler();
function enqueueMutation(task) { return scheduleMutation(null, task); }
async function enqueueRequestMutation(req, task) {
  if (String(req.url || "").split("?", 1)[0].startsWith("/api/daily/" ) || String(req.url || "").split("?", 1)[0] === "/api/daily") {
    const sessionInfo = await findDailySessionAndUser(req);
    if (sessionInfo?.user) {
      req.dailyQueueCompany = sessionInfo.activeCompanyId;
      return scheduleMutation("daily:" + req.dailyQueueCompany, task);
    }
  }
  return enqueueMutation(task);
}''')
    text = replace(text, 'runQueuedRequest(req, res, enqueueMutation,', 'runQueuedRequest(req, res, (task) => enqueueRequestMutation(req, task),')
    text = replace(text, '      req.dailyCompanyId = sessionInfo.activeCompanyId;', '''      if (req.dailyQueueCompany && req.dailyQueueCompany !== sessionInfo.activeCompanyId) {
        return send(res, 409, { error: "Şirkət dəyişib. Səhifəni yeniləyin.", code: "DAILY_COMPANY_CHANGED" });
      }
      req.dailyCompanyId = sessionInfo.activeCompanyId;''')
    return text

if __name__ == '__main__':
    for prefix in ['server/', 'tmp/performance-fix/live-']:
        for name, patch in [('index.js', patch_index), ('database.js', patch_database)]:
            path = Path(prefix + name)
            updated = patch(path.read_text(encoding='utf-8'))
            destination = path if prefix == 'server/' else Path('tmp/performance-fix/' + name)
            destination.write_text(updated, encoding='utf-8')
