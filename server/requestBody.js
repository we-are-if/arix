const bodies = new WeakMap();
const bodyError = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });

export function bufferRequestBody(req, { limit = 60_000_000, timeoutMs = 30_000 } = {}) {
  if (bodies.has(req)) return bodies.get(req);
  const pending = new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    let timer;
    const cleanup = () => {
      clearTimeout(timer);
      req.removeListener("data", onData);
      req.removeListener("end", onEnd);
      req.removeListener("error", onError);
      req.removeListener("aborted", onAborted);
      req.removeListener("close", onClose);
    };
    const fail = (error) => { cleanup(); req.once("error", () => {}); req.resume(); reject(error); };
    const onError = (error) => fail(error);
    const onAborted = () => fail(bodyError("Request upload interrupted"));
    const onClose = () => { if (!req.complete) onAborted(); };
    const onData = (chunk) => {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      size += buffer.length;
      if (size > limit) return fail(bodyError("Payload too large", 413));
      chunks.push(buffer);
    };
    const onEnd = () => { cleanup(); resolve(Buffer.concat(chunks)); };
    if (req.aborted || (req.destroyed && !req.complete)) return fail(bodyError("Request upload interrupted"));
    if (Number(req.headers?.["content-length"]) > limit) return fail(bodyError("Payload too large", 413));
    if (req.readableEnded) {
      if (Number(req.headers?.["content-length"]) > 0) return fail(bodyError("Request body is unavailable"));
      return resolve(Buffer.alloc(0));
    }
    req.on("data", onData);
    req.once("end", onEnd);
    req.once("error", onError);
    req.once("aborted", onAborted);
    req.once("close", onClose);
    timer = setTimeout(() => fail(bodyError("Request upload timed out", 408)), timeoutMs);
  });
  bodies.set(req, pending);
  return pending;
}

export async function parseJsonBody(req, limit = 1_000_000) {
  const bytes = await bufferRequestBody(req);
  if (bytes.length > limit) throw bodyError("Payload too large", 413);
  const raw = bytes.toString("utf8");
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); }
  catch { throw bodyError("Invalid JSON"); }
}

export async function runQueuedRequest(req, res, enqueue, task) {
  // Slow or abandoned uploads must never occupy the shared database mutation queue.
  await bufferRequestBody(req);
  return enqueue(() => {
    if (req.aborted || res.destroyed || res.writableEnded) return;
    return task();
  });
}
