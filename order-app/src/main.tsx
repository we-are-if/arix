import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import AppErrorBoundary from "../../src/components/AppErrorBoundary";
import "../../src/index.css";
import "./styles.css";

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => registration.update());
  });
}

createRoot(document.getElementById("root")!).render(<StrictMode><AppErrorBoundary><App /></AppErrorBoundary></StrictMode>);
