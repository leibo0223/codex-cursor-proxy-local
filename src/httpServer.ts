import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";

import { getAccessToken } from "./auth.js";
import { API_URL, CORS_HEADERS, MAX_BODY_BYTES, PORT } from "./config.js";
import { debugEnabled, debugInputItems, debugLog, getToolName } from "./debug.js";
import { sanitizeBody } from "./requestTransform.js";
import { responsesToCompletionsStream } from "./streamTransform.js";
import type { JsonRecord } from "./types.js";

function getRequestApiKey(req: IncomingMessage): string {
  const auth = req.headers.authorization ?? "";
  const bearer = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const apiKey = req.headers["api-key"];
  return bearer || (Array.isArray(apiKey) ? apiKey[0] : apiKey) || "";
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(body));
}

function readJsonBody(req: IncomingMessage): Promise<JsonRecord> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;

    req.on("data", (chunk: Buffer) => {
      total += chunk.byteLength;
      if (total > MAX_BODY_BYTES) {
        reject(new Error(`Request body exceeds ${MAX_BODY_BYTES} bytes.`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")) as JsonRecord);
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

async function writeWebStream(res: ServerResponse, stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  try {
    while (!res.destroyed && !res.writableEnded) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) {
        await once(res, "drain");
      }
    }
  } finally {
    reader.releaseLock();
  }
}

async function handleRequest(req: IncomingMessage, res: ServerResponse, proxyApiKey: string) {
  if (req.method === "OPTIONS") {
    res.writeHead(200, CORS_HEADERS);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  if (getRequestApiKey(req) !== proxyApiKey) {
    sendJson(res, 401, { error: "Unauthorized" });
    return;
  }

  let parsed: JsonRecord;
  try {
    parsed = await readJsonBody(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON";
    sendJson(res, message === "Invalid JSON" ? 400 : 413, { error: message });
    return;
  }

  if (debugEnabled("tools")) {
    const path = req.url ? new URL(req.url, `http://localhost:${PORT}`).pathname : "/";
    const rawMessages = Array.isArray(parsed.messages) ? parsed.messages.length : 0;
    const rawInput = Array.isArray(parsed.input) ? parsed.input.length : 0;
    const rawTools = Array.isArray(parsed.tools) ? (parsed.tools as JsonRecord[]) : [];

    debugLog(
      `[debug.req] ${path} model=${String(parsed.model ?? "(default)")} messages=${rawMessages} input=${rawInput} tools=${rawTools.length}`,
    );

    if (rawTools.length) {
      debugLog(`[debug.req.tools] ${rawTools.map(getToolName).join(", ")}`);
    }

    if (Array.isArray(parsed.input)) {
      debugInputItems(parsed.input);
    }
  }

  const body = sanitizeBody(parsed);
  const model = (body.model as string) ?? "gpt-5.4";
  const inputCount = Array.isArray(body.input) ? body.input.length : 0;
  const toolCount = Array.isArray(body.tools) ? body.tools.length : 0;
  console.log(`-> ${model} | ${inputCount} messages | ${toolCount} tools`);

  const token = getAccessToken();
  if (!token) {
    sendJson(res, 401, { error: "No access token. Run `codex` to authenticate." });
    return;
  }

  const upstream = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    console.log(`<- ${upstream.status} ERROR`);
    res.writeHead(upstream.status, {
      ...CORS_HEADERS,
      "Content-Type": upstream.headers.get("content-type") ?? "application/json; charset=utf-8",
    });
    res.end(text);
    return;
  }

  console.log(`<- ${upstream.status} streaming`);

  if (!upstream.body) {
    sendJson(res, 502, { error: "Empty upstream response" });
    return;
  }

  res.writeHead(200, {
    ...CORS_HEADERS,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  await writeWebStream(res, responsesToCompletionsStream(upstream.body, model));
  res.end();
}

export function createProxyServer(proxyApiKey: string) {
  const server = createServer((req, res) => {
    handleRequest(req, res, proxyApiKey).catch((err) => {
      console.error("[proxy] Request failed:", err instanceof Error ? err.message : err);
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Internal proxy error" });
      } else {
        res.destroy();
      }
    });
  });

  // Cursor can pause for model reasoning or tool work; keep the connection open
  // long enough for those quiet gaps instead of letting Node time out early.
  server.timeout = 255_000;
  server.keepAliveTimeout = 255_000;
  server.headersTimeout = 260_000;

  return server;
}
