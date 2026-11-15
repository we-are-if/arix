import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("CustomersCrmView implements side-by-side tabs, compact payments, rename & delete with warning modals, and add customer modal", () => {
  const crmSrc = fs.readFileSync(path.resolve("daily-app/src/CustomersCrmView.tsx"), "utf-8");
  const workspaceSrc = fs.readFileSync(path.resolve("daily-app/src/DailyWorkspace.tsx"), "utf-8");
  const cssSrc = fs.readFileSync(path.resolve("daily-app/src/panel-shell.css"), "utf-8");

  // 1. Side-by-side Tabs (shortened labels)
  assert.match(crmSrc, /customer-detail-tabs/, "Must have customer-detail-tabs container");
  assert.match(crmSrc, />Qaimələr</, "Tab label should be shortened to Qaimələr");
  assert.match(crmSrc, />Ödənişlər</, "Tab label should be shortened to Ödənişlər");
  assert.match(crmSrc, />Profil</, "Tab label should be shortened to Profil");
  assert.match(cssSrc, /grid-auto-flow:\s*column\s*!important/, "CSS must enforce side-by-side tabs using grid-auto-flow column");

  // 2. Compact 2-line Payments without blank wasted space
  assert.match(crmSrc, /customer-payments-list/, "Must render customer-payments-list");
  assert.match(crmSrc, /customer-payment-row/, "Must render customer-payment-row");
  assert.match(crmSrc, /pay-row-top/, "Payment card must have pay-row-top");
  assert.match(crmSrc, /pay-row-bottom/, "Payment card must have pay-row-bottom");
  assert.match(crmSrc, /pay-amount/, "Payment card must have pay-amount on top right");
  assert.match(crmSrc, /pay-channel-pill/, "Payment card must have pay-channel-pill on bottom left");

  // 3. Rename Customer with Warning Modal
  assert.match(crmSrc, /renameModalOpen/, "Must support rename modal state");
  assert.match(crmSrc, /handleConfirmRenameCustomer/, "Must have confirm rename handler");
  assert.match(crmSrc, /Müştəri Adının Dəyişdirilməsi/, "Must display rename warning modal title");
  assert.match(workspaceSrc, /renameCustomer/, "DailyWorkspace must implement renameCustomer");
  assert.match(workspaceSrc, /onRenameCustomer=\{renameCustomer\}/, "DailyWorkspace must pass onRenameCustomer");

  // 4. Delete Customer with Warning Modal
  assert.match(crmSrc, /deleteModalOpen/, "Must support delete modal state");
  assert.match(crmSrc, /handleConfirmDeleteCustomer/, "Must have confirm delete handler");
  assert.match(crmSrc, /customer-danger-zone/, "Profile tab must have customer-danger-zone");
  assert.match(crmSrc, /Müştərini Silmək İstədiyinizə Əminsiniz\?/, "Must display delete warning modal title");
  assert.match(workspaceSrc, /deleteCustomer/, "DailyWorkspace must implement deleteCustomer");
  assert.match(workspaceSrc, /onDeleteCustomer=\{deleteCustomer\}/, "DailyWorkspace must pass onDeleteCustomer");

  // 5. Add New Customer Modal & Prominent Button
  assert.match(crmSrc, /addCustomerModalOpen/, "Must support addCustomerModalOpen state");
  assert.match(crmSrc, /add-cust-modal-btn/, "Directory toolbar must have add-cust-modal-btn");
  assert.match(crmSrc, /Yeni Müştəri Əlavə Et/, "Must display Add Customer modal title");
  assert.match(crmSrc, /handleCreateCustomerFromModal/, "Must handle add customer submission");

  // 6. CSS Modal and Layout definitions
  assert.match(cssSrc, /\.crm-modal-backdrop/, "CSS must define .crm-modal-backdrop");
  assert.match(cssSrc, /\.crm-modal/, "CSS must define .crm-modal");
  assert.match(cssSrc, /\.customer-danger-zone/, "CSS must define .customer-danger-zone");
  assert.match(cssSrc, /\.danger-button/, "CSS must define .danger-button");
});
