import { NextRequest } from "next/server";
import type { LanguageModelUsage } from "ai";
import { streamChatReply } from "@/lib/agents/chat-service";
import { estimateTokenCount } from "@/lib/agents/context-manager";
import { formatAssistantResponse } from "@/lib/agents/response-formatter";
import { normalizeTokenUsage, recordTokenUsage } from "@/lib/agents/token-usage-tracker";
import { resolveModelTargets } from "@/lib/agents/model-router";
import {
  getDefaultModelId,
  getDefaultProviderId,
  getModelProviderRegistry,
} from "@/lib/ai/providers";
import type { ProviderId } from "@/lib/ai/provider-types";
import { requireUser } from "@/lib/auth/user";
import {
  createConversation,
  createEditedConversationBranch,
  deleteEmptyConversation,
  getConversationHistory,
  getConversationHistoryBeforeMessage,
  persistConversationTurn,
  replaceLatestAssistantReply,
} from "@/lib/database/chat-store";
import { getEnabledMemories } from "@/lib/memory/service";
import { AppError, apiErrorResponse } from "@/lib/utils/api-error";
import { chatRequestSchema } from "@/lib/security/schemas";
import { getEnvironment } from "@/lib/utils/env";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_CONTEXT_CHARS = 24000;

export async function POST(request: NextRequest) {
  try {
    let requestBody: unknown;
    try {
      requestBody = await request.json();
    } catch {
      throw new AppError("Request body must be valid JSON.", 400, "INVALID_JSON");
    }

    const parsed = chatRequestSchema.safeParse(requestBody);
    if (!parsed.success) {
      throw new AppError("Enter a message of up to 8,000 characters.", 400, "INVALID_MESSAGE");
    }

    const environment = getEnvironment();
    if (!environment.OPENROUTER_API_KEY) {
      throw new AppError("Model service is not configured.", 503, "MODEL_NOT_CONFIGURED");
    }

    const { supabase, user } = await requireUser();

    const { data: preferences, error: preferencesError } = await supabase
      .from("cosmos_preferences")
      .select(
        "provider_id, preferred_model, fallback_provider, fallback_model, temperature, max_output_tokens, system_instructions, calculator_enabled",
      )
      .eq("user_id", user.id)
      .maybeSingle();
    if (preferencesError) throw preferencesError;

    const providerId = (preferences?.provider_id ?? getDefaultProviderId()) as ProviderId;
    const modelId = preferences?.preferred_model ?? getDefaultModelId(providerId);
    if (!modelId) {
      throw new AppError(
        "Choose a model in AI settings before starting a chat.",
        400,
        "MODEL_NOT_SELECTED",
      );
    }
    const fallback =
      preferences?.fallback_provider && preferences.fallback_model
        ? {
            providerId: preferences.fallback_provider as ProviderId,
            modelId: preferences.fallback_model,
          }
        : null;
    const registry = getModelProviderRegistry();
    try {
      resolveModelTargets(registry, { providerId, modelId }, fallback);
    } catch (error) {
      throw new AppError(
        error instanceof Error ? error.message : "The selected model provider is unavailable.",
        503,
        "MODEL_PROVIDER_UNAVAILABLE",
      );
    }

    let conversationId = parsed.data.conversationId;
    if (parsed.data.regenerate && !conversationId) {
      throw new AppError("A saved conversation is required to regenerate.", 400, "INVALID_REQUEST");
    }
    if (parsed.data.editFromMessageId && !conversationId) {
      throw new AppError(
        "A saved conversation is required to edit a prompt.",
        400,
        "INVALID_REQUEST",
      );
    }

    let history: { role: "user" | "assistant"; content: string }[] = [];
    let message = parsed.data.message;
    if (conversationId) {
      history = parsed.data.editFromMessageId
        ? await getConversationHistoryBeforeMessage(
            supabase,
            user.id,
            conversationId,
            parsed.data.editFromMessageId,
          )
        : await getConversationHistory(supabase, user.id, conversationId);
      if (parsed.data.regenerate) {
        if (history.at(-1)?.role !== "assistant") {
          throw new AppError("The latest reply cannot be regenerated.", 400, "INVALID_REQUEST");
        }
        history.pop();
        const previousUserMessage = history.pop();
        if (previousUserMessage?.role !== "user") {
          throw new AppError("The latest prompt cannot be found.", 400, "INVALID_REQUEST");
        }
        message = previousUserMessage.content;
      }
      while (
        history.length &&
        history.reduce((size, turn) => size + turn.content.length, message.length) >
          MAX_CONTEXT_CHARS
      ) {
        history.shift();
      }
    }

    const memories = await getEnabledMemories(supabase, user.id);

    const isNewConversation = !conversationId;
    if (!conversationId) conversationId = await createConversation(supabase, user.id, message);

    const primary = { providerId, modelId };
    const stream = streamChatReply({
      history,
      message,
      memories,
      systemInstructions: preferences?.system_instructions ?? null,
      primary,
      fallback,
      temperature: preferences?.temperature ?? 0.7,
      maxOutputTokens: preferences?.max_output_tokens ?? 2048,
      calculatorEnabled: preferences?.calculator_enabled ?? false,
      userId: user.id,
      abortSignal: request.signal,
    });

    const activeConversationId = conversationId;
    const encoder = new TextEncoder();
    const streamBody = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        };
        let reply = "";
        let actualTarget = primary;
        let fallbackUsed = false;
        let providerUsage: Partial<LanguageModelUsage> = {};
        let usage = normalizeTokenUsage({});
        let estimatedInputTokens = 0;

        try {
          for await (const event of stream) {
            if (event.type === "model") {
              actualTarget = event.target;
              fallbackUsed = event.fallbackUsed;
              send({ ...event, type: "model" });
            } else if (event.type === "delta") {
              reply += event.text;
              send({ type: "delta", text: event.text });
            } else {
              providerUsage = event.usage;
              estimatedInputTokens = event.estimatedInputTokens;
            }
          }
          reply = formatAssistantResponse(reply);
          usage = normalizeTokenUsage(providerUsage, {
            inputTokens: estimatedInputTokens,
            outputTokens: estimateTokenCount(reply),
          });
          send({ type: "usage", usage, estimatedInputTokens, estimated: usage.estimated });

          if (parsed.data.regenerate) {
            await replaceLatestAssistantReply(supabase, user.id, activeConversationId, reply);
          } else if (parsed.data.editFromMessageId) {
            const branchId = await createEditedConversationBranch(
              supabase,
              user.id,
              activeConversationId,
              parsed.data.editFromMessageId,
              message,
              reply,
            );
            await recordUsageSafely(supabase, {
              userId: user.id,
              conversationId: branchId,
              providerId: actualTarget.providerId,
              modelId: actualTarget.modelId,
              fallbackUsed,
              usage,
              estimatedInputTokens,
            });
            send({ type: "done", conversationId: branchId });
            controller.close();
            return;
          } else {
            await persistConversationTurn(supabase, user.id, activeConversationId, message, reply);
          }
          await recordUsageSafely(supabase, {
            userId: user.id,
            conversationId: activeConversationId,
            providerId: actualTarget.providerId,
            modelId: actualTarget.modelId,
            fallbackUsed,
            usage,
            estimatedInputTokens,
          });
          send({
            type: "done",
            conversationId: activeConversationId,
            providerId: actualTarget.providerId,
            modelId: actualTarget.modelId,
            fallbackUsed,
            usage,
          });
          controller.close();
        } catch (error) {
          console.error("Model stream failed", error);
          if (isNewConversation) {
            try {
              await deleteEmptyConversation(supabase, user.id, activeConversationId);
            } catch (cleanupError) {
              console.error("Could not clean up empty conversation", cleanupError);
            }
          }
          if (!request.signal.aborted) {
            try {
              send({ type: "error", message: "The model could not complete this response." });
              controller.close();
            } catch {
              // The client may have disconnected after the stream failed.
            }
          }
        }
      },
    });

    return new Response(streamBody, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

async function recordUsageSafely(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createSupabaseServerClient>>,
  values: {
    userId: string;
    conversationId: string;
    providerId: ProviderId;
    modelId: string;
    fallbackUsed: boolean;
    usage: ReturnType<typeof normalizeTokenUsage>;
    estimatedInputTokens: number;
  },
) {
  try {
    await recordTokenUsage(supabase, values);
  } catch {
    console.error("Could not record model token usage", {
      providerId: values.providerId,
      modelId: values.modelId,
      estimatedInputTokens: values.estimatedInputTokens,
    });
  }
}
