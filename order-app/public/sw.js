self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "Yeni bir bildiriminiz var." };
  }
  event.waitUntil(self.registration.showNotification(data.title || "AriX Sipariş", {
    body: data.body || "Yeni bir bildiriminiz var.",
    icon: "/arix-icon-192.png",
    badge: "/arix-icon-192.png",
    vibrate: [180, 80, 180],
    renotify: true,
    data: { url: data.url || "/", orderId: data.orderId || "" },
    tag: `${data.type || "arix"}:${data.orderId || ""}`,
  }));
});
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
    const existing = windows.find((client) => "focus" in client);
    const url = event.notification.data?.url || "/";
    if (existing) return existing.navigate(url).then(() => existing.focus());
    return clients.openWindow(url);
  }));
});
