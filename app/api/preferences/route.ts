import { NextRequest, NextResponse } from "next/server";
import { getDefaultProviderId, getModelProviderRegistry } from "@/lib/ai/providers";
import { requireUser } from "@/lib/auth/user";
import type { ProviderId } from "@/lib/ai/provider-types";
import { preferenceRequestSchema } from "@/lib/security/schemas";
import { AppError, apiErrorResponse } from "@/lib/utils/api-error";

export async function PUT(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError("Request body must be valid JSON.", 400, "INVALID_JSON");
    }
    const parsed = preferenceRequestSchema.safeParse(body);
    if (!parsed.success) throw new AppError("Invalid memory preference.", 400, "INVALID_REQUEST");
    const { supabase, user } = await requireUser();
    const { data: existing, error: lookupError } = await supabase
      .from("cosmos_preferences")
      .select("user_id, provider_id, fallback_provider")
      .eq("user_id", user.id)
      .maybeSingle();
    if (lookupError) throw lookupError;

    const registry = getModelProviderRegistry();
    const providerId =
      parsed.data.providerId ??
      (existing?.provider_id as ProviderId | undefined) ??
      getDefaultProviderId();
    for (const candidate of [parsed.data.providerId, parsed.data.fallbackProvider]) {
      if (!candidate) continue;
      const provider = registry.get(candidate);
      if (!provider.isConfigured()) {
        throw new AppError(
          `${provider.displayName} is not configured on the server.`,
          503,
          "PROVIDER_NOT_CONFIGURED",
        );
      }
    }
    const fallbackProvider =
      parsed.data.fallbackProvider ??
      (existing?.fallback_provider as ProviderId | null | undefined);
    if (
      parsed.data.fallbackModel &&
      fallbackProvider &&
      !registry.get(fallbackProvider).isConfigured()
    ) {
      throw new AppError(
        "The fallback provider is not configured on the server.",
        503,
        "PROVIDER_NOT_CONFIGURED",
      );
    }
    if (parsed.data.preferredModel && !registry.get(providerId).isConfigured()) {
      throw new AppError(
        "The selected provider is not configured on the server.",
        503,
        "PROVIDER_NOT_CONFIGURED",
      );
    }
    if (parsed.data.preferredModel) {
      await assertModelExists(registry, providerId, parsed.data.preferredModel);
    }
    if (parsed.data.fallbackProvider && parsed.data.fallbackModel) {
      await assertModelExists(registry, parsed.data.fallbackProvider, parsed.data.fallbackModel);
    }

    const update = {
      ...(parsed.data.memoryEnabled !== undefined && {
        memory_enabled: parsed.data.memoryEnabled,
      }),
      ...(parsed.data.preferredModel !== undefined && {
        preferred_model: parsed.data.preferredModel,
      }),
      ...(parsed.data.providerId !== undefined && { provider_id: parsed.data.providerId }),
      ...(parsed.data.calculatorEnabled !== undefined && {
        calculator_enabled: parsed.data.calculatorEnabled,
      }),
      ...(parsed.data.fallbackProvider !== undefined && {
        fallback_provider: parsed.data.fallbackProvider,
      }),
      ...(parsed.data.fallbackModel !== undefined && {
        fallback_model: parsed.data.fallbackModel,
      }),
      ...(parsed.data.temperature !== undefined && { temperature: parsed.data.temperature }),
      ...(parsed.data.maxOutputTokens !== undefined && {
        max_output_tokens: parsed.data.maxOutputTokens,
      }),
      ...(parsed.data.systemInstructions !== undefined && {
        system_instructions: parsed.data.systemInstructions,
      }),
    };
    const selection =
      "memory_enabled, provider_id, preferred_model, calculator_enabled, fallback_provider, fallback_model, temperature, max_output_tokens, system_instructions";

    if (existing) {
      const { data, error } = await supabase
        .from("cosmos_preferences")
        .update(update)
        .eq("user_id", user.id)
        .select(selection)
        .single();
      if (error) throw error;
      return NextResponse.json({
        memoryEnabled: data.memory_enabled,
        providerId: data.provider_id,
        preferredModel: data.preferred_model,
        calculatorEnabled: data.calculator_enabled,
        fallbackProvider: data.fallback_provider,
        fallbackModel: data.fallback_model,
        temperature: data.temperature,
        maxOutputTokens: data.max_output_tokens,
        systemInstructions: data.system_instructions,
      });
    }

    const { data, error } = await supabase
      .from("cosmos_preferences")
      .insert({
        user_id: user.id,
        memory_enabled: parsed.data.memoryEnabled ?? false,
        provider_id: parsed.data.providerId ?? getDefaultProviderId(),
        preferred_model: parsed.data.preferredModel ?? null,
        calculator_enabled: parsed.data.calculatorEnabled ?? false,
        fallback_provider: parsed.data.fallbackProvider ?? null,
        fallback_model: parsed.data.fallbackModel ?? null,
        temperature: parsed.data.temperature ?? 0.7,
        max_output_tokens: parsed.data.maxOutputTokens ?? 2048,
        system_instructions: parsed.data.systemInstructions ?? null,
      })
      .select(selection)
      .single();
    if (error?.code === "23505") {
      const retry = await supabase
        .from("cosmos_preferences")
        .update(update)
        .eq("user_id", user.id)
        .select(selection)
        .single();
      if (retry.error) throw retry.error;
      return NextResponse.json({
        memoryEnabled: retry.data.memory_enabled,
        providerId: retry.data.provider_id,
        preferredModel: retry.data.preferred_model,
        calculatorEnabled: retry.data.calculator_enabled,
        fallbackProvider: retry.data.fallback_provider,
        fallbackModel: retry.data.fallback_model,
        temperature: retry.data.temperature,
        maxOutputTokens: retry.data.max_output_tokens,
        systemInstructions: retry.data.system_instructions,
      });
    }
    if (error) throw error;
    return NextResponse.json({
      memoryEnabled: data.memory_enabled,
      providerId: data.provider_id,
      preferredModel: data.preferred_model,
      calculatorEnabled: data.calculator_enabled,
      fallbackProvider: data.fallback_provider,
      fallbackModel: data.fallback_model,
      temperature: data.temperature,
      maxOutputTokens: data.max_output_tokens,
      systemInstructions: data.system_instructions,
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function assertModelExists(
  registry: ReturnType<typeof getModelProviderRegistry>,
  providerId: ProviderId,
  modelId: string,
) {
  try {
    const models = await registry.get(providerId).discoverModels();
    if (!models.some((model) => model.id === modelId)) {
      throw new AppError(
        "That model is not in the provider's current catalog.",
        400,
        "MODEL_NOT_FOUND",
      );
    }
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      "Could not validate the selected model with its provider.",
      502,
      "MODEL_VALIDATION_FAILED",
    );
  }
}
