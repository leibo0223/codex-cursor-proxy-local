import { randomUUID } from "node:crypto";

import { debugEnabled, debugLog } from "./debug.js";
import type { JsonRecord } from "./types.js";

export function responsesToCompletionsStream(
  upstream: ReadableStream<Uint8Array>,
  model: string,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let buffer = "";
  let id = "chatcmpl-" + randomUUID();
  const created = Math.floor(Date.now() / 1000);

  // Responses API identifies tool calls by output item id. Chat Completions
  // streams them by numeric index, so these maps keep both worlds aligned.
  const toolIndices = new Map<string, number>();
  const toolCallIds = new Map<string, string>();
  const toolNames = new Map<string, string>();
  const customToolInputs = new Map<string, string>();
  let nextToolIdx = 0;
  let emittedToolCalls = 0;
  let streamedToolArgumentBytes = 0;

  function chunk(delta: JsonRecord, finish: string | null = null) {
    return `data: ${JSON.stringify({
      id,
      object: "chat.completion.chunk",
      created,
      model,
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`;
  }

  return new ReadableStream({
    async start(controller) {
      const reader = upstream.getReader();
      controller.enqueue(encoder.encode(chunk({ role: "assistant" })));

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          let eventType = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) {
              eventType = line.slice(7).trim();
              continue;
            }
            if (!line.startsWith("data: ")) continue;

            let evt: JsonRecord;
            try {
              evt = JSON.parse(line.slice(6)) as JsonRecord;
            } catch {
              continue;
            }

            const type = (evt.type as string) ?? eventType;

            if (type === "response.output_text.delta") {
              const d = evt.delta as string;
              if (d) controller.enqueue(encoder.encode(chunk({ content: d })));
            } else if (type === "response.reasoning.delta") {
              const d = evt.delta as string;
              if (d) controller.enqueue(encoder.encode(chunk({ reasoning_content: d })));
            } else if (type === "response.output_item.added") {
              const item = evt.item as JsonRecord | undefined;
              if (debugEnabled("tools")) {
                debugLog(
                  `[debug.upstream] ${type} item_type=${String(item?.type ?? "(unknown)")} name=${String(
                    item?.name ?? "",
                  )} item_id=${String(item?.id ?? "")} call_id=${String(item?.call_id ?? "")}`,
                );
              }
              if (item?.type === "function_call" || item?.type === "custom_tool_call") {
                const idx = nextToolIdx++;
                emittedToolCalls++;
                const itemId = item.id as string;
                const callId = String(item.call_id ?? item.id);
                const name = item.name as string;

                toolIndices.set(itemId, idx);
                toolCallIds.set(itemId, callId);
                toolNames.set(itemId, name);
                controller.enqueue(
                  encoder.encode(
                    chunk({
                      tool_calls: [{
                        index: idx,
                        id: callId,
                        type: "function",
                        function: { name, arguments: "" },
                      }],
                    }),
                  ),
                );

                const initialInput = typeof item.input === "string" ? item.input : "";
                if (item.type === "custom_tool_call" && initialInput) {
                  customToolInputs.set(itemId, initialInput);
                  streamedToolArgumentBytes += encoder.encode(initialInput).byteLength;
                  controller.enqueue(
                    encoder.encode(
                      chunk({ tool_calls: [{ index: idx, function: { arguments: initialInput } }] }),
                    ),
                  );
                }
              }
            } else if (type === "response.function_call_arguments.delta") {
              const d = evt.delta as string;
              if (d) {
                streamedToolArgumentBytes += encoder.encode(d).byteLength;
                if (debugEnabled("tools")) {
                  debugLog(
                    `[debug.upstream] ${type} item_id=${String(evt.item_id ?? "")} bytes=${
                      encoder.encode(d).byteLength
                    } total_bytes=${streamedToolArgumentBytes}`,
                  );
                }
                const idx = toolIndices.get(evt.item_id as string) ?? 0;
                controller.enqueue(
                  encoder.encode(chunk({ tool_calls: [{ index: idx, function: { arguments: d } }] })),
                );
              }
            } else if (type === "response.custom_tool_call_input.delta") {
              const d = evt.delta as string;
              if (d) {
                const itemId = evt.item_id as string;
                const idx = toolIndices.get(itemId) ?? 0;
                const current = customToolInputs.get(itemId) ?? "";
                customToolInputs.set(itemId, current + d);
                streamedToolArgumentBytes += encoder.encode(d).byteLength;
                if (debugEnabled("tools")) {
                  debugLog(
                    `[debug.upstream] ${type} item_id=${String(evt.item_id ?? "")} bytes=${
                      encoder.encode(d).byteLength
                    } total_bytes=${streamedToolArgumentBytes}`,
                  );
                }
                controller.enqueue(
                  encoder.encode(chunk({ tool_calls: [{ index: idx, function: { arguments: d } }] })),
                );
              }
            } else if (
              type === "response.function_call_arguments.done" ||
              type === "response.custom_tool_call_input.done" ||
              type === "response.output_item.done"
            ) {
              const item = evt.item as JsonRecord | undefined;
              const itemId = String(evt.item_id ?? item?.id ?? "");
              const finalInput =
                typeof evt.input === "string"
                  ? evt.input
                  : typeof item?.input === "string"
                    ? item.input
                    : "";

              if (finalInput && toolIndices.has(itemId)) {
                const current = customToolInputs.get(itemId) ?? "";
                const remainingInput = finalInput.startsWith(current)
                  ? finalInput.slice(current.length)
                  : current
                    ? ""
                    : finalInput;

                // Some custom tool calls only include their full input on the
                // done event. Emit just the missing suffix so Cursor receives
                // one continuous argument stream without duplicates.
                if (remainingInput) {
                  customToolInputs.set(itemId, current + remainingInput);
                  streamedToolArgumentBytes += encoder.encode(remainingInput).byteLength;
                  controller.enqueue(
                    encoder.encode(
                      chunk({
                        tool_calls: [{
                          index: toolIndices.get(itemId) ?? 0,
                          function: { arguments: remainingInput },
                        }],
                      }),
                    ),
                  );
                }
              }

              if (debugEnabled("tools")) {
                debugLog(
                  `[debug.upstream] ${type} item_type=${String(item?.type ?? "")} item_id=${itemId} call_id=${String(
                    item?.call_id ?? toolCallIds.get(itemId) ?? "",
                  )} name=${String(item?.name ?? toolNames.get(itemId) ?? "")} input_bytes=${
                    finalInput ? encoder.encode(finalInput).byteLength : 0
                  }`,
                );
              }
            } else if (type === "response.completed") {
              const resp = evt.response as JsonRecord | undefined;
              if (resp) id = (resp.id as string) ?? id;
              const usage = resp?.usage as JsonRecord | undefined;
              const finishReason = emittedToolCalls > 0 ? "tool_calls" : "stop";
              debugLog(
                `[debug.upstream] ${type} emitted_tool_calls=${emittedToolCalls} tool_argument_bytes=${streamedToolArgumentBytes}`,
              );
              debugLog(`[debug.out] final_finish_reason=${finishReason} emitted_tool_calls=${emittedToolCalls}`);

              const final = {
                id,
                object: "chat.completion.chunk",
                created,
                model,
                choices: [{ index: 0, delta: {}, finish_reason: finishReason }],
                ...(usage && {
                  usage: {
                    prompt_tokens: usage.input_tokens ?? 0,
                    completion_tokens: usage.output_tokens ?? 0,
                    total_tokens: usage.total_tokens ?? 0,
                  },
                }),
              };
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(final)}\n\n`));
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            }
          }
        }
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}
