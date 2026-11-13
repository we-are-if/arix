import { randomUUID } from "node:crypto";

export const CHAT_TASK_STATUSES = ["open", "done"];

export function ensureTaskStorage(db) {
  db.chatTasks ??= [];
}

export function createChatTask(db, user, body = {}) {
  ensureTaskStorage(db);
  const title = String(body.title || "").trim().slice(0, 200);
  if (!title) throw new Error("Görev başlığı zorunludur.");
  const assignee = (db.authUsers || []).find((item) => String(item.id) === String(body.assigneeId || "") && item.active !== false);
  if (!assignee) throw new Error("Görev verilecek kişi bulunamadı.");
  const due = body.dueAt ? new Date(body.dueAt) : null;
  const dueAt = due && !Number.isNaN(due.getTime()) ? due.toISOString() : null;
  const task = {
    id: randomUUID(),
    title,
    note: String(body.note || "").trim().slice(0, 1000),
    status: "open",
    assigneeId: String(assignee.id),
    assigneeName: String(assignee.name || ""),
    createdById: String(user?.id || ""),
    createdByName: String(user?.name || ""),
    channelId: String(body.channelId || "").slice(0, 200),
    messageId: String(body.messageId || "").slice(0, 200),
    dueAt,
    createdAt: new Date().toISOString(),
    doneAt: null,
    doneByName: "",
    remindedAt: null,
  };
  db.chatTasks.push(task);
  return task;
}

const isOverdue = (task, now) => task.status === "open" && task.dueAt && new Date(task.dueAt).getTime() < now;

export function listChatTasks(db, user, now = Date.now()) {
  ensureTaskStorage(db);
  const userId = String(user?.id || "");
  const decorate = (task) => ({
    ...task,
    isOverdue: Boolean(isOverdue(task, now)),
    isMine: task.assigneeId === userId,
    isCreatedByMe: task.createdById === userId,
  });
  const related = db.chatTasks.filter((task) => task.assigneeId === userId || task.createdById === userId);
  const mine = related.filter((task) => task.assigneeId === userId && task.status === "open").map(decorate).sort((a, b) => String(a.dueAt || "9999").localeCompare(String(b.dueAt || "9999")));
  const created = related.filter((task) => task.createdById === userId).map(decorate).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return {
    mine,
    created,
    openCount: mine.length,
    overdueCount: mine.filter((task) => task.isOverdue).length,
  };
}

export function setChatTaskStatus(db, user, { taskId, status } = {}) {
  ensureTaskStorage(db);
  const task = db.chatTasks.find((item) => String(item.id) === String(taskId || ""));
  if (!task) throw new Error("Görev bulunamadı.");
  const userId = String(user?.id || "");
  if (task.assigneeId !== userId && task.createdById !== userId) throw new Error("Bu görevi değiştirme yetkiniz yok.");
  const nextStatus = String(status || "");
  if (!CHAT_TASK_STATUSES.includes(nextStatus)) throw new Error("Geçersiz görev durumu.");
  task.status = nextStatus;
  if (nextStatus === "done") {
    task.doneAt = new Date().toISOString();
    task.doneByName = String(user?.name || "");
  } else {
    task.doneAt = null;
    task.doneByName = "";
  }
  return task;
}

// Tasks that passed their due time without a reminder yet; the scheduler marks them.
export function dueTaskReminders(db, now = Date.now()) {
  ensureTaskStorage(db);
  return db.chatTasks.filter((task) => task.status === "open" && task.dueAt && new Date(task.dueAt).getTime() <= now && !task.remindedAt);
}

export function taskSummaryLine(task) {
  const due = task.dueAt ? new Date(task.dueAt).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
  return due ? `${task.title} · ${task.assigneeName} · son: ${due}` : `${task.title} · ${task.assigneeName}`;
}
