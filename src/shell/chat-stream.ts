export const maxQuestionLength = 2_000;

export type ChatHistory = { question: string; answer: string };

export function recentHistory(history: ChatHistory[]): ChatHistory[] {
  const recent: ChatHistory[] = [];
  let remaining = 8_000;
  for (const turn of history.slice(-4).reverse()) {
    const length = turn.question.length + turn.answer.length;
    if (length > remaining) break;
    remaining -= length;
    recent.unshift(turn);
  }
  return recent;
}

type ChatEvent =
  | { type: "delta"; text: string }
  | { type: "done"; truncated: boolean }
  | { type: "error"; message: string };

function readEvent(line: string): ChatEvent {
  const event = JSON.parse(line) as Partial<{ type: string; text: unknown; truncated: unknown; message: unknown }>;
  if (event?.type === "delta" && typeof event.text === "string") return { type: "delta", text: event.text };
  if (event?.type === "done") return { type: "done", truncated: event.truncated === true };
  if (event?.type === "error" && typeof event.message === "string") return { type: "error", message: event.message };
  throw new Error("收到了无法识别的回答，请重试。");
}

export async function askAssistant(
  endpoint: string,
  question: string,
  history: ChatHistory[],
  signal: AbortSignal,
  onDelta: (text: string) => void,
): Promise<{ truncated: boolean }> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
    body: JSON.stringify({ question, history: recentHistory(history) }),
    credentials: "omit",
    signal,
  });
  if (!response.ok) {
    const error = response.headers.get("content-type")?.includes("application/json")
      ? await response.json().catch(() => null)
      : null;
    throw new Error(typeof error?.detail === "string" ? error.detail : "提问服务暂不可用，请稍后再试。");
  }
  if (!response.body || !response.headers.get("content-type")?.includes("application/x-ndjson")) {
    throw new Error("提问服务返回了非预期响应，请稍后再试。");
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) throw new Error("回答连接提前结束，请重试。");
      buffer += value;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = readEvent(line);
        if (event.type === "delta") onDelta(event.text);
        if (event.type === "done") return { truncated: event.truncated };
        if (event.type === "error") throw new Error(event.message);
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
