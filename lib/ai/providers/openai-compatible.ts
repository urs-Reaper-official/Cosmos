import "server-only";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { ProviderError } from "@/lib/ai/provider-error";
import type { ModelProvider, ProviderHealth } from "@/lib/ai/provider-types";
import {
  getJson,
  makeHealthResult,
  modelsUrl,
  parseOpenAIModels,
  providerHealthFailure,
} from "@/lib/ai/providers/http";

export class OpenAICompatibleModelProvider implements ModelProvider {
  readonly id = "openai-compatible" as const;
  readonly displayName = "OpenAI-compatible endpoint";

  constructor(
    private readonly baseURL?: string,
    private readonly apiKey?: string,
  ) {}

  isConfigured() {
    return Boolean(this.baseURL);
  }

  createModel(modelId: string) {
    if (!this.baseURL) {
      throw new ProviderError("OpenAI-compatible endpoint is not configured.", this.id);
    }
    const provider = createOpenAICompatible({
      name: this.id,
      baseURL: this.baseURL,
      ...(this.apiKey && { apiKey: this.apiKey }),
      includeUsage: true,
    });
    return provider.chatModel(modelId);
  }

  async discoverModels(signal?: AbortSignal) {
    if (!this.baseURL)
      throw new ProviderError("OpenAI-compatible endpoint is not configured.", this.id);
    const response = await getJson(
      this.id,
      modelsUrl(this.baseURL),
      this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {},
      signal,
    );
    return parseOpenAIModels(response);
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
