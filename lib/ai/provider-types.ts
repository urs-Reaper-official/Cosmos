import type { LanguageModel } from "ai";

export const PROVIDER_IDS = ["openrouter", "openai-compatible", "ollama"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type ModelDescriptor = {
  id: string;
  name: string;
  contextLength?: number;
  supportsTools?: boolean;
};

export type ProviderHealth = {
  providerId: ProviderId;
  configured: boolean;
  healthy: boolean;
  checkedAt: string;
  modelCount?: number;
  message: string;
};

export interface ModelProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  isConfigured(): boolean;
  createModel(modelId: string): LanguageModel;
  discoverModels(signal?: AbortSignal): Promise<ModelDescriptor[]>;
  validateCredentials(signal?: AbortSignal): Promise<ProviderHealth>;
  healthCheck(signal?: AbortSignal): Promise<ProviderHealth>;
}
