import "server-only";

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { ProviderError } from "@/lib/ai/provider-error";
import type { ModelDescriptor, ModelProvider, ProviderHealth } from "@/lib/ai/provider-types";
import {
  getJson,
  makeHealthResult,
  ollamaApiUrl,
  parseOllamaModels,
  providerHealthFailure,
} from "@/lib/ai/providers/http";

export class OllamaModelProvider implements ModelProvider {
  readonly id = "ollama" as const;
  readonly displayName = "Ollama (local)";

  constructor(private readonly baseURL: string) {}

  isConfigured() {
    return Boolean(this.baseURL);
  }

  createModel(modelId: string) {
    if (!this.baseURL) throw new ProviderError("Ollama is not configured.", this.id);
    const baseURL = this.baseURL.replace(/\/+$/, "");
    const provider = createOpenAICompatible({
      name: this.id,
      baseURL: baseURL.endsWith("/v1") ? baseURL : `${baseURL}/v1`,
      includeUsage: true,
    });
    return provider.chatModel(modelId);
  }

  async discoverModels(signal?: AbortSignal): Promise<ModelDescriptor[]> {
    const response = await getJson(this.id, ollamaApiUrl(this.baseURL, "tags"), {}, signal);
    try {
      return parseOllamaModels(response);
    } catch {
      throw new ProviderError("Ollama returned an invalid model catalog.", this.id);
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
