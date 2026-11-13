import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

// One serialized representation per current company state, never shared by revision alone.
const cache = new Map();
export function sendDailySnapshot(req, res, current, companyId) {
  const etag = '"daily-v2-' + createHash("sha256").update(JSON.stringify([
    companyId, req.authUser.id, current.snapshotRevision, current.updatedAt,
  ])).digest("hex").slice(0, 32) + '"';
  const headers = { "Cache-Control": "private, no-cache", ETag: etag, Vary: "Cookie, Accept-Encoding", "Content-Type": "application/json; charset=utf-8" };
  if (req.headers["if-none-match"] === etag) {
    res.writeHead(304, headers); res.end(); return;
  }
  let record = cache.get(companyId);
  if (!record || record.snapshot !== current.snapshot || record.revision !== current.snapshotRevision || record.updatedAt !== current.updatedAt) {
    const body = Buffer.from(JSON.stringify({ data: current.snapshot, revision: current.snapshotRevision, updatedAt: current.updatedAt, updatedBy: current.updatedBy }));
    record = { snapshot: current.snapshot, revision: current.snapshotRevision, updatedAt: current.updatedAt, body, gzip: null };
    cache.set(companyId, record);
  }
  const acceptsGzip = /(?:^|,)\s*gzip\s*(?:,|$)/i.test(req.headers["accept-encoding"] || "");
  if (acceptsGzip && !record.gzip) record.gzip = gzipSync(record.body, { level: 1 });
  const body = acceptsGzip ? record.gzip : record.body;
  res.writeHead(200, { ...headers, "Content-Length": body.length, ...(acceptsGzip ? { "Content-Encoding": "gzip" } : {}) });
  res.end(body);
}
