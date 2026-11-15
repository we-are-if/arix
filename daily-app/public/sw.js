const APP_SHELL_VERSION = "2026-11-12-daily-v17";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil((async () => {
  await self.clients.claim();
  const allClients = await self.clients.matchAll({ type: "window" });
  for (const client of allClients) {
    client.postMessage({ type: "SW_UPDATED", version: APP_SHELL_VERSION });
  }
})()));

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "Yeni bir bildirişiniz var." };
  }
  event.waitUntil(self.registration.showNotification(data.title || "AriX Daily", {
    body: data.body || "Yeni bir bildirişiniz var.",
    icon: "/arix-daily-icon-192.png",
    badge: "/arix-daily-icon-192.png",
    vibrate: [180, 80, 180],
    renotify: true,
    data: { url: data.url || "/", relatedId: data.relatedId || "" },
    tag: `${data.type || "arix-daily"}:${data.relatedId || Date.now()}`,
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
