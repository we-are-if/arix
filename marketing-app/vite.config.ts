import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: __dirname,
  publicDir: "public",
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 5175,
    allowedHosts: ["www.arix.az", "arix.az", "localhost"],
  },
  build: {
    outDir: "../dist-marketing",
    emptyOutDir: true,
  },
});
