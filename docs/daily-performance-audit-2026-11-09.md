# Daily production performance investigation — 2026-11-09

Read-only investigation of production `/opt/arix`, approximately 14:55–15:00 UTC. No financial records changed, no service restarted, no release performed.

## Verified findings

- Production `server/index.js:10440` uses a single mutation queue for all non-read requests. Daily companies and other application writes share this queue. Separate SQLite files do not remove this application-level contention.
- Production Daily state is a single JSON row per company. `database.js` clones and serializes the entire state on every write. Azart state was 27,548,837 UTF-8 bytes; SpareXpert 317,607 bytes.
- Azart snapshot invoice fields include approximately 21.56 MB of screenshotDataUrl and 0.67 MB of returnScreenshotDataUrl (sizes measured by Python JSON serialization). Images dominate the snapshot, despite only 1,056 entries and 385 invoices.
- Access log sample 13:54:03–14:56:27 UTC: 1,817 GET /api/daily responses, average logged body bytes 12,640,807 across clients/companies; 148 PUT /api/daily responses. These are logged origin response bytes, not measured end-user network traffic. Company breakdown cannot be determined from this access log.
- Local frontend polls the whole snapshot every four seconds even with SSE connected; snapshot_saved events also fetch the snapshot. Production response sizes confirm repeated large snapshots, although deployed bundle cadence was not separately traced.
- Three isolated read-only Node samples on the production host measured Azart structuredClone at 176–264 ms and JSON.stringify at 269–311 ms (combined 470–554 ms). SpareXpert combined 9–11 ms. These are synthetic CPU measurements, not actual endpoint durations and do not include persistence, normalization, queuing or network latency.
- Production handleDaily constructs withAzartNotifications for all its resources; wrapper clones the snapshot when constructed. Read-only requests therefore also incur snapshot cloning through this wrapper.
- Production notification wrapper already calls deferDailyInvoicePush. Earlier local-code inference that this wrapper waits for actual push delivery was incomplete. The background helper subsequently enqueues a complete company-state rewrite per notification result to store subscription delivery metadata.
- Some explicit push paths still await delivery inside the global queue. Push subscriptions are processed sequentially with a 5,000 ms request timeout. Azart maximum subscriptions per user: four; SpareXpert: three. SpareXpert entry-change resolution explicitly awaits push before persistence; Azart defers this particular resolution push. This can explain multi-second waits, but a particular reported 15-second request was not traced and no timeout was deliberately induced.
- Host: two CPUs, 3,819 MB RAM, 2,360 MB available at first sample, disk 46% used. API process reported 65.2% lifetime CPU at sample. This is not a CPU profile or instantaneous utilization measurement.
- Recent access logs since 14:30 UTC contained 1,835 HTTP 200, 19 HTTP 201 and two HTTP 409 responses at observation. Earlier 502 clusters included 14:25–14:27. Service journal shows a shutdown timeout/forced kill before restart at 14:27:08; do not attribute these historical 502s to ongoing database contention.
- SSE response sets X-Accel-Buffering: no. No evidence obtained that proxy buffering is the primary cause.

## Recommended implementation order

1. Add request timing for queue wait, handler/persistence, response size and push jobs. Keep financial/user payloads out of logs. Baseline representative create/edit/approve/delete/list/report flows.
2. Stop transferring unchanged full snapshots: authenticated company-scoped revision check/conditional response before serialization, coalesce refresh requests, and use SSE plus lightweight fallback. Preserve reconnect recovery and pending local changes.
3. Move invoice images to protected company-scoped attachment storage. Preserve all images and verify migration before removing embedded copies; fetch images when opening the relevant invoice.
4. Persist push jobs atomically with the business write and deliver in a bounded background worker. Store subscription outcomes separately/batched rather than rewriting financial state per notification. Remove remaining inline external push waits.
5. Separate business writes by validated company/store queue after auditing shared resources, auth and cross-company administration. Retain dedicated synchronization for shared mutations. Simply removing the global queue would introduce lost updates; per-company queues alone do not isolate synchronous CPU work in the shared Node process.
6. Move frequently changed entities from the single JSON row into transactional tables, with company-scoped idempotency, revisions and atomic transfers. Stage this migration with reconciliation and recovery tests. Database product or hardware changes are decisions after measurement, not prerequisites for the first improvements.

## Validation before release

Use isolated seeded test databases and two clients per company. Measure p50/p95/p99, simultaneous writes, slow/unavailable push provider, reconnect/retry, duplicate prevention, approvals, transfer consistency, unchanged report totals, deleted-record resurrection and cross-company access/events. Do not generate financial test entries in production. No one-second guarantee is established by this investigation.

## Implemented and released

Production release `/root/daily-performance.G10uJJYY`, backup `/root/daily-performance.G10uJJYY/backup-1794237821`.

- Read-only session/membership checks no longer clone complete financial states. Notification comparisons retain only IDs/statuses, not image-bearing snapshots.
- Per-company mutation scheduling with exclusive barriers for shared/auth changes; session/company revalidated inside the selected queue.
- Durable per-company SQLite push outbox, transactionally inserted for staged business notifications. Deferred existing notification paths enqueue small independent jobs. Delivery no longer rewrites the financial snapshot and retries without holding a business mutation queue.
- Company/user-scoped snapshot ETags with authorization before conditional replies. Shared transport installed in both existing production workspaces; future builds import the same implementation from `shared/dailyTransport.js`.
- Invoice images projected to authenticated company-specific image URLs and stored in separate attachment files. Incoming edit/snapshot references restore the original embedded bytes before financial/lifecycle validation. Original image data remains in financial state, making this a compatible read optimization rather than a destructive migration.
- Graceful shutdown closes SSE streams. Slow request diagnostics log route/company/duration without financial bodies.

38 targeted unit/integration checks passed. Private loopback API server using isolated production database copies verified concurrent creates, retry deduplication, update/delete approvals, company isolation, image authorization and image-preserving snapshot saves. No test financial records were written to production.

Final isolated API sample: Azart response 783,337 bytes (previously 22,978,091); unchanged reads 4.6 ms; create 768.8 ms; update/delete approval 1,025.8/980.2 ms. SpareXpert unchanged reads 4.2 ms; create 17.9 ms; update/delete approval 18.1/14.4 ms. These are samples over host loopback, not end-user latency percentiles. First image-cache preparation took approximately 1.16 s in the isolated run.

Live release checks: API active, both transport assets served, unauthenticated snapshot/image requests rejected, both SQLite quick_checks OK. Full financial state is still stored as a JSON row; relational entity migration remains a future scaling improvement. Hardware/database-product migration was not performed.
