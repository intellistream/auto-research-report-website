import { afterEach, expect, it, vi } from "vitest";
import { askAssistant, recentHistory } from "./chat-stream";

afterEach(() => vi.unstubAllGlobals());

const endpoint = "https://example.com/api/chat";

it("decodes Chinese split across network chunks and reports a completed answer", async () => {
  const encoder = new TextEncoder();
  const bytes = encoder.encode('{"type":"delta","text":"缓存"}\n{"type":"done","truncated":true}\n');
  const split = bytes.indexOf(0xe7) + 1;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes.slice(0, split));
      controller.enqueue(bytes.slice(split));
      controller.close();
    },
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, {
    headers: { "Content-Type": "application/x-ndjson" },
  })));
  const onDelta = vi.fn();
  await expect(askAssistant(endpoint, "问", [], new AbortController().signal, onDelta))
    .resolves.toEqual({ truncated: true });
  expect(onDelta).toHaveBeenCalledExactlyOnceWith("缓存");
});

it("reports a stream that disconnects before sending a terminal event", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"type":"delta","text":"部分回答"}\n', {
    headers: { "Content-Type": "application/x-ndjson" },
  })));
  const onDelta = vi.fn();
  await expect(askAssistant(endpoint, "问", [], new AbortController().signal, onDelta))
    .rejects.toThrow("提前结束");
  expect(onDelta).toHaveBeenCalledWith("部分回答");
});

it("limits previous context and keeps the latest complete turns in order", () => {
  const newest = { question: "新问题", answer: "答" };
  const previous = { question: "上一问", answer: "答".repeat(4_000) };
  const oldest = { question: "旧问题", answer: "旧".repeat(4_000) };
  expect(recentHistory([oldest, previous, newest])).toEqual([previous, newest]);
});
