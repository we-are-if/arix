// Compatibility transport for both deployed workspaces. Authorization always reaches
// the server, including cache hits; a company/user change produces a different ETag.
export function installDailyTransport(target = window) {
  if (target.__arixDailyTransportInstalled) return;
  target.__arixDailyTransportInstalled = true;
  const upstream = target.fetch.bind(target);
  let cached = null;
  let generation = 0;
  target.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input, target.location.href);
    const method = String(init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (url.origin !== target.location.origin) return upstream(input, init);
    if (url.pathname.startsWith("/api/daily-auth/") && method !== "GET") { cached = null; generation++; }
    if (url.pathname !== "/api/daily" || method !== "GET") return upstream(input, init);
    const previous = cached, started = generation;
    const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
    if (previous) headers.set("If-None-Match", previous.etag);
    let response = await upstream(input, { ...init, headers });
    if (response.status === 304 && previous) {
      if (generation !== started) throw new Error("Daily session changed during refresh");
      return new Response(previous.text, { status: 200, headers: previous.headers });
    }
    if (!response.ok) { cached = null; return response; }
    const etag = response.headers.get("etag");
    if (etag) {
      const text = await response.text();
      const responseHeaders = new Headers(response.headers);
      responseHeaders.delete("content-encoding"); responseHeaders.delete("content-length");
      if (generation !== started) throw new Error("Daily session changed during refresh");
      cached = { etag, text, headers: responseHeaders };
      response = new Response(text, { status: response.status, headers: responseHeaders });
    }
    return response;
  };
}
