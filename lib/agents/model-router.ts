import { ProviderError } from "@/lib/ai/provider-error";
import { ModelProviderRegistry } from "@/lib/ai/provider-registry";
import type { ProviderId } from "@/lib/ai/provider-types";

export type ModelTarget = { providerId: ProviderId; modelId: string };

export function resolveModelTargets(
  registry: ModelProviderRegistry,
  primary: ModelTarget,
  fallback?: ModelTarget | null,
): ModelTarget[] {
  const targets = [primary, fallback].filter((target): target is ModelTarget => Boolean(target));
  const unique = targets.filter(
    (target, index) =>
      targets.findIndex(
        (candidate) =>
          candidate.providerId === target.providerId && candidate.modelId === target.modelId,
      ) === index,
  );

  for (const target of unique) {
    const provider = registry.get(target.providerId);
    if (!provider.isConfigured()) {
      throw new ProviderError(`${provider.displayName} is not configured.`, target.providerId);
    }
    if (!target.modelId.trim() || target.modelId.length > 160) {
      throw new ProviderError("A valid model ID is required.", target.providerId);
    }
  }
  return unique;
}
