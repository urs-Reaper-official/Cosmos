import type { LanguageModelUsage } from "ai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProviderId } from "@/lib/ai/provider-types";
import type { Database } from "@/types/database";

type UsageDatabase = SupabaseClient<Database>;

export type NormalizedTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimated: boolean;
};

export function normalizeTokenUsage(
  usage: Partial<LanguageModelUsage>,
  estimates: { inputTokens: number; outputTokens: number } = { inputTokens: 0, outputTokens: 0 },
): NormalizedTokenUsage {
  const estimated = usage.inputTokens === undefined || usage.outputTokens === undefined;
  const inputTokens = Math.max(0, Math.floor(usage.inputTokens ?? estimates.inputTokens));
  const outputTokens = Math.max(0, Math.floor(usage.outputTokens ?? estimates.outputTokens));
  return {
    inputTokens,
    outputTokens,
    totalTokens: Math.max(0, Math.floor(usage.totalTokens ?? inputTokens + outputTokens)),
    estimated,
  };
}

export async function recordTokenUsage(
  database: UsageDatabase,
  values: {
    userId: string;
    conversationId: string;
    providerId: ProviderId;
    modelId: string;
    fallbackUsed: boolean;
    usage: NormalizedTokenUsage;
  },
) {
  const { error } = await database.from("cosmos_usage").insert({
    user_id: values.userId,
    conversation_id: values.conversationId,
    provider_id: values.providerId,
    model_id: values.modelId,
    fallback_used: values.fallbackUsed,
    usage_estimated: values.usage.estimated,
    input_tokens: values.usage.inputTokens,
    output_tokens: values.usage.outputTokens,
    total_tokens: values.usage.totalTokens,
  });
  if (error) throw error;
}
