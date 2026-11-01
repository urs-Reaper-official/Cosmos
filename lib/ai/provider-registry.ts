import type { LanguageModel } from "ai";
import { ProviderError } from "@/lib/ai/provider-error";
import type { ModelProvider, ProviderId } from "@/lib/ai/provider-types";

export class ModelProviderRegistry {
  private readonly providers: Map<ProviderId, ModelProvider>;

  constructor(providers: Iterable<ModelProvider>) {
    this.providers = new Map();
    for (const provider of providers) {
      if (this.providers.has(provider.id)) {
        throw new Error(`Provider already registered: ${provider.id}`);
      }
      this.providers.set(provider.id, provider);
    }
  }

  list() {
    return [...this.providers.values()];
  }

  get(providerId: ProviderId) {
    const provider = this.providers.get(providerId);
    if (!provider) throw new ProviderError("Model provider is not supported.", providerId);
    return provider;
  }

  createModel(providerId: ProviderId, modelId: string): LanguageModel {
    if (!modelId.trim() || modelId.length > 160) {
      throw new ProviderError("A valid model ID is required.", providerId);
    }
    return this.get(providerId).createModel(modelId);
  }
}
