import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPdfRenderEngine } from "./pdfRenderEngine.js";

test("pdfRenderEngine caches rendered PDFs in memory and on disk and deduplicates concurrent requests", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "arix-pdf-engine-test-"));
  let cliRenderCount = 0;

  try {
    const engine = createPdfRenderEngine({
      dataDir,
      findBrowserExecutable: async () => "/non-existent-browser-for-cdp-test",
      execFileAsync: async (_exe, args) => {
        cliRenderCount += 1;
        await new Promise((r) => setTimeout(r, 25));
        const printArg = args.find((a) => String(a).startsWith("--print-to-pdf="));
        const pdfPath = printArg.slice("--print-to-pdf=".length);
        await writeFile(pdfPath, Buffer.from("%PDF-1.4\nTEST PDF CONTENT\n%%EOF", "utf8"));
      },
    });

    const html = "<!doctype html><html><body><h1>Sipariş Onay Formu</h1></body></html>";

    const [first, second] = await Promise.all([engine(html), engine(html)]);
    assert.equal(cliRenderCount, 1);
    assert.equal(first.toString("utf8"), second.toString("utf8"));

    // Subsequent call hits memory cache
    const third = await engine(html);
    assert.equal(cliRenderCount, 1);
    assert.equal(third.toString("utf8"), first.toString("utf8"));

    // A fresh engine instance on the same dataDir hits disk cache without rendering again
    const secondEngine = createPdfRenderEngine({
      dataDir,
      findBrowserExecutable: async () => "/non-existent-browser-for-cdp-test",
      execFileAsync: async () => {
        cliRenderCount += 1;
        throw new Error("Should not render when disk cache exists");
      },
    });
    const fourth = await secondEngine(html);
    assert.equal(cliRenderCount, 1);
    assert.equal(fourth.toString("utf8"), first.toString("utf8"));
  } finally {
    await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  }
});

test("pdfRenderEngine rejects unsafe HTML elements and attributes", async () => {
  const dataDir = await mkdtemp(join(tmpdir(), "arix-pdf-engine-security-"));
  try {
    const engine = createPdfRenderEngine({
      dataDir,
      findBrowserExecutable: async () => "chrome",
      execFileAsync: async () => {},
    });
    await assert.rejects(() => engine(""), /etibarsızdır/);
    await assert.rejects(() => engine("<html><script>alert(1)</script></html>"), /icazəsiz element/);
    await assert.rejects(() => engine('<html><div onclick="evil()">x</div></html>'), /icazəsiz element/);
  } finally {
    await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  }
});
