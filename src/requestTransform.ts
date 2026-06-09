import { ALLOWED_PARAMS } from "./config.js";
import type { JsonRecord } from "./types.js";

function messageContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content == null ? "" : JSON.stringify(content);

  // Cursor usually sends text-only content, but Chat Completions also allows
  // multipart arrays. This proxy preserves text parts and ignores rich media.
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part) {
        return String((part as { text?: unknown }).text ?? "");
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function chatMessagesToResponsesInput(body: JsonRecord) {
  if (body.input || !Array.isArray(body.messages)) return;

  const instructions: string[] = [];
  const input: JsonRecord[] = [];

  for (const msg of body.messages as JsonRecord[]) {
    const role = msg.role;
    const content = messageContentToText(msg.content);

    if (role === "system" || role === "developer") {
      if (content) instructions.push(content);
      continue;
    }

    if (role === "tool") {
      input.push({
        type: "function_call_output",
        call_id: msg.tool_call_id,
        output: content,
      });
      continue;
    }

    if (role === "assistant" && Array.isArray(msg.tool_calls)) {
      for (const call of msg.tool_calls as JsonRecord[]) {
        const fn = call.function as JsonRecord | undefined;
        input.push({
          type: "function_call",
          call_id: call.id,
          name: fn?.name,
          arguments: fn?.arguments ?? "",
        });
      }
      if (!content) continue;
    }

    if (role === "user" || role === "assistant") {
      input.push({ role, content });
    }
  }

  if (!body.instructions && instructions.length) {
    body.instructions = instructions.join("\n\n");
  }

  body.input = input;
}

function normalizeTools(body: JsonRecord) {
  if (!Array.isArray(body.tools)) return;

  body.tools = (body.tools as JsonRecord[]).map((tool) => {
    if (tool.type !== "function" || !tool.function) return tool;

    const fn = tool.function as JsonRecord;
    return {
      type: "function",
      name: fn.name,
      description: fn.description,
      parameters: fn.parameters,
    };
  });

  const choice = body.tool_choice as JsonRecord | undefined;
  const fnChoice = choice?.function as JsonRecord | undefined;
  if (choice?.type === "function" && fnChoice?.name) {
    body.tool_choice = { type: "function", name: fnChoice.name };
  }
}

export function sanitizeBody(body: JsonRecord): JsonRecord {
  chatMessagesToResponsesInput(body);
  normalizeTools(body);

  if (!body.instructions && Array.isArray(body.input)) {
    const idx = body.input.findIndex((m: { role?: string }) => m.role === "system");
    if (idx !== -1) {
      body.instructions = (body.input[idx] as JsonRecord).content;
      body.input.splice(idx, 1);
    }
  }

  if (!body.instructions) {
    body.instructions = "You are a helpful coding assistant.";
  }

  body.store = false;
  body.stream = true;

  for (const key of Object.keys(body)) {
    if (!ALLOWED_PARAMS.has(key)) delete body[key];
  }

  return body;
}
