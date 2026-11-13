export async function markAllDailyNotifications(event, setNotifications, companyId) {
  const button = event.currentTarget;
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = "Saxlanılır…";
  try {
    const response = await fetch("/api/daily/notifications/read-all", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json", "X-Daily-Company": companyId }, body: "{}" });
    const payload = await response.json();
    if (!response.ok) throw Error(payload.error || "Bildirişlər saxlanılmadı.");
    setNotifications(payload.data);
    button.textContent = "Hamısı oxundu";
  } catch {
    button.textContent = "Alınmadı — yenidən cəhd et";
    button.disabled = false;
  }
}
