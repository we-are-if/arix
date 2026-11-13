import test from "node:test";
import assert from "node:assert/strict";
import {
  applyInvoiceUpsert,
  applyInvoiceAction,
  reverseInvoiceEffects,
} from "./dailyInvoices.js";

function createMockState() {
  return {
    snapshotRevision: 1,
    snapshot: {
      invoices: [],
      customerDebts: {
        "Test Mebel": 1000,
      },
      pastMonthUninvoiced: {
        "Test Mebel": 200,
      },
      state: {
        entries: [
          {
            id: "e-1",
            date: "2026-11-04",
            kind: "income",
            counterparty: "Test Mebel",
            amount: 300,
            invoiced: false,
            bank: "Kassa",
            responsible: "Eşqin",
          },
          {
            id: "e-2",
            date: "2026-11-04",
            kind: "income",
            counterparty: "Other Cust",
            amount: 500,
            invoiced: false,
          },
        ],
      },
    },
    audit: [],
  };
}

const managerActor = {
  name: "Arif Mahmud",
  role: "Sahib",
  permissions: [
    "daily.view",
    "daily.invoices.manage",
    "daily.invoices.approve",
    "daily.invoices.restart",
    "daily.invoices.delete_permanent",
  ],
};

const cashierActor = {
  name: "Kassir",
  role: "Operator",
  permissions: ["daily.view", "daily.invoices.manage"],
};

test("saves draft invoice without touching debts or entries", () => {
  const current = createMockState();
  const draftInvoice = {
    invoiceNo: "32801",
    customer: "Test Mebel",
    salesAmount: 500,
    returnAmount: 0,
    purchaseAmount: 0,
    status: "draft",
  };

  const res = applyInvoiceUpsert({
    current,
    invoice: draftInvoice,
    approve: false,
    actor: cashierActor,
  });

  assert.equal(res.invoice.status, "draft");
  assert.equal(current.snapshot.invoices.length, 1);
  assert.equal(current.snapshot.customerDebts["Test Mebel"], 1000); // unchanged
  assert.equal(current.snapshot.state.entries[0].invoiced, false); // unchanged
  assert.equal(current.snapshot.pastMonthUninvoiced["Test Mebel"], 200); // unchanged
});

test("approves invoice: deducts payment, links entries, updates debt and status", () => {
  const current = createMockState();
  const draftInvoice = {
    id: "inv-test-1",
    invoiceNo: "32801",
    customer: "Test Mebel",
    salesAmount: 500,
    returnAmount: 0,
    purchaseAmount: 0,
    status: "draft",
  };

  applyInvoiceUpsert({
    current,
    invoice: draftInvoice,
    approve: false,
    actor: cashierActor,
  });

  // Now approve it
  const approved = applyInvoiceAction({
    current,
    invoiceId: "inv-test-1",
    action: "approve",
    actor: managerActor,
  });

  assert.equal(approved.invoice.status, "active");
  assert.equal(approved.invoice.approvedBy, "Arif Mahmud");
  // Debt calculation:
  // initial debt: 1000 + sales: 500 - returns: 0 - purchases: 0 - (payment 300 + pastMonth 200)
  // = 1000 + 500 - 500 = 1000
  assert.equal(current.snapshot.customerDebts["Test Mebel"], 1000);
  assert.equal(approved.invoice.finalDebt, 1000);
  assert.equal(approved.invoice.paymentDeducted, 500);
  assert.equal(current.snapshot.pastMonthUninvoiced["Test Mebel"], 0);

  // Check entry was linked
  assert.equal(current.snapshot.state.entries[0].invoiced, true);
  assert.equal(current.snapshot.state.entries[0].invoiceNo, "32801");
  // Unrelated entry should not be affected
  assert.equal(current.snapshot.state.entries[1].invoiced, false);
});

test("cancels active invoice: reverses debts and unlinks entries", () => {
  const current = createMockState();
  const res = applyInvoiceUpsert({
    current,
    invoice: {
      id: "inv-test-2",
      invoiceNo: "32802",
      customer: "Test Mebel",
      salesAmount: 500,
      returnAmount: 0,
      purchaseAmount: 0,
      status: "active",
    },
    approve: true,
    actor: managerActor,
  });

  assert.equal(current.snapshot.state.entries[0].invoiced, true);
  assert.equal(current.snapshot.pastMonthUninvoiced["Test Mebel"], 0);

  const cancelled = applyInvoiceAction({
    current,
    invoiceId: "inv-test-2",
    action: "cancel",
    reason: "Səhv məhsul",
    actor: managerActor,
  });

  assert.equal(cancelled.invoice.status, "cancelled");
  assert.equal(cancelled.invoice.rejectionReason, "Səhv məhsul");
  // Entries unlinked
  assert.equal(current.snapshot.state.entries[0].invoiced, false);
  assert.equal(current.snapshot.state.entries[0].invoiceNo, undefined);
  // Past month restored
  assert.equal(current.snapshot.pastMonthUninvoiced["Test Mebel"], 200);
  // Debt restored to 1000
  assert.equal(current.snapshot.customerDebts["Test Mebel"], 1000);
});

test("deletes invoice permanently: removes from list and checks permission", () => {
  const current = createMockState();
  applyInvoiceUpsert({
    current,
    invoice: {
      id: "inv-test-3",
      invoiceNo: "32803",
      customer: "Test Mebel",
      salesAmount: 100,
      status: "draft",
    },
    actor: cashierActor,
  });

  assert.equal(current.snapshot.invoices.length, 1);

  // Cashier cannot delete permanently
  assert.throws(() => {
    applyInvoiceAction({
      current,
      invoiceId: "inv-test-3",
      action: "delete",
      actor: cashierActor,
    });
  }, /icazəniz yoxdur/);

  // Manager can delete permanently
  const deleted = applyInvoiceAction({
    current,
    invoiceId: "inv-test-3",
    action: "delete",
    actor: managerActor,
  });

  assert.equal(deleted.deletedId, "inv-test-3");
  assert.equal(current.snapshot.invoices.length, 0);
});

test("updates existing draft invoice without creating duplicates", () => {
  const current = createMockState();
  applyInvoiceUpsert({
    current,
    invoice: {
      id: "inv-test-4",
      invoiceNo: "32804",
      customer: "Test Mebel",
      salesAmount: 100,
      note: "İlkin qeyd",
      status: "draft",
    },
    actor: cashierActor,
  });

  assert.equal(current.snapshot.invoices.length, 1);
  assert.equal(current.snapshot.invoices[0].note, "İlkin qeyd");

  // Update draft
  applyInvoiceUpsert({
    current,
    invoice: {
      id: "inv-test-4",
      invoiceNo: "32804",
      customer: "Test Mebel",
      salesAmount: 250,
      note: "Yenilənmiş qeyd",
      status: "draft",
    },
    actor: cashierActor,
  });

  assert.equal(current.snapshot.invoices.length, 1);
  assert.equal(current.snapshot.invoices[0].salesAmount, 250);
  assert.equal(current.snapshot.invoices[0].note, "Yenilənmiş qeyd");
});

test("updates active invoice and recalculates debt differential", () => {
  const current = createMockState();
  applyInvoiceUpsert({
    current,
    invoice: {
      id: "inv-test-5",
      invoiceNo: "32805",
      customer: "Test Mebel",
      salesAmount: 500,
      status: "active",
    },
    approve: true,
    actor: managerActor,
  });

  // initial 1000 + 500 - 500 (300 payment + 200 past) = 1000
  assert.equal(current.snapshot.customerDebts["Test Mebel"], 1000);

  // Update sales amount to 700 (+200 difference)
  applyInvoiceUpsert({
    current,
    invoice: {
      id: "inv-test-5",
      invoiceNo: "32805",
      customer: "Test Mebel",
      salesAmount: 700,
      status: "active",
    },
    approve: true,
    actor: managerActor,
  });

  assert.equal(current.snapshot.customerDebts["Test Mebel"], 1200);
  assert.equal(current.snapshot.invoices[0].finalDebt, 1200);
});


test("applies only explicitly selected payments and keeps the ledger opening balance", () => {
  const current = createMockState();
  current.snapshot.state.entries.push({
    ...current.snapshot.state.entries[0], id: "e-3", amount: 80,
  });
  const { invoice } = applyInvoiceUpsert({
    current, approve: true, actor: managerActor,
    invoice: {
      id: "selected-payment", invoiceNo: "32899", customer: "Test Mebel",
      salesAmount: 500, previousDebtSnapshot: 1, explicitPaymentSelection: true,
      includePastPayment: false, linkedEntryIds: ["e-3"],
    },
  });
  assert.equal(invoice.previousDebtSnapshot, 1000);
  assert.equal(invoice.paymentDeducted, 80);
  assert.equal(invoice.finalDebt, 1420);
  assert.deepEqual(invoice.linkedEntryIds, ["e-3"]);
  assert.equal(current.snapshot.state.entries[0].invoiced, false);
  assert.equal(current.snapshot.pastMonthUninvoiced["Test Mebel"], 200);
});
