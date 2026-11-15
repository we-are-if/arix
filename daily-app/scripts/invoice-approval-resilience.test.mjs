import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const rootDir = process.cwd();

test("daily-app main.tsx wraps App inside AppErrorBoundary", async () => {
  const mainPath = join(rootDir, "daily-app", "src", "main.tsx");
  const mainContent = await readFile(mainPath, "utf8");

  assert.ok(
    mainContent.includes("import AppErrorBoundary from \"../../src/components/AppErrorBoundary\""),
    "main.tsx must import AppErrorBoundary"
  );
  assert.ok(
    mainContent.includes("<AppErrorBoundary>") && mainContent.includes("</AppErrorBoundary>"),
    "main.tsx must wrap root App in <AppErrorBoundary>"
  );
});

test("DailyWorkspace has quota-safe localStorage saving for invoices and state", async () => {
  const workspacePath = join(rootDir, "daily-app", "src", "DailyWorkspace.tsx");
  const content = await readFile(workspacePath, "utf8");

  assert.ok(
    content.includes("arix-daily-invoices-v1"),
    "DailyWorkspace must manage arix-daily-invoices-v1"
  );
  assert.ok(
    content.includes("lightweight") && content.includes("screenshotDataUrl: undefined"),
    "DailyWorkspace must provide lightweight invoice fallback when localStorage quota is exceeded"
  );
  assert.ok(
    content.includes("try {") && content.includes("catch"),
    "All localStorage.setItem calls in DailyWorkspace must be wrapped in try/catch"
  );
});

test("InvoiceAttachmentView does not persist imported binary previews", async () => {
  const content = await readFile(join(rootDir, "daily-app", "src", "InvoiceAttachmentView.tsx"), "utf8");
  assert.doesNotMatch(content, /sourcePreview\s*:/);
  assert.doesNotMatch(content, /compressImageToDataUrl/);
});

test("DailyWorkspace confirmInvoice and approveInvoice handle null/undefined fields safely", async () => {
  const workspacePath = join(rootDir, "daily-app", "src", "DailyWorkspace.tsx");
  const content = await readFile(workspacePath, "utf8");

  assert.ok(
    content.includes("safeInvoiceNo = String(record.invoiceNo || \"\").trim()"),
    "confirmInvoice must sanitize invoiceNo"
  );
  assert.ok(
    content.includes("safeCustomer = String(record.customer || \"\").trim()"),
    "confirmInvoice must sanitize customer name"
  );
  assert.ok(
    content.includes("String(inv.customer || \"\").trim().toLocaleLowerCase(\"az-AZ\")"),
    "confirmInvoice must use null-safe customer matching"
  );
});

test("QaimeDocument guards items and returnItems against null or undefined", async () => {
  const docPath = join(rootDir, "daily-app", "src", "QaimeDocument.tsx");
  const content = await readFile(docPath, "utf8");

  assert.ok(
    content.includes("items?: { quantity: number; unit?: string }[]"),
    "formatQuantitySummary must accept optional items"
  );
  assert.ok(
    content.includes("(invoice.items || []).map"),
    "invoice items map must guard with fallback array"
  );
  assert.ok(
    content.includes("(returnItems || []).map"),
    "return items map must guard with fallback array"
  );
});

test("server notifies approvers when a new invoice draft is submitted", async () => {
  const serverPath = join(rootDir, "server", "index.js");
  const content = await readFile(serverPath, "utf8");

  assert.ok(
    content.includes("daily_invoice_draft_pending"),
    "server must trigger daily_invoice_draft_pending notification on new drafts"
  );
  assert.ok(
    content.includes("Yeni qaimə təsdiq gözləyir"),
    "notification title must inform approvers that a new invoice draft is awaiting approval"
  );
});
