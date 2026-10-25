import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

import { cloudflare } from "@cloudflare/vite-plugin";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), cloudflare()],
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: ["ersarif", "ersarif.tail13f45d.ts.net", "dev.arix.az", "order.arix.az"],
    proxy: {
      "/api": "http://localhost:8787",
    },
  },
})