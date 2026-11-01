import type { ModelTarget } from "@/lib/agents/model-router";

export type StreamAttempt<T, U> = {
  chunks: AsyncIterable<T>;
  usage: PromiseLike<U>;
};

export type RecoveryEvent<T, U> =
  | { type: "delta"; target: ModelTarget; chunk: T }
  | { type: "complete"; target: ModelTarget; usage: U };

export async function* streamWithFallback<T, U>(
  targets: ModelTarget[],
  run: (target: ModelTarget) => StreamAttempt<T, U>,
  abortSignal?: AbortSignal,
): AsyncGenerator<RecoveryEvent<T, U>> {
  let lastError: unknown;

  for (const target of targets) {
    let emitted = false;
    try {
      const attempt = run(target);
      for await (const chunk of attempt.chunks) {
        emitted = true;
        yield { type: "delta", target, chunk };
      }
      const usage = await attempt.usage;
      yield { type: "complete", target, usage };
      return;
    } catch (error) {
      if (abortSignal?.aborted || (error instanceof Error && error.name === "AbortError")) {
        throw error;
      }
      if (emitted) throw error;
      if (!isRetryableProviderFailure(error)) throw error;
      lastError = error;
    }
  }

  throw lastError ?? new Error("No model target was available.");
}

export function isRetryableProviderFailure(error: unknown) {
  if (!error || typeof error !== "object") return false;
  if ("retryable" in error && typeof error.retryable === "boolean") return error.retryable;
  if ("statusCode" in error && typeof error.statusCode === "number") {
    return error.statusCode === 408 || error.statusCode === 429 || error.statusCode >= 500;
  }
  if (error instanceof TypeError) return true;
  return false;
}
