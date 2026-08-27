import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const rawPort = process.env.PORT;

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

// DEV-1: GitHub Codespaces forwards this dev server through its own HTTPS
// edge proxy (https://<codespace-name>-<port>.app.github.dev), which is a
// different host/port than the one Vite's dev server actually binds to
// inside the container (0.0.0.0:5173, plain HTTP). Vite's HMR client has
// no way to know that externally-visible host/port on its own - left at
// its defaults it tries to open a websocket back to the container's own
// address, which the browser (talking to the forwarded HTTPS URL) cannot
// reach, so it keeps retrying/failing. Codespaces sets CODESPACE_NAME and
// GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN in every codespace
// automatically - using them here to point the HMR client at the real
// forwarded HTTPS host on port 443 (wss, since the forwarding proxy
// terminates TLS there) fixes this without hardcoding any codespace name.
// Local (non-Codespaces) dev is untouched - hmr stays at its normal
// same-origin default there.
const codespaceName = process.env.CODESPACE_NAME;
const codespacePortForwardingDomain = process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN;
const isCodespaces = process.env.CODESPACES === "true" && Boolean(codespaceName) && Boolean(codespacePortForwardingDomain);

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    // Every /api/* call this app makes (src/lib/api.ts's BASE = "/api")
    // targets the same-origin api-server, which is only true in
    // production (api-server serves this app's own build - see
    // artifacts/api-server/src/app.ts). Running `vite dev` on its own
    // has nothing at "/api" at all - proxy it to a separately-running
    // api-server dev instance so backend-connected pages (Country
    // Intelligence, Alerts, OSINT, Venues, ...) work under `pnpm run
    // dev` too. Target port is configurable since api-server has no
    // fixed default port of its own (requires PORT env var, same as
    // this app) - set API_PROXY_TARGET to match wherever it's running.
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://localhost:3001",
        changeOrigin: true,
      },
    },
    ...(isCodespaces
      ? {
          hmr: {
            protocol: "wss",
            host: `${codespaceName}-${port}.${codespacePortForwardingDomain}`,
            clientPort: 443,
          },
        }
      : {}),
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
