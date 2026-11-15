import { StrictMode } from "react";
import { installDailyTransport } from "../../shared/dailyTransport.js";
import { createRoot } from "react-dom/client";
import App from "./App";
import AppErrorBoundary from "../../src/components/AppErrorBoundary";
import "./styles.css";
import "./panel-shell.css";

installDailyTransport();

if ("serviceWorker" in navigator) {
  let refreshingForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshingForUpdate) return;
    refreshingForUpdate = true;
    window.location.reload();
  });
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "SW_UPDATED" && !refreshingForUpdate) {
      refreshingForUpdate = true;
      window.location.reload();
    }
  });
  const registerDailyWorker = () => {
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => {
      void registration.update().catch(console.warn);
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    }).catch(console.warn);
  };
  if (document.readyState === "complete") registerDailyWorker();
  else window.addEventListener("load", registerDailyWorker, { once: true });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
);
