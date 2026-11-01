import { z } from "zod";
import { ProviderError } from "@/lib/ai/provider-error";
import type { ModelDescriptor, ProviderId, ProviderHealth } from "@/lib/ai/provider-types";

const openAIModelResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      context_length: z.number().optional(),
      supported_parameters: z.array(z.string()).optional(),
    }),
  ),
});
const openRouterModelResponseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
      context_length: z.number().optional(),
      supported_parameters: z.array(z.string()).optional(),
    }),
  ),
});
const ollamaModelResponseSchema = z.object({
  models: z.array(z.object({ name: z.string() })),
});

export async function getJson(
  providerId: ProviderId,
  url: string,
  headers: HeadersInit = {},
  signal?: AbortSignal,
) {
  try {
    const response = await fetch(url, {
      headers,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(10000)])
        : AbortSignal.timeout(10000),
      cache: "no-store",
    });
    if (!response.ok) {
      throw new ProviderError(
        `Provider returned HTTP ${response.status}.`,
        providerId,
        response.status,
      );
    }
    return await response.json();
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError("Provider request timed out or was cancelled.", providerId, 408);
    }
    throw new ProviderError("Could not reach the configured provider.", providerId);
  }
}

export function parseOpenAIModels(value: unknown): ModelDescriptor[] {
  const parsed = openAIModelResponseSchema.parse(value);
  return parsed.data.map((model) => ({
    id: model.id,
    name: model.name ?? model.id,
    ...(model.context_length !== undefined && { contextLength: model.context_length }),
    ...(model.supported_parameters && {
      supportsTools: model.supported_parameters.includes("tools"),
    }),
  }));
}

export function parseOpenRouterModels(value: unknown): ModelDescriptor[] {
  const parsed = openRouterModelResponseSchema.parse(value);
  return parsed.data.map((model) => ({
    id: model.id,
    name: model.name ?? model.id,
    ...(model.context_length !== undefined && { contextLength: model.context_length }),
    ...(model.supported_parameters && {
      supportsTools: model.supported_parameters.includes("tools"),
    }),
  }));
}

export function parseOllamaModels(value: unknown): ModelDescriptor[] {
  return ollamaModelResponseSchema.parse(value).models.map(({ name }) => ({ id: name, name }));
}

export function makeHealthResult(
  providerId: ProviderId,
  configured: boolean,
  modelCount?: number,
  message?: string,
): ProviderHealth {
  return {
    providerId,
    configured,
    healthy: configured && modelCount !== undefined,
    checkedAt: new Date().toISOString(),
    ...(modelCount !== undefined && { modelCount }),
    message: message ?? (configured ? "Provider is reachable." : "Provider is not configured."),
  };
}

export function providerHealthFailure(providerId: ProviderId, configured: boolean): ProviderHealth {
  return {
    providerId,
    configured,
    healthy: false,
    checkedAt: new Date().toISOString(),
    message: configured ? "Provider health check failed." : "Provider is not configured.",
  };
}

export function modelsUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/models`;
}

export function ollamaApiUrl(baseUrl: string, path: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return `${normalized}${normalized.endsWith("/api") ? "" : "/api"}/${path}`;
}
