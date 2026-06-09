import { join } from "node:path";

const HOME = process.env.HOME ?? process.env.USERPROFILE ?? "~";

export const PORT = Number(process.env.CCP_PORT ?? 3000);
export const API_URL = process.env.CCP_API_URL ?? "https://chatgpt.com/backend-api/codex/responses";
export const AUTH_PATH = process.env.CCP_AUTH_PATH ?? join(HOME, ".codex", "auth.json");
export const CONFIG_DIR = process.env.CCP_CONFIG_DIR ?? join(HOME, ".codex", "cursor-proxy");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");
export const MAX_BODY_BYTES = Number(process.env.CCP_MAX_BODY_BYTES ?? 50 * 1024 * 1024);

export const DEBUG_MODES = new Set(
  (process.env.CCP_DEBUG ?? "")
    .toLowerCase()
    .split(/[,\s]+/)
    .filter(Boolean),
);

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, api-key",
};

// Keep only fields the Codex Responses endpoint understands. Cursor can send
// extra Chat Completions options, so the proxy strips those before forwarding.
export const ALLOWED_PARAMS = new Set([
  "model",
  "input",
  "instructions",
  "tools",
  "tool_choice",
  "store",
  "include",
  "stream",
  "reasoning",
  "temperature",
  "top_p",
  "truncation",
  "text",
  "parallel_tool_calls",
  "previous_response_id",
]);
