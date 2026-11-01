import { describe, expect, it } from "vitest";
import { consumeChatStream } from "@/lib/utils/chat-stream";

function responseFromChunks(chunks: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    }),
  );
}

describe("consumeChatStream", () => {
  it("joins SSE frames split across network chunks", async () => {
    const deltas: string[] = [];
    const response = responseFromChunks([
      'data: {"type":"de',
      'lta","text":"Hello"}\n\n',
      'data: {"type":"delta","text":" world"}\n\n',
      'data: {"type":"usage","usage":{"inputTokens":8,"outputTokens":3,"totalTokens":11},"estimatedInputTokens":8}\n\n',
      'data: {"type":"done","conversationId":"conversation-1"}\n\n',
    ]);
    const metadata: unknown[] = [];

    await expect(
      consumeChatStream(
        response,
        (delta) => deltas.push(delta),
        (event) => metadata.push(event),
      ),
    ).resolves.toBe("conversation-1");
    expect(deltas).toEqual(["Hello", " world"]);
    expect(metadata).toMatchObject([{ type: "usage", usage: { totalTokens: 11 } }]);
  });

  it("surfaces server errors and rejects streams without a done event", async () => {
    const errorResponse = responseFromChunks([
      'data: {"type":"error","message":"Model failed"}\n\n',
    ]);
    await expect(consumeChatStream(errorResponse, () => undefined)).rejects.toThrow("Model failed");

    const incompleteResponse = responseFromChunks(['data: {"type":"delta","text":"part"}\n\n']);
    await expect(consumeChatStream(incompleteResponse, () => undefined)).rejects.toThrow(
      "before it was saved",
    );
  });
});
