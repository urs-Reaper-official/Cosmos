import { describe, expect, it } from "vitest";
import {
  parseOllamaModels,
  parseOpenAIModels,
  parseOpenRouterModels,
} from "@/lib/ai/providers/http";

describe("provider model catalog normalization", () => {
  it("maps OpenRouter's live catalog metadata", () => {
    expect(
      parseOpenRouterModels({
        data: [
          {
            id: "vendor/model-new",
            name: "Model New",
            context_length: 128000,
            supported_parameters: ["tools"],
          },
        ],
      }),
    ).toEqual([
      { id: "vendor/model-new", name: "Model New", contextLength: 128000, supportsTools: true },
    ]);
  });

  it("normalizes OpenAI-compatible and Ollama catalogs", () => {
    expect(parseOpenAIModels({ data: [{ id: "model-a", context_length: 32000 }] })).toEqual([
      { id: "model-a", name: "model-a", contextLength: 32000 },
    ]);
    expect(parseOllamaModels({ models: [{ name: "qwen3:8b" }] })).toEqual([
      { id: "qwen3:8b", name: "qwen3:8b" },
    ]);
  });
});
