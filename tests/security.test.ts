import { describe, expect, it } from "vitest";
import {
  chatRequestSchema,
  idSchema,
  memoryRequestSchema,
  preferenceRequestSchema,
} from "@/lib/security/schemas";

describe("request schemas", () => {
  it("accepts a bounded chat message with an optional UUID conversation", () => {
    expect(
      chatRequestSchema.safeParse({
        conversationId: "91e20d5e-2a7f-4ca3-9eb3-19e35f01e55e",
        message: "  Help me plan this.  ",
      }),
    ).toMatchObject({ success: true, data: { message: "Help me plan this." } });
  });

  it("rejects blank, oversized, and malformed chat requests", () => {
    expect(chatRequestSchema.safeParse({ message: " " }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ message: "x".repeat(8001) }).success).toBe(false);
    expect(
      chatRequestSchema.safeParse({ conversationId: "not-a-uuid", message: "hello" }).success,
    ).toBe(false);
  });

  it("accepts bounded memories and rejects empty or oversized content", () => {
    expect(memoryRequestSchema.safeParse({ content: "I prefer concise answers." }).success).toBe(
      true,
    );
    expect(memoryRequestSchema.safeParse({ content: "  " }).success).toBe(false);
    expect(memoryRequestSchema.safeParse({ content: "x".repeat(1201) }).success).toBe(false);
  });

  it("requires a boolean memory preference and validates resource IDs", () => {
    expect(preferenceRequestSchema.safeParse({ memoryEnabled: false }).success).toBe(true);
    expect(preferenceRequestSchema.safeParse({ memoryEnabled: "false" }).success).toBe(false);
    expect(
      preferenceRequestSchema.safeParse({ preferredModel: "openai/gpt-4o-mini" }).success,
    ).toBe(true);
    expect(preferenceRequestSchema.safeParse({ calculatorEnabled: true }).success).toBe(true);
    expect(preferenceRequestSchema.safeParse({}).success).toBe(false);
    expect(idSchema.safeParse("91e20d5e-2a7f-4ca3-9eb3-19e35f01e55e").success).toBe(true);
    expect(idSchema.safeParse("1").success).toBe(false);
  });

  it("bounds model generation settings and requires complete fallback pairs", () => {
    expect(
      preferenceRequestSchema.safeParse({
        providerId: "ollama",
        preferredModel: "qwen3:8b",
        temperature: 0.4,
        maxOutputTokens: 2048,
        fallbackProvider: "openrouter",
        fallbackModel: "vendor/model:tag",
      }).success,
    ).toBe(true);
    expect(preferenceRequestSchema.safeParse({ temperature: 2.1 }).success).toBe(false);
    expect(preferenceRequestSchema.safeParse({ maxOutputTokens: 9000 }).success).toBe(false);
    expect(preferenceRequestSchema.safeParse({ fallbackProvider: "ollama" }).success).toBe(false);
  });
});
