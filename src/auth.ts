import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

import { AUTH_PATH, CONFIG_DIR, CONFIG_PATH } from "./config.js";
import type { JsonRecord } from "./types.js";

export function getAccessToken(): string {
  try {
    const auth = JSON.parse(readFileSync(AUTH_PATH, "utf-8")) as JsonRecord;
    const tokens = auth.tokens as JsonRecord | undefined;
    return typeof tokens?.access_token === "string" ? tokens.access_token : "";
  } catch {
    console.error("[proxy] Could not read", AUTH_PATH);
    return "";
  }
}

function readConfig(): JsonRecord {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as JsonRecord;
  } catch {
    return {};
  }
}

function writeConfig(config: JsonRecord) {
  mkdirSync(CONFIG_DIR, { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n");
}

export function getProxyApiKey(): string {
  const config = readConfig();
  if (typeof config.apiKey === "string" && config.apiKey) return config.apiKey;

  // Cursor stores the supplied API key, so keep the generated token stable
  // across restarts instead of printing a new one every time.
  const apiKey = `ccp_${randomUUID().replace(/-/g, "")}`;
  writeConfig({ ...config, apiKey });
  return apiKey;
}
