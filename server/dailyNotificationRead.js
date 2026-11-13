export function personalNotices(current, userId, allowed = () => true) {
  return current.notifications.filter(n => (!n.recipientUserId || String(n.recipientUserId) === String(userId)) && allowed(n))
    .map(n => n.recipientUserId ? n : { ...n, readAt: n.readBy?.[String(userId)] || null });
}
export function readAllNotices(current, userId, allowed = () => true, at = new Date().toISOString()) {
  let count = 0;
  for (const n of current.notifications) {
    if ((n.recipientUserId && String(n.recipientUserId) !== String(userId)) || !allowed(n)) continue;
    if (n.recipientUserId) { if (!n.readAt) { n.readAt = at; count++; } }
    else if (!n.readBy?.[String(userId)]) { n.readBy = { ...n.readBy, [String(userId)]: at }; count++; }
  }
  return count;
}
