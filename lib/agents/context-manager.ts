export type ConversationTurn = { role: "user" | "assistant"; content: string };

export type ContextWindowOptions = {
  history: ConversationTurn[];
  message: string;
  systemInstruction: string;
  contextWindowTokens: number;
  maxOutputTokens: number;
};

export type ManagedContext = {
  history: ConversationTurn[];
  estimatedInputTokens: number;
  availableInputTokens: number;
};

export function estimateTokenCount(text: string) {
  return Math.ceil([...text].length / 4);
}

export function manageConversationContext(options: ContextWindowOptions): ManagedContext {
  const availableInputTokens = Math.max(256, options.contextWindowTokens - options.maxOutputTokens);
  const history = [...options.history];
  const fixedTokens =
    estimateTokenCount(options.systemInstruction) + estimateTokenCount(options.message) + 8;

  while (
    history.length > 0 &&
    fixedTokens + history.reduce((total, turn) => total + estimateTokenCount(turn.content) + 4, 0) >
      availableInputTokens
  ) {
    history.shift();
  }

  return {
    history,
    estimatedInputTokens:
      fixedTokens +
      history.reduce((total, turn) => total + estimateTokenCount(turn.content) + 4, 0),
    availableInputTokens,
  };
}
