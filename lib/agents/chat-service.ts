import { isStepCount, streamText, type LanguageModelUsage, type ModelMessage } from "ai";
import { manageConversationContext, type ConversationTurn } from "@/lib/agents/context-manager";
import { streamWithFallback } from "@/lib/agents/error-recovery";
import { buildSystemInstruction } from "@/lib/agents/instruction-manager";
import { resolveModelTargets, type ModelTarget } from "@/lib/agents/model-router";
import { getModelProviderRegistry } from "@/lib/ai/providers";
import { cosmosTools } from "@/lib/tools";

export type ChatGenerationOptions = {
  history: ConversationTurn[];
  message: string;
  memories: string[];
  systemInstructions: string | null;
  primary: ModelTarget;
  fallback?: ModelTarget | null;
  temperature: number;
  maxOutputTokens: number;
  contextWindowTokens?: number;
  calculatorEnabled: boolean;
  userId: string;
  abortSignal?: AbortSignal;
};

export type ChatEngineEvent =
  | { type: "model"; target: ModelTarget; fallbackUsed: boolean }
  | { type: "delta"; text: string }
  | { type: "usage"; usage: LanguageModelUsage; estimatedInputTokens: number };

const DEFAULT_CONTEXT_WINDOW_TOKENS = 32768;

export async function* streamChatReply(
  options: ChatGenerationOptions,
): AsyncGenerator<ChatEngineEvent> {
  const registry = getModelProviderRegistry();
  const targets = resolveModelTargets(registry, options.primary, options.fallback);
  const system = buildSystemInstruction(options.systemInstructions, options.memories);
  const context = manageConversationContext({
    history: options.history,
    message: options.message,
    systemInstruction: system,
    contextWindowTokens: options.contextWindowTokens ?? DEFAULT_CONTEXT_WINDOW_TOKENS,
    maxOutputTokens: options.maxOutputTokens,
  });
  const messages: ModelMessage[] = [
    ...context.history.map((turn) => ({ role: turn.role, content: turn.content }) as ModelMessage),
    { role: "user", content: options.message },
  ];
  const tools = options.calculatorEnabled ? cosmosTools : {};
  let announcedTarget = "";

  const events = streamWithFallback<string, LanguageModelUsage>(
    targets,
    (target) => {
      const result = streamText({
        model: registry.createModel(target.providerId, target.modelId),
        system,
        messages,
        temperature: options.temperature,
        maxOutputTokens: options.maxOutputTokens,
        tools,
        stopWhen: isStepCount(4),
        abortSignal: options.abortSignal,
        ...(options.userId && {
          providerOptions:
            target.providerId === "openrouter"
              ? { openrouter: { user: options.userId } }
              : undefined,
        }),
      });
      return { chunks: result.textStream, usage: result.usage };
    },
    options.abortSignal,
  );

  for await (const event of events) {
    const key = `${event.target.providerId}:${event.target.modelId}`;
    if (key !== announcedTarget) {
      announcedTarget = key;
      yield {
        type: "model",
        target: event.target,
        fallbackUsed:
          event.target.providerId !== options.primary.providerId ||
          event.target.modelId !== options.primary.modelId,
      };
    }

    if (event.type === "delta") {
      yield { type: "delta", text: event.chunk };
    } else {
      yield {
        type: "usage",
        usage: event.usage,
        estimatedInputTokens: context.estimatedInputTokens,
      };
    }
  }
}
