import "server-only";

import { ModelProviderRegistry } from "@/lib/ai/provider-registry";
import { OllamaModelProvider } from "@/lib/ai/providers/ollama";
import { OpenAICompatibleModelProvider } from "@/lib/ai/providers/openai-compatible";
import { OpenRouterModelProvider } from "@/lib/ai/providers/openrouter";
import { getEnvironment } from "@/lib/utils/env";

export function getModelProviderRegistry() {
  const environment = getEnvironment();
  return new ModelProviderRegistry([
    new OpenRouterModelProvider(environment.OPENROUTER_API_KEY),
    new OpenAICompatibleModelProvider(
      environment.OPENAI_COMPATIBLE_BASE_URL,
      environment.OPENAI_COMPATIBLE_API_KEY,
    ),
    new OllamaModelProvider(environment.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434"),
  ]);
}

export function getDefaultProviderId() {
  return getEnvironment().COSMOS_DEFAULT_PROVIDER ?? "openrouter";
}

export function getDefaultModelId(providerId: "openrouter" | "openai-compatible" | "ollama") {
  const environment = getEnvironment();
  if (providerId === "openrouter") return environment.OPENROUTER_MODEL ?? "";
  if (providerId === "openai-compatible") return environment.OPENAI_COMPATIBLE_MODEL ?? "";
  return environment.OLLAMA_MODEL ?? "";
}
