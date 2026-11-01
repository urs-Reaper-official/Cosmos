"use client";

import { useEffect, useState } from "react";
import { useWorkspacePreferences } from "@/hooks/use-workspace-preferences";
import type { ModelDescriptor, ProviderHealth, ProviderId } from "@/lib/ai/provider-types";

type ProviderOption = { id: ProviderId; name: string; configured: boolean };

async function loadModelCatalog(providerId: ProviderId): Promise<ModelDescriptor[]> {
  const response = await fetch(`/api/models?providerId=${encodeURIComponent(providerId)}`);
  const body: unknown = await response.json();
  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body &&
      body.error &&
      typeof body.error === "object" &&
      "message" in body.error &&
      typeof body.error.message === "string"
        ? body.error.message
        : "Could not load this provider's model catalog.";
    throw new Error(message);
  }
  if (!body || typeof body !== "object" || !("models" in body) || !Array.isArray(body.models)) {
    throw new Error("The provider returned an invalid model catalog.");
  }
  return body.models as ModelDescriptor[];
}

export function AISettings({
  providers,
  initialProviderId,
  initialModel,
  initialCalculatorEnabled,
  initialFallbackProvider,
  initialFallbackModel,
  initialTemperature,
  initialMaxOutputTokens,
  initialSystemInstructions,
}: {
  providers: ProviderOption[];
  initialProviderId: ProviderId;
  initialModel: string;
  initialCalculatorEnabled: boolean;
  initialFallbackProvider: ProviderId | null;
  initialFallbackModel: string | null;
  initialTemperature: number;
  initialMaxOutputTokens: number;
  initialSystemInstructions: string;
}) {
  const {
    model,
    providerId,
    calculatorEnabled,
    pending,
    error,
    status,
    updatePreferences,
  } = useWorkspacePreferences(initialModel, initialCalculatorEnabled, {
    providerId: initialProviderId,
    fallbackProvider: initialFallbackProvider,
    fallbackModel: initialFallbackModel,
    temperature: initialTemperature,
    maxOutputTokens: initialMaxOutputTokens,
    systemInstructions: initialSystemInstructions,
  });
  const [models, setModels] = useState<ModelDescriptor[]>([]);
  const [fallbackModels, setFallbackModels] = useState<ModelDescriptor[]>([]);
  const [fallbackProviderDraft, setFallbackProviderDraft] = useState<ProviderId | "">(
    initialFallbackProvider ?? "",
  );
  const [fallbackModelDraft, setFallbackModelDraft] = useState(initialFallbackModel ?? "");
  const [temperatureDraft, setTemperatureDraft] = useState(initialTemperature);
  const [maxTokensDraft, setMaxTokensDraft] = useState(initialMaxOutputTokens);
  const [instructionsDraft, setInstructionsDraft] = useState(initialSystemInstructions);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [health, setHealth] = useState<ProviderHealth | null>(null);
  const [healthPending, setHealthPending] = useState(false);

  useEffect(() => {
    let active = true;
    loadModelCatalog(providerId)
      .then((catalog) => {
        if (active) {
          setModels(catalog);
          setDiscoveryError(null);
        }
      })
      .catch((catalogError: unknown) => {
        if (active) {
          setModels([]);
          setDiscoveryError(
            catalogError instanceof Error ? catalogError.message : "Could not load model catalog.",
          );
        }
      });
    return () => {
      active = false;
    };
  }, [providerId]);

  useEffect(() => {
    if (!fallbackProviderDraft) return;
    let active = true;
    loadModelCatalog(fallbackProviderDraft)
      .then((catalog) => {
        if (active) setFallbackModels(catalog);
      })
      .catch(() => {
        if (active) setFallbackModels([]);
      });
    return () => {
      active = false;
    };
  }, [fallbackProviderDraft]);

  async function checkProvider() {
    setHealthPending(true);
    setHealth(null);
    try {
      const response = await fetch("/api/providers/health", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerId }),
      });
      const result = (await response.json()) as { health?: ProviderHealth };
      if (!response.ok || !result.health) throw new Error("Provider health check failed.");
      setHealth(result.health);
    } catch {
      setHealth({
        providerId,
        configured: false,
        healthy: false,
        checkedAt: new Date().toISOString(),
        message: "Could not validate provider configuration.",
      });
    } finally {
      setHealthPending(false);
    }
  }

  async function changeProvider(nextProvider: ProviderId) {
    setHealth(null);
    await updatePreferences({ providerId: nextProvider, preferredModel: null });
  }

  async function saveGenerationSettings() {
    await updatePreferences({
      temperature: temperatureDraft,
      maxOutputTokens: maxTokensDraft,
      systemInstructions: instructionsDraft.trim() || null,
    });
  }

  async function saveFallback() {
    if (fallbackProviderDraft && !fallbackModelDraft) return;
    await updatePreferences({
      fallbackProvider: fallbackProviderDraft || null,
      fallbackModel: fallbackProviderDraft ? fallbackModelDraft : null,
    });
  }

  return (
    <>
      <section className="settings-section" aria-labelledby="appearance-heading">
        <h2 id="appearance-heading">Appearance</h2>
        <p>Dark appearance is the current COSMOS theme.</p>
        <div className="settings-value-row">
          <span>Interface theme</span>
          <strong>Dark</strong>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="model-heading">
        <h2 id="model-heading">AI model and provider</h2>
        <p>
          Choose a configured provider and browse its current model catalog. Credentials and
          endpoints remain server-side.
        </p>
        <label className="settings-field">
          <span className="field-label">Provider</span>
          <select
            className="text-field"
            value={providerId}
            disabled={pending}
            onChange={(event) => void changeProvider(event.target.value as ProviderId)}
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id} disabled={!provider.configured}>
                {provider.name}
                {provider.configured ? "" : " (not configured)"}
              </option>
            ))}
          </select>
        </label>
        {models.length ? (
          <label className="settings-field">
            <span className="field-label">Primary model</span>
            <select
              className="text-field"
              value={model}
              disabled={pending}
              onChange={(event) => void updatePreferences({ preferredModel: event.target.value })}
            >
              <option value="">Select a model</option>
              {models.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.id})
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="settings-empty">{discoveryError ?? "Loading current model catalog…"}</p>
        )}
        <div className="settings-value-row">
          <span>Provider health</span>
          <strong className={health?.healthy ? "connection-ready" : "connection-missing"}>
            {health ? health.message : "Not checked"}
          </strong>
          <button
            className="settings-action"
            type="button"
            disabled={healthPending}
            onClick={() => void checkProvider()}
          >
            {healthPending ? "Checking…" : "Check connection"}
          </button>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="fallback-heading">
        <h2 id="fallback-heading">Fallback model</h2>
        <p>A fallback is attempted only when the primary provider fails before producing output.</p>
        <label className="settings-field">
          <span className="field-label">Fallback provider</span>
          <select
            className="text-field"
            value={fallbackProviderDraft}
            disabled={pending}
            onChange={(event) => {
              setFallbackProviderDraft(event.target.value as ProviderId | "");
              setFallbackModelDraft("");
            }}
          >
            <option value="">No fallback</option>
            {providers
              .filter((provider) => provider.configured)
              .map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
          </select>
        </label>
        {fallbackProviderDraft && (
          <label className="settings-field">
            <span className="field-label">Fallback model</span>
            <select
              className="text-field"
              value={fallbackModelDraft}
              disabled={pending || !fallbackModels.length}
              onChange={(event) => setFallbackModelDraft(event.target.value)}
            >
              <option value="">Select a fallback model</option>
              {fallbackModels.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.id})
                </option>
              ))}
            </select>
          </label>
        )}
        <button
          className="settings-action"
          type="button"
          disabled={pending || (!!fallbackProviderDraft && !fallbackModelDraft)}
          onClick={() => void saveFallback()}
        >
          Save fallback
        </button>
      </section>

      <section className="settings-section" aria-labelledby="generation-heading">
        <h2 id="generation-heading">Generation</h2>
        <p>These parameters apply to new requests for your account.</p>
        <label className="settings-field">
          <span className="field-label">Temperature: {temperatureDraft.toFixed(1)}</span>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            value={temperatureDraft}
            onChange={(event) => setTemperatureDraft(Number(event.target.value))}
          />
        </label>
        <label className="settings-field">
          <span className="field-label">Maximum output tokens</span>
          <input
            className="text-field"
            type="number"
            min="64"
            max="8192"
            step="64"
            value={maxTokensDraft}
            onChange={(event) => setMaxTokensDraft(Number(event.target.value))}
          />
        </label>
        <label className="settings-field">
          <span className="field-label">Additional system instructions</span>
          <textarea
            className="text-field instructions-field"
            maxLength={4000}
            value={instructionsDraft}
            onChange={(event) => setInstructionsDraft(event.target.value)}
            placeholder="Optional response style or task guidance"
          />
        </label>
        <button
          className="settings-action primary"
          type="button"
          disabled={pending}
          onClick={() => void saveGenerationSettings()}
        >
          Save generation settings
        </button>
      </section>

      <section className="settings-section" aria-labelledby="tools-heading">
        <h2 id="tools-heading">Tool permissions</h2>
        <p>Only enabled tools are exposed to the model. The calculator performs arithmetic only.</p>
        <div className="memory-toggle-row">
          <div>
            <strong>Allow calculator in chat</strong>
            <small>No file, network, or shell access.</small>
          </div>
          <button
            className="toggle-button"
            type="button"
            role="switch"
            aria-label="Allow calculator in chat"
            aria-checked={calculatorEnabled}
            disabled={pending}
            onClick={() => void updatePreferences({ calculatorEnabled: !calculatorEnabled })}
          />
        </div>
      </section>

      <section className="settings-section" aria-labelledby="privacy-heading">
        <h2 id="privacy-heading">Privacy and data</h2>
        <p>
          Conversations are stored in your Supabase account and sent to the selected OpenRouter
          model when you request a reply. Saved memories are excluded unless you enable memory.
        </p>
        <div className="settings-value-row">
          <span>Conversation retention</span>
          <strong>Until you delete a conversation</strong>
        </div>
        <p className="settings-empty">
          Export and full account deletion are not yet available in the app. Delete individual
          conversations from the chat history; manage saved memories above.
        </p>
      </section>

      {(error || status) && (
        <p className={`inline-status${error ? " error" : ""}`} role={error ? "alert" : "status"}>
          {error ?? status}
        </p>
      )}
    </>
  );
}
