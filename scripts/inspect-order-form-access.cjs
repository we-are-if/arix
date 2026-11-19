const { DatabaseSync } = require("node:sqlite");

const database = new DatabaseSync(process.argv[2], { readOnly: true });
const row = database.prepare("SELECT data FROM app_state WHERE id = 1").get();
const state = JSON.parse(row.data);
const normalize = (value) => {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  const lookup = name.toLocaleLowerCase("tr");
  if (lookup.includes("serkan")) return "serkan şeremet";
  if (lookup.includes("mustafa")) return "mustafa yazman";
  return lookup;
};
const forms = (state.orderBoard || []).filter((order) => !order.archivedAt && !order.isLoanReturn && order.approvalForm && (["ready", "delivered", "fulfilled"].includes(order.status) || (order.status === "preparing" && order.exportPackingRequired)));
for (const user of state.authUsers || []) {
  const permissions = user.permissions || [];
  const viewAll = permissions.includes("order_forms.view_all") || ["sahib", "admin", "administrator", "rəhbər"].includes(normalize(user.role));
  const visibleForms = forms.filter((order) => {
    if (viewAll) return true;
    const assignedId = String(order.approvalForm?.salesRepresentativeUserId || "");
    const assignedName = normalize(order.approvalForm?.salesRepresentative || "");
    const ownsOrder = String(order.createdByUserId || "") === String(user.id)
      || (!order.createdByUserId && normalize(order.createdBy) === normalize(user.name));
    return assignedId ? assignedId === String(user.id) || ownsOrder : Boolean(assignedName && assignedName === normalize(user.name)) || ownsOrder;
  });
  console.log(JSON.stringify({
    id: user.id,
    name: user.name,
    role: user.role,
    active: user.active !== false,
    orderFormPermissions: (user.permissions || []).filter((permission) => String(permission).startsWith("order_forms.")),
    canCreateOrder: (user.permissions || []).includes("orders.create"),
    visibleForms: visibleForms.length,
  }));
}
console.log(JSON.stringify({
  approvalForms: forms.length,
  visibleStatuses: Object.fromEntries([...(state.orderBoard || []).filter((order) => order.approvalForm && !order.archivedAt && !order.isLoanReturn).reduce((map, order) => map.set(order.status, (map.get(order.status) || 0) + 1), new Map())]),
}));
const assignments = new Map();
for (const order of forms) {
  const key = JSON.stringify({
    assignedId: order.approvalForm?.salesRepresentativeUserId || "",
    assignedName: order.approvalForm?.salesRepresentative || "",
    createdByUserId: order.createdByUserId || "",
    createdBy: order.createdBy || "",
  });
  assignments.set(key, (assignments.get(key) || 0) + 1);
}
for (const [assignment, count] of [...assignments.entries()].sort((left, right) => right[1] - left[1])) {
  console.log(JSON.stringify({ assignment: JSON.parse(assignment), count }));
}
