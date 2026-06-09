import { DEBUG_MODES } from "./config.js";
import type { JsonRecord } from "./types.js";

export function debugEnabled(mode: "tools" | "raw" = "tools"): boolean {
  return (
    DEBUG_MODES.has("1") ||
    DEBUG_MODES.has("true") ||
    DEBUG_MODES.has("all") ||
    DEBUG_MODES.has(mode) ||
    (mode === "tools" && DEBUG_MODES.has("raw"))
  );
}

export function debugLog(message: string) {
  if (debugEnabled("tools")) console.log(message);
}

export function getToolName(tool: JsonRecord): string {
  const fn = tool.function as JsonRecord | undefined;
  return String(tool.name ?? fn?.name ?? tool.type ?? "(unnamed)");
}

function byteLength(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "string") return new TextEncoder().encode(value).byteLength;
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function previewValue(value: unknown, max = 500): string {
  if (value == null) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}...<truncated>` : text;
}

export function debugInputItems(input: unknown[]) {
  if (!debugEnabled("tools")) return;

  const counts = new Map<string, number>();
  for (const item of input as JsonRecord[]) {
    const type = String(item.type ?? item.role ?? "(unknown)");
    counts.set(type, (counts.get(type) ?? 0) + 1);
  }

  debugLog(
    `[debug.req.input_types] ${Array.from(counts.entries())
      .map(([type, count]) => `${type}=${count}`)
      .join(", ")}`,
  );

  for (const item of input as JsonRecord[]) {
    const type = String(item.type ?? "");
    if (
      type === "function_call_output" ||
      type === "custom_tool_call_output" ||
      type === "function_call" ||
      type === "custom_tool_call"
    ) {
      debugLog(
        `[debug.req.input_item] type=${type} name=${String(item.name ?? "")} call_id=${String(
          item.call_id ?? "",
        )} id=${String(item.id ?? "")} input_bytes=${byteLength(item.input)} output_bytes=${byteLength(
          item.output,
        )}`,
      );

      if (debugEnabled("raw")) {
        const inputPreview = previewValue(item.input);
        const outputPreview = previewValue(item.output);
        if (inputPreview) debugLog(`[debug.raw.input_item.input] ${inputPreview}`);
        if (outputPreview) debugLog(`[debug.raw.input_item.output] ${outputPreview}`);
      }
    }
  }
}
