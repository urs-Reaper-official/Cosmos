"use client";

import { useState } from "react";
import type { ProviderId } from "@/lib/ai/provider-types";

type PreferenceUpdate = {
  providerId?: ProviderId;
  preferredModel?: string | null;
  calculatorEnabled?: boolean;
  fallbackProvider?: ProviderId | null;
  fallbackModel?: string | null;
  temperature?: number;
  maxOutputTokens?: number;
  systemInstructions?: string | null;
};

type InitialPreferences = {
  providerId?: ProviderId;
  fallbackProvider?: ProviderId | null;
  fallbackModel?: string | null;
  temperature?: number;
  maxOutputTokens?: number;
  systemInstructions?: string | null;
};

function readError(body: unknown) {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    body.error &&
    typeof body.error === "object" &&
    "message" in body.error &&
    typeof body.error.message === "string"
  ) {
    return body.error.message;
  }
  return "Could not save this preference.";
}

export function useWorkspacePreferences(
  initialModel: string,
  initialCalculatorEnabled: boolean,
  initialPreferences: InitialPreferences = {},
) {
  const [model, setModel] = useState(initialModel);
  const [providerId, setProviderId] = useState<ProviderId>(
    initialPreferences.providerId ?? "openrouter",
  );
  const [calculatorEnabled, setCalculatorEnabled] = useState(initialCalculatorEnabled);
  const [fallbackProvider, setFallbackProvider] = useState<ProviderId | null>(
    initialPreferences.fallbackProvider ?? null,
  );
  const [fallbackModel, setFallbackModel] = useState(initialPreferences.fallbackModel ?? null);
  const [temperature, setTemperature] = useState(initialPreferences.temperature ?? 0.7);
  const [maxOutputTokens, setMaxOutputTokens] = useState(
    initialPreferences.maxOutputTokens ?? 2048,
  );
  const [systemInstructions, setSystemInstructions] = useState(
    initialPreferences.systemInstructions ?? "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function updatePreferences(update: PreferenceUpdate) {
    setPending(true);
    setError(null);
    setStatus(null);
    try {
      const response = await fetch("/api/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const result: unknown = await response.json();
      if (!response.ok) throw new Error(readError(result));
      if (update.providerId !== undefined) setProviderId(update.providerId);
      if (update.preferredModel !== undefined) setModel(update.preferredModel ?? "");
      if (update.calculatorEnabled !== undefined) {
        setCalculatorEnabled(update.calculatorEnabled);
      }
      if (update.fallbackProvider !== undefined) setFallbackProvider(update.fallbackProvider);
      if (update.fallbackModel !== undefined) setFallbackModel(update.fallbackModel);
      if (update.temperature !== undefined) setTemperature(update.temperature);
      if (update.maxOutputTokens !== undefined) setMaxOutputTokens(update.maxOutputTokens);
      if (update.systemInstructions !== undefined) {
        setSystemInstructions(update.systemInstructions ?? "");
      }
      setStatus("Preference saved to your account.");
      return true;
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "Could not save this preference.",
      );
      return false;
    } finally {
      setPending(false);
    }
  }

  return {
    model,
    providerId,
    calculatorEnabled,
    fallbackProvider,
    fallbackModel,
    temperature,
    maxOutputTokens,
    systemInstructions,
    pending,
    error,
    status,
    updatePreferences,
  };
}
