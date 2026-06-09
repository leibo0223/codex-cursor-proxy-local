#!/usr/bin/env node
import { getProxyApiKey } from "./auth.js";
import { PORT } from "./config.js";
import { createProxyServer } from "./httpServer.js";
import { CloudflaredTunnel } from "./tunnel.js";

const PROXY_API_KEY = getProxyApiKey();
const server = createProxyServer(PROXY_API_KEY);
const tunnel = new CloudflaredTunnel(PORT, (message) => {
  console.error(`\n[proxy] ${message}`);
  server.close(() => process.exit(1));
});

function shutdown(signal: string) {
  console.log(`\n[proxy] Shutting down (${signal})...`);
  tunnel.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1000).unref();
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

server.listen(PORT, () => {
  console.log(`[proxy] Listening on http://localhost:${PORT}`);
  console.log("[proxy] Starting cloudflared quick tunnel...");

  tunnel
    .start()
    .then((url) => {
      console.log(`\nOpenAI Base URL for Cursor: ${url}`);
      console.log(`API Key: ${PROXY_API_KEY}\n`);
    })
    .catch((err) => {
      console.error("\nTunnel failed:", err instanceof Error ? err.message : err);
      console.error("Install cloudflared or check your network, then restart codex-cursor-proxy.\n");
      server.close(() => process.exit(1));
    });
});
