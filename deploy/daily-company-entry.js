// Select the workspace using the authenticated server session, never local storage.
export function startCompanyEntry(azartModule, spareModule, azartCss, spareCss) {
  const nativeFetch = window.fetch.bind(window);
  const isSpare = (payload) => (payload?.data?.company?.id ?? payload?.data?.companyId) === "sparexpert";
  async function start() {
    let spare = false;
    try {
      const response = await nativeFetch("/api/daily-auth/session", { cache: "no-store" });
      if (response.ok) spare = isSpare(await response.json());
    } catch {
      // The existing login handles offline and authentication errors.
    }
    if (!spare) {
      window.fetch = async (...args) => {
        const response = await nativeFetch(...args);
        const path = new URL(args[0] instanceof Request ? args[0].url : args[0], location.href);
        if (response.ok && path.origin === location.origin &&
            /^\/api\/daily-auth\/(login|password|google|register|session)$/.test(path.pathname)) {
          const session = await response.clone().json().catch(() => null);
          if (isSpare(session)) {
            location.reload();
            return new Promise(() => {});
          }
        }
        return response;
      };
    }
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = spare ? spareCss : azartCss;
    document.head.append(css);
    const script = document.createElement("script");
    script.type = "module";
    script.src = spare ? spareModule : azartModule;
    document.head.append(script);
  }
  return start();
}
