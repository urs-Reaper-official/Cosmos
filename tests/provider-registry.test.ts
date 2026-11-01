import { describe, expect, it } from "vitest";
import { ModelProviderRegistry } from "@/lib/ai/provider-registry";
import { ProviderError } from "@/lib/ai/provider-error";
import type { ModelProvider, ProviderId } from "@/lib/ai/provider-types";

function fakeProvider(id: ProviderId): ModelProvider {
  return {
    id,
    displayName: id,
    isConfigured: () => true,
    createModel: (modelId) => ({ provider: id, modelId }) as never,
    discoverModels: async () => [],
    validateCredentials: async () => ({
      providerId: id,
      configured: true,
      healthy: true,
      checkedAt: "now",
      message: "ok",
    }),
    healthCheck: async () => ({
      providerId: id,
      configured: true,
      healthy: true,
      checkedAt: "now",
      message: "ok",
    }),
  };
}

describe("ModelProviderRegistry", () => {
  it("routes model creation through the selected provider", () => {
    const registry = new ModelProviderRegistry([
      fakeProvider("openrouter"),
      fakeProvider("ollama"),
    ]);

    expect(registry.createModel("ollama", "qwen3:8b")).toMatchObject({
      provider: "ollama",
      modelId: "qwen3:8b",
    });
  });

  it("rejects duplicate registrations and invalid model IDs", () => {
    expect(
      () => new ModelProviderRegistry([fakeProvider("ollama"), fakeProvider("ollama")]),
    ).toThrow("already registered");
    const registry = new ModelProviderRegistry([fakeProvider("ollama")]);
    expect(() => registry.createModel("ollama", " ")).toThrow(ProviderError);
  });
});
