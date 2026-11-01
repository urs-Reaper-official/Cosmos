import "server-only";

import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { ProviderError } from "@/lib/ai/provider-error";
import type { ModelDescriptor, ModelProvider, ProviderHealth } from "@/lib/ai/provider-types";
import {
  getJson,
  makeHealthResult,
  parseOpenRouterModels,
  providerHealthFailure,
} from "@/lib/ai/providers/http";

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";

export class OpenRouterModelProvider implements ModelProvider {
  readonly id = "openrouter" as const;
  readonly displayName = "OpenRouter";

  constructor(private readonly apiKey?: string) {}

  isConfigured() {
    return Boolean(this.apiKey);
  }

  createModel(modelId: string) {
    if (!this.apiKey) throw new ProviderError("OpenRouter is not configured.", this.id);
    return createOpenRouter({ apiKey: this.apiKey })(modelId);
  }

  async discoverModels(signal?: AbortSignal): Promise<ModelDescriptor[]> {
    if (!this.apiKey) throw new ProviderError("OpenRouter is not configured.", this.id);
    const response = await getJson(
      this.id,
      OPENROUTER_MODELS_URL,
      { Authorization: `Bearer ${this.apiKey}` },
      signal,
    );
    try {
      return parseOpenRouterModels(response);
    } catch {
      throw new ProviderError("OpenRouter returned an invalid model catalog.", this.id);
    }
  }

  async validateCredentials(signal?: AbortSignal): Promise<ProviderHealth> {
    return this.healthCheck(signal);
  }

  async healthCheck(signal?: AbortSignal): Promise<ProviderHealth> {
    if (!this.isConfigured()) return providerHealthFailure(this.id, false);
    try {
      const models = await this.discoverModels(signal);
      return makeHealthResult(this.id, true, models.length);
    } catch {
      return providerHealthFailure(this.id, true);
    }
  }
}
