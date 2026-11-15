import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const azartRelease = process.env.VITE_AZART_RELEASE === "1";
const spareRelease = process.env.VITE_SPAREXPERT_RELEASE === "1";
const emptyAzartData = {
  IMPORTED_ACCOUNTS: [], IMPORTED_BANKS: [], IMPORTED_CARD_REPORT: [],
  IMPORTED_CATEGORIES: [], IMPORTED_CUSTOMERS: [], IMPORTED_CUSTOMER_DEBTS: {},
  IMPORTED_DAY_METRICS: {}, IMPORTED_ENTRIES: [], IMPORTED_PAST_MONTH_UNINVOICED: {},
  IMPORTED_PEOPLE: [], IMPORTED_PIVOT_REPORTS: { byCategory: [], byBank: [], byCard: [], dailySupplierPayments: [] },
  IMPORTED_RECONCILIATION: {}, IMPORTED_WEEKLY_CHARTS: [],
};

export default defineConfig({
  root: resolve(__dirname),
  plugins: [react(), ...(azartRelease ? [{
    name: "azart-exclude-sparexpert-ledger",
    enforce: "pre" as const,
    load(id: string) {
      if (id.replaceAll("\\", "/").endsWith("/src/investorOpening.local.ts")) return "export const spareInvestorOpening = {};";
      if (!id.replaceAll("\\", "/").endsWith("/src/sparexpertDefaults.ts")) return null;
      return ["ACCOUNTS", "PEOPLE", "CHANNELS", "CATEGORIES", "CUSTOMERS", "CARD_REPORT", "NOVEMBER_OPENING", "ENTRIES"]
        .map((key) => `export const SPAREXPERT_${key} = ${key === "NOVEMBER_OPENING" ? "{}" : "[]"};`).join("\n");
    },
    transform(code: string, id: string) {
      if (!id.endsWith("/DailyWorkspace.tsx")) return null;
      return code.replace(/const spareInvestorOpening: Readonly<Record<string, number>> = \{[^}]*\};/, "const spareInvestorOpening: Readonly<Record<string, number>> = {};");
    },
  }] : []), ...(spareRelease ? [{
    name: "sparexpert-exclude-azart-ledger",
    enforce: "pre" as const,
    load(id: string) {
      if (!id.replaceAll("\\", "/").endsWith("/src/importedData.ts")) return null;
      return Object.entries(emptyAzartData).map(([key, value]) =>
        `export const ${key} = ${JSON.stringify(value)};`).join("\n");
    },
  }] : [])],
  server: {
    host: "0.0.0.0",
    port: 5176,
    allowedHosts: true,
    proxy: { "/api": "http://127.0.0.1:8787" },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
