import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { withViteSotHealth } from "./server/health-payload";

function reviewHttps() {
  const key = process.env.OMB_UI_TLS_KEY;
  const cert = process.env.OMB_UI_TLS_CERT;
  if (process.env.OMB_UI_HTTPS !== "1" || !key || !cert) return undefined;
  if (!existsSync(key) || !existsSync(cert)) return undefined;
  return { key: readFileSync(key), cert: readFileSync(cert) };
}

/** Vite is the Console SoT: `/api/health` on this port must report static:false
 * even when the API process has a leftover dist or OMB_STATIC_DIR. */
function viteHealthSotPlugin(): Plugin {
  const apiPort = process.env.OMB_PORT || process.env.OGB_PORT || 8799;
  return {
    name: "omb-vite-health-sot",
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: (err?: unknown) => void) => {
        const path = req.url?.split("?")[0];
        if (req.method !== "GET" || path !== "/api/health") {
          next();
          return;
        }
        void fetch(`http://127.0.0.1:${apiPort}/api/health`)
          .then(async (upstream) => {
            const raw = (await upstream.json().catch(() => ({}))) as Record<string, unknown>;
            const payload = withViteSotHealth(raw);
            const data = JSON.stringify(payload);
            res.statusCode = upstream.status;
            res.setHeader("content-type", "application/json");
            res.end(data);
          })
          .catch(() => next());
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), viteHealthSotPlugin()],
  test: {
    environment: "node",
    include: [
      "server/**/*.test.ts",
      "electron/**/*.test.mjs",
      "src/**/*.test.ts",
      "companion/**/*.test.ts",
      "enterprise/**/*.test.ts",
      "scripts/**/*.test.mjs",
    ],
    setupFiles: ["server/testing/setup.ts"],
    // the suite spawns fake provider CLIs and a real harness server;
    // parallel files introduce load-sensitive flakes for no win
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    // IPv4 explicitly — a bare ::1 bind makes localhost a coin-flip for
    // clients that resolve IPv4 first. For LAN access, set OMB_UI_HOST=0.0.0.0
    host: process.env.OMB_UI_HOST || "127.0.0.1",
    port: Number(process.env.OMB_UI_PORT) || 5199,
    // nginx on another host will send its own Host header
    allowedHosts: true,
    // Optional self-signed TLS. The review UI stays HTTP so nginx can offload.
    https: reviewHttps(),
    hmr: process.env.OMB_UI_PUBLIC_HOST
      ? {
          host: process.env.OMB_UI_PUBLIC_HOST,
          protocol: process.env.OMB_UI_HMR_PROTOCOL || "wss",
          clientPort: Number(process.env.OMB_UI_HMR_CLIENT_PORT || 443),
        }
      : undefined,
    // packager output lands inside the repo — its HTML files must never
    // trigger dev full-page reloads
    watch: {
      ignored: ["**/release/**", "**/build/**", "**/dist/**", "**/electron/resources/**"],
    },
    // the harness server owns every provider process; the app only ever
    // talks to /api — clients hold no transports
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${process.env.OMB_PORT || process.env.OGB_PORT || 8799}`,
      },
    },
  },
});
