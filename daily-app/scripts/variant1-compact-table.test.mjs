import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

test("Vibrant 2-Row & Accurate Ledger: DailyWorkspace.tsx has semantic classes for tables", () => {
  const wsPath = path.join(rootDir, "src", "DailyWorkspace.tsx");
  const wsContent = fs.readFileSync(wsPath, "utf-8");

  // Günün əməliyyatları header & row
  assert.ok(wsContent.includes('className="op-head-no"'), "Missing op-head-no class");
  assert.ok(wsContent.includes('className="op-head-party"'), "Missing op-head-party class");
  assert.ok(wsContent.includes('className="operation-kind-cell"'), "Missing operation-kind-cell");
  assert.ok(wsContent.includes('className="operation-party wrap-cell"'), "Missing operation-party");
  assert.ok(wsContent.includes('className="operation-note-cell wrap-cell"'), "Missing operation-note-cell");

  // Hesab xülasəsi header & row
  assert.ok(wsContent.includes('className="recon-head-person"'), "Missing recon-head-person");
  assert.ok(wsContent.includes('className="recon-head-current"'), "Missing recon-head-current");
  assert.ok(wsContent.includes('className="recon-head-previous"'), "Missing recon-head-previous");
  assert.ok(wsContent.includes('className="recon-head-received"'), "Missing recon-head-received");
  assert.ok(wsContent.includes('className="recon-person-cell"'), "Missing recon-person-cell");
  assert.ok(wsContent.includes('className="recon-current-cell"'), "Missing recon-current-cell");
  assert.ok(wsContent.includes('recon-cell-previous'), "Missing recon-cell-previous");
  assert.ok(wsContent.includes('recon-cell-received'), "Missing recon-cell-received");
});

test("Vibrant 2-Row & Accurate Ledger: panel-shell.css implements vibrant colors and user-approved 2-row layout", () => {
  const cssPath = path.join(rootDir, "src", "panel-shell.css");
  const css = fs.readFileSync(cssPath, "utf-8");

  // Günün əməliyyatları has 2-row layout up to 840px
  assert.ok(css.includes("@container (max-width: 840px)"), "Missing max-width: 840px container query");
  const opRowGrid = css.match(/operation-row\s*\{[^}]+grid-template-rows:\s*auto\s+auto\s*!important/s);
  assert.ok(opRowGrid, "operation row must be a 2-row grid");

  // No note leak
  const noteMatch = css.match(/\.operation-row\s*>\s*\.operation-note-cell[^}]+display:\s*none\s*!important/s);
  assert.ok(noteMatch, ".operation-note-cell must be display: none !important");

  // Hesab xülasəsi has accurate vibrant colors (No dull grey)
  assert.ok(css.includes("color: #2563eb !important; /* Canlı Mavi — ƏSLA BOZ DEYİL */"), "Missing vibrant blue for previous balance");
  assert.ok(css.includes("color: #059669 !important; /* Canlı Yaşıl */"), "Missing vibrant green for received");
  assert.ok(css.includes("color: #dc2626 !important; /* Canlı Qırmızı */"), "Missing vibrant red for expense");
  assert.ok(css.includes("color: #d97706 !important; /* Canlı Kəhrəba / Narıncı */"), "Missing vibrant amber for supplier");

  // Zero values have full opacity, not faded 0.32
  assert.ok(!css.includes("opacity: 0.32 !important"), "Must not have opacity: 0.32 in CSS");

  // CRM side-by-side tabs and compact payment card
  assert.ok(css.includes("grid-template-columns: repeat(3, 1fr) !important;"), "CRM tabs must be 3 equal columns side-by-side");
  assert.ok(css.includes(".customer-payment-row.compact-pay-card"), "Missing compact payment card styles");
});

test("Customer CRM: CustomersCrmView.tsx has quick rename, delete and compact payments", () => {
  const crmPath = path.join(rootDir, "src", "CustomersCrmView.tsx");
  const crmContent = fs.readFileSync(crmPath, "utf-8");

  assert.ok(crmContent.includes('className="cust-action-pill-btn edit"'), "Missing quick edit customer name button");
  assert.ok(crmContent.includes('className="cust-action-pill-btn delete"'), "Missing quick delete customer button");
  assert.ok(crmContent.includes('compact-pay-card'), "Missing compact-pay-card in payments list");
  assert.ok(crmContent.includes('pay-status-pill'), "Missing pay-status-pill in payments list");
});
