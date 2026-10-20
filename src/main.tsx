import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { BrowserRouter } from "react-router-dom";
import { LanguageProvider } from "./i18n.tsx";
import AppErrorBoundary from "./components/AppErrorBoundary.tsx";
import ToastProvider from "./components/ToastProvider.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <LanguageProvider>
        <ToastProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </ToastProvider>
      </LanguageProvider>
    </AppErrorBoundary>
  </React.StrictMode>
);
