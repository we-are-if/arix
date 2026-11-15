import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

test("DailyWorkspace wires up AccountStatementModal and clickable reconciliation rows", () => {
  const tsxContent = fs.readFileSync(path.join(rootDir, "src", "DailyWorkspace.tsx"), "utf8");

  // Check state and handlers
  assert.ok(tsxContent.includes("statementAccountName"), "DailyWorkspace must hold statementAccountName state");
  assert.ok(tsxContent.includes("AccountStatementModal"), "DailyWorkspace must render AccountStatementModal");
  assert.ok(tsxContent.includes("clickable-recon-row"), "DailyWorkspace reconciliation rows must have clickable-recon-row");
  assert.ok(tsxContent.includes("reconciliation-mobile-card"), "DailyWorkspace must have responsive mobile card structure");
  assert.ok(tsxContent.includes("openEntryForAccount"), "DailyWorkspace must support adding transactions directly for an account");
});

test("CSS styles for AccountStatementModal and responsive mobile cards are defined", () => {
  const cssContent = fs.readFileSync(path.join(rootDir, "src", "panel-shell.css"), "utf8");

  // Verify modal classes
  assert.ok(cssContent.includes(".statement-backdrop"), "CSS must contain .statement-backdrop");
  assert.ok(cssContent.includes(".statement-modal"), "CSS must contain .statement-modal");
  assert.ok(cssContent.includes(".statement-kpis"), "CSS must contain .statement-kpis");
  assert.ok(cssContent.includes(".statement-entry-item"), "CSS must contain .statement-entry-item");
  assert.ok(cssContent.includes(".statement-sheet-handle"), "CSS must contain mobile handle");
  assert.ok(cssContent.includes(".reconciliation-mobile-card"), "CSS must define .reconciliation-mobile-card");
  assert.ok(cssContent.includes("statementSlideUp"), "CSS must define slide-up animation for mobile bottom sheet");

  // Verify that rigid 658px/760px/570px horizontal table width on mobile is eliminated
  assert.ok(!cssContent.includes("width: 658px !important;"), "Hardcoded 658px width must be removed");
  assert.ok(!cssContent.includes("width: 760px !important;"), "Hardcoded 760px width must be removed");

  // Verify modern 2-line mobile operation card
  assert.ok(cssContent.includes(".operation-mobile-card"), "CSS must define .operation-mobile-card");
  assert.ok(cssContent.includes(".op-m-row-top"), "CSS must define .op-m-row-top");
  assert.ok(cssContent.includes(".op-m-row-meta"), "CSS must define .op-m-row-meta");
  assert.ok(cssContent.includes(".op-m-kind-icon"), "CSS must define .op-m-kind-icon");
});

test("Variant A expense payment method, bank badge in statement, and invoice sorting are wired up", () => {
  const tsxContent = fs.readFileSync(path.join(rootDir, "src", "DailyWorkspace.tsx"), "utf8");
  const invoiceTsx = fs.readFileSync(path.join(rootDir, "src", "InvoiceAttachmentView.tsx"), "utf8");
  const cssContent = fs.readFileSync(path.join(rootDir, "src", "panel-shell.css"), "utf8");

  // Variant A: Expense method toggle and card limit integration
  assert.ok(tsxContent.includes("expenseMethod"), "DailyWorkspace must support expenseMethod");
  assert.ok(tsxContent.includes("diff_bank"), "DailyWorkspace must support diff_bank expense method");
  assert.ok(tsxContent.includes("expense-method-toggle"), "DailyWorkspace must render expense-method-toggle");
  assert.ok(cssContent.includes(".expense-method-toggle"), "CSS must style .expense-method-toggle");

  // Account statement modal bank badge & logo
  assert.ok(tsxContent.includes("entry-bank-tag"), "AccountStatementModal must render entry-bank-tag");
  assert.ok(cssContent.includes(".entry-bank-tag"), "CSS must style .entry-bank-tag");

  // Invoice sorting: descending order
  assert.ok(invoiceTsx.includes("parseInvoiceDateToTime"), "InvoiceAttachmentView must parse invoice dates for sorting");
  assert.ok(invoiceTsx.includes("timeB - timeA"), "InvoiceAttachmentView must sort invoices descending (newest first)");
  assert.ok(invoiceTsx.includes("openCreateTrigger"), "InvoiceAttachmentView must support openCreateTrigger");

  // Bottom navigation + Yarat button context-awareness
  assert.ok(tsxContent.includes("handleUniversalCreate"), "DailyWorkspace must have handleUniversalCreate");
  assert.ok(tsxContent.includes("openCreateTrigger={invoiceCreateSignal}"), "DailyWorkspace must wire invoice create signal");
});
