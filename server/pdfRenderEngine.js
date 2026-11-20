import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

const MEMORY_CACHE_LIMIT = 80;
const DISK_CACHE_LIMIT = 100;
const WARM_BROWSER_IDLE_MS = 180_000;

export function createPdfRenderEngine({ dataDir, findBrowserExecutable, execFileAsync }) {
  const cacheDir = join(dataDir, "pdf-render-cache");
  const memoryCache = new Map();
  const pendingRenders = new Map();

  let warmBrowser = null;
  let warmQueue = Promise.resolve();
  let pruneRunning = false;

  async function pruneDiskCache() {
    if (pruneRunning) return;
    pruneRunning = true;
    try {
      const names = (await readdir(cacheDir)).filter((name) => name.endsWith(".pdf"));
      if (names.length <= DISK_CACHE_LIMIT) return;
      const entries = await Promise.all(
        names.map(async (name) => {
          const fullPath = join(cacheDir, name);
          try {
            const info = await stat(fullPath);
            return { fullPath, mtimeMs: info.mtimeMs };
          } catch {
            return null;
          }
        }),
      );
      const valid = entries.filter(Boolean).sort((a, b) => b.mtimeMs - a.mtimeMs);
      for (const stale of valid.slice(DISK_CACHE_LIMIT)) {
        await unlink(stale.fullPath).catch(() => {});
      }
    } catch {
      // Ignore background prune errors.
    } finally {
      pruneRunning = false;
    }
  }

  function rememberPdf(fingerprint, pdf) {
    if (memoryCache.has(fingerprint)) memoryCache.delete(fingerprint);
    memoryCache.set(fingerprint, pdf);
    while (memoryCache.size > MEMORY_CACHE_LIMIT) {
      const oldestKey = memoryCache.keys().next().value;
      if (!oldestKey) break;
      memoryCache.delete(oldestKey);
    }
  }

  function closeWarmBrowser() {
    if (!warmBrowser) return;
    const active = warmBrowser;
    warmBrowser = null;
    if (active.idleTimer) clearTimeout(active.idleTimer);
    for (const { reject, timer } of active.pending.values()) {
      clearTimeout(timer);
      reject(new Error("PDF tarayıcı oturumu kapatıldı."));
    }
    active.pending.clear();
    active.listeners.clear();
    try {
      active.proc.kill();
    } catch {
      // Ignore kill errors on already exited process.
    }
  }

  async function getWarmBrowser() {
    if (warmBrowser && warmBrowser.proc.exitCode === null && !warmBrowser.proc.killed) {
      if (warmBrowser.idleTimer) clearTimeout(warmBrowser.idleTimer);
      warmBrowser.idleTimer = setTimeout(closeWarmBrowser, WARM_BROWSER_IDLE_MS);
      warmBrowser.idleTimer.unref?.();
      return warmBrowser;
    }
    closeWarmBrowser();
    const browserExecutable = await findBrowserExecutable();
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--no-first-run",
      "--remote-debugging-pipe",
    ];
    if (process.platform === "linux") args.unshift("--no-sandbox", "--disable-dev-shm-usage");
    const proc = spawn(browserExecutable, args, {
      stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const toChrome = proc.stdio[3];
    const fromChrome = proc.stdio[4];
    const pending = new Map();
    const listeners = new Map();
    let buffer = "";
    let nextMessageId = 1;

    fromChrome.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let delimiterIndex;
      while ((delimiterIndex = buffer.indexOf("\0")) !== -1) {
        const raw = buffer.slice(0, delimiterIndex);
        buffer = buffer.slice(delimiterIndex + 1);
        if (!raw) continue;
        let msg;
        try {
          msg = JSON.parse(raw);
        } catch {
          continue;
        }
        if (msg.id && pending.has(msg.id)) {
          const entry = pending.get(msg.id);
          pending.delete(msg.id);
          clearTimeout(entry.timer);
          if (msg.error) entry.reject(new Error(msg.error.message || "CDP hatası"));
          else entry.resolve(msg.result);
        } else if (msg.method) {
          const key = `${msg.sessionId || ""}:${msg.method}`;
          const callback = listeners.get(key);
          if (callback) {
            listeners.delete(key);
            callback(msg.params);
          }
        }
      }
    });

    const rejectAllPending = (reason) => {
      const error = reason instanceof Error ? reason : new Error("PDF tarayıcı oturumu kapatıldı.");
      for (const { reject, timer } of pending.values()) {
        clearTimeout(timer);
        reject(error);
      }
      pending.clear();
      listeners.clear();
    };

    const handleExit = (err) => {
      rejectAllPending(err);
      if (warmBrowser?.proc === proc) closeWarmBrowser();
    };
    proc.once("exit", handleExit);
    proc.once("error", handleExit);
    toChrome.on("error", handleExit);
    fromChrome.on("error", handleExit);

    const send = (method, params = {}, sessionId) =>
      new Promise((resolve, reject) => {
        if (proc.exitCode !== null || proc.killed) {
          reject(new Error("PDF tarayıcısı çalışmıyor."));
          return;
        }
        const id = nextMessageId++;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`PDF CDP zaman aşımı: ${method}`));
        }, 25_000);
        timer.unref?.();
        pending.set(id, { resolve, reject, timer });
        try {
          toChrome.write(
            JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + "\0",
          );
        } catch (err) {
          clearTimeout(timer);
          pending.delete(id);
          reject(err);
        }
      });

    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Page.enable", {}, sessionId);

    const idleTimer = setTimeout(closeWarmBrowser, WARM_BROWSER_IDLE_MS);
    idleTimer.unref?.();
    warmBrowser = { proc, send, pending, listeners, targetId, sessionId, idleTimer };
    return warmBrowser;
  }

  async function renderViaWarmBrowser(htmlPath) {
    const run = async () => {
      const browser = await getWarmBrowser();
      const { send, listeners, sessionId } = browser;
      const fileUrl = new URL(`file:///${htmlPath.replace(/\\/g, "/")}`).href;
      const loadKey = `${sessionId}:Page.loadEventFired`;
      let loadTimer;
      const loadPromise = new Promise((resolve) => {
        loadTimer = setTimeout(() => {
          listeners.delete(loadKey);
          resolve();
        }, 8_000);
        loadTimer.unref?.();
        listeners.set(loadKey, () => {
          clearTimeout(loadTimer);
          resolve();
        });
      });
      await send("Page.navigate", { url: fileUrl }, sessionId);
      await loadPromise;
      await send(
        "Runtime.evaluate",
        {
          expression:
            "document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true",
          awaitPromise: true,
        },
        sessionId,
      ).catch(() => {});
      const { data } = await send(
        "Page.printToPDF",
        {
          displayHeaderFooter: false,
          printBackground: true,
          preferCSSPageSize: true,
        },
        sessionId,
      );
      const pdf = Buffer.from(String(data || ""), "base64");
      if (!pdf.length || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
        throw new Error("PDF tarayıcısı geçerli bir dosya oluşturamadı.");
      }
      return pdf;
    };
    const task = warmQueue.then(run, run);
    warmQueue = task.catch(() => {});
    return task;
  }

  async function renderViaCliFallback(htmlPath, jobDirectory) {
    const pdfPath = join(jobDirectory, "approval.pdf");
    const browserExecutable = await findBrowserExecutable();
    const browserArguments = [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--no-first-run",
      "--no-pdf-header-footer",
      `--user-data-dir=${join(jobDirectory, "profile")}`,
      `--print-to-pdf=${pdfPath}`,
      new URL(`file:///${htmlPath.replace(/\\/g, "/")}`).href,
    ];
    if (process.platform === "linux") {
      browserArguments.unshift("--no-sandbox", "--disable-dev-shm-usage");
    }
    await execFileAsync(browserExecutable, browserArguments, {
      windowsHide: true,
      timeout: 45_000,
      maxBuffer: 2_000_000,
    });
    const pdf = await readFile(pdfPath);
    if (!pdf.length || pdf.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("PDF tarayıcısı geçerli bir dosya oluşturamadı.");
    }
    return pdf;
  }

  return async function renderOrderApprovalPdf(html) {
    const source = String(html ?? "");
    if (!source || source.length > 5_000_000) {
      throw new Error("PDF HTML məlumatı etibarsızdır.");
    }
    if (
      /<\s*(script|iframe|object|embed|link)\b/i.test(source) ||
      /\son[a-z]+\s*=/i.test(source)
    ) {
      throw new Error("PDF HTML məlumatında icazəsiz element var.");
    }

    const fingerprint = createHash("sha256").update(source).digest("hex");
    const memoryHit = memoryCache.get(fingerprint);
    if (memoryHit) return memoryHit;

    const cacheFile = join(cacheDir, `${fingerprint}.pdf`);
    try {
      const cachedBytes = await readFile(cacheFile);
      if (cachedBytes.length > 5 && cachedBytes.subarray(0, 5).toString("ascii") === "%PDF-") {
        rememberPdf(fingerprint, cachedBytes);
        return cachedBytes;
      }
    } catch {
      // Cache miss on disk; proceed to render.
    }

    if (pendingRenders.has(fingerprint)) return pendingRenders.get(fingerprint);

    const work = (async () => {
      const jobDirectory = await mkdtemp(join(dataDir, "approval-render-"));
      const htmlPath = join(jobDirectory, "approval.html");
      try {
        await writeFile(htmlPath, source, "utf8");
        let pdf;
        try {
          pdf = await renderViaWarmBrowser(htmlPath);
        } catch {
          closeWarmBrowser();
          pdf = await renderViaCliFallback(htmlPath, jobDirectory);
        }
        rememberPdf(fingerprint, pdf);
        await mkdir(cacheDir, { recursive: true }).catch(() => {});
        const tempFile = `${cacheFile}.${randomUUID()}.tmp`;
        await writeFile(tempFile, pdf)
          .then(() => rename(tempFile, cacheFile))
          .catch(() => unlink(tempFile).catch(() => {}));
        void pruneDiskCache();
        return pdf;
      } finally {
        await rm(jobDirectory, { recursive: true, force: true }).catch(() => {});
      }
    })();

    pendingRenders.set(fingerprint, work);
    try {
      return await work;
    } finally {
      pendingRenders.delete(fingerprint);
    }
  };
}
