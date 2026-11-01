export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | {
      type: "model";
      target: { providerId: string; modelId: string };
      fallbackUsed: boolean;
    }
  | {
      type: "usage";
      usage: { inputTokens: number; outputTokens: number; totalTokens: number };
      estimatedInputTokens: number;
      estimated?: boolean;
    }
  | { type: "done"; conversationId: string }
  | { type: "error"; message: string };

export async function consumeChatStream(
  response: Response,
  onDelta: (text: string) => void,
  onEvent?: (event: ChatStreamEvent) => void,
): Promise<string> {
  if (!response.body) throw new Error("The response stream was unavailable.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let conversationId = "";

  function processFrame(frame: string) {
    const data = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .join("\n");
    if (!data) return;

    const event = JSON.parse(data) as ChatStreamEvent;
    if (event.type === "delta" && typeof event.text === "string") onDelta(event.text);
    else if (event.type === "model" || event.type === "usage") onEvent?.(event);
    else if (event.type === "done" && typeof event.conversationId === "string") {
      conversationId = event.conversationId;
    } else if (event.type === "error" && typeof event.message === "string") {
      throw new Error(event.message);
    } else {
      throw new Error("The server sent an invalid stream event.");
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let separator = buffer.search(/\r?\n\r?\n/);
      while (separator >= 0) {
        const frame = buffer.slice(0, separator);
        const matchedSeparator = buffer.slice(separator).match(/^\r?\n\r?\n/);
        buffer = buffer.slice(separator + (matchedSeparator?.[0].length ?? 2));
        processFrame(frame);
        separator = buffer.search(/\r?\n\r?\n/);
      }
      if (done) break;
    }
    if (buffer.trim()) processFrame(buffer);
  } finally {
    reader.releaseLock();
  }

  if (!conversationId) throw new Error("The response ended before it was saved.");
  return conversationId;
}
