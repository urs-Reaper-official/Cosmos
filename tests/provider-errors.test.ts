import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "@/lib/ai/provider-error";
import { getJson, parseOpenAIModels } from "@/lib/ai/providers/http";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("provider HTTP errors", () => {
  it("keeps provider response bodies private and marks rate limits retryable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("private provider response", {
          status: 429,
          statusText: "Too Many Requests",
        }),
      ),
    );

    const result = getJson("openrouter", "https://provider.invalid/models");
    await expect(result).rejects.toMatchObject({
      name: "ProviderError",
      statusCode: 429,
      retryable: true,
      message: "Provider returned HTTP 429.",
    });
    await expect(result).rejects.not.toThrow("private provider response");
  });

  it("marks network errors retryable without leaking endpoint details", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("secret host details")));

    await expect(getJson("ollama", "http://private-host/api/tags")).rejects.toMatchObject({
      name: "ProviderError",
      retryable: true,
      message: "Could not reach the configured provider.",
    });
  });

  it("marks client errors non-retryable and validates model catalogs", () => {
    expect(new ProviderError("bad model", "openrouter", 400).retryable).toBe(false);
    expect(() => parseOpenAIModels({ models: [] })).toThrow();
  });
});
