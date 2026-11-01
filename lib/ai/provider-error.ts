import type { ProviderId } from "@/lib/ai/provider-types";

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly providerId: ProviderId,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }

  get retryable() {
    return (
      this.statusCode === undefined ||
      this.statusCode === 408 ||
      this.statusCode === 429 ||
      this.statusCode >= 500
    );
  }
}
