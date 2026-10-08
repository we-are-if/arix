import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { BrowserRouter } from "react-router-dom";
import { LanguageProvider } from "./i18n.tsx";
import LiquidGlassEffects from "./components/LiquidGlassEffects.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <BrowserRouter>
        <LiquidGlassEffects />
        <App />
      </BrowserRouter>
    </LanguageProvider>
  </React.StrictMode>
);
