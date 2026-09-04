export async function requestJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  if (typeof fetch === "function") {
    const response = await fetch(url, init);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload?.error ?? "API request failed");
    return payload as T;
  }

  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(init.method ?? "GET", url);
    xhr.setRequestHeader("content-type", "application/json");
    xhr.onload = () => {
      try {
        const payload = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        if (xhr.status >= 200 && xhr.status < 300) resolve(payload as T);
        else reject(new Error(payload?.error ?? "API request failed"));
      } catch (error) {
        reject(error);
      }
    };
    xhr.onerror = () => reject(new Error("API request failed"));
    xhr.send(typeof init.body === "string" ? init.body : undefined);
  });
}
