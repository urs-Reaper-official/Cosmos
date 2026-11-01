import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, LogOut } from "lucide-react";
import { MemoryManager } from "@/components/settings/memory-manager";
import { SetupNotice } from "@/components/layout/setup-notice";
import { signOutAction } from "@/lib/auth/actions";
import {
  getDefaultModelId,
  getDefaultProviderId,
  getModelProviderRegistry,
} from "@/lib/ai/providers";
import type { ProviderId } from "@/lib/ai/provider-types";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils/env";
import { AISettings } from "@/components/settings/ai-settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  if (!isSupabaseConfigured()) {
    return <SetupNotice title="Connect your Supabase project" />;
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> | undefined;
  let connectionFailed = false;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    connectionFailed = true;
  }
  if (connectionFailed || !supabase) {
    return <SetupNotice title="COSMOS could not connect to its data service" />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [preferenceResult, memoriesResult] = await Promise.all([
    supabase
      .from("cosmos_preferences")
      .select(
        "memory_enabled, provider_id, preferred_model, calculator_enabled, fallback_provider, fallback_model, temperature, max_output_tokens, system_instructions",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("cosmos_memories")
      .select("id, content, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (preferenceResult.error || memoriesResult.error) {
    return <SetupNotice title="COSMOS could not load your settings" />;
  }
  const preferences = preferenceResult.data;
  const providerId = (preferences?.provider_id ?? getDefaultProviderId()) as ProviderId;
  const providers = getModelProviderRegistry()
    .list()
    .map((provider) => ({
      id: provider.id,
      name: provider.displayName,
      configured: provider.isConfigured(),
    }));

  return (
    <main className="settings-page">
      <header className="settings-topbar">
        <Link className="sidebar-brand settings-brand" href="/chat">
          <span className="brand-mark">C</span>
          <span className="brand-copy">
            <strong>COSMOS</strong>
            <small>SUPER INTELLIGENCE</small>
          </span>
        </Link>
        <Link className="settings-back" href="/chat">
          <ArrowLeft size={15} aria-hidden="true" /> Back to chat
        </Link>
      </header>

      <div className="settings-heading">
        <div>
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h1>Settings</h1>
          <p>Manage what COSMOS can remember between conversations.</p>
        </div>
      </div>

      <MemoryManager
        initialEnabled={preferenceResult.data?.memory_enabled ?? false}
        initialMemories={memoriesResult.data ?? []}
      />
      <AISettings
        providers={providers}
        initialProviderId={providerId}
        initialModel={preferences?.preferred_model ?? getDefaultModelId(providerId)}
        initialCalculatorEnabled={preferences?.calculator_enabled ?? false}
        initialFallbackProvider={(preferences?.fallback_provider as ProviderId | null) ?? null}
        initialFallbackModel={preferences?.fallback_model ?? null}
        initialTemperature={preferences?.temperature ?? 0.7}
        initialMaxOutputTokens={preferences?.max_output_tokens ?? 2048}
        initialSystemInstructions={preferences?.system_instructions ?? ""}
      />

      <section className="settings-section account-section" aria-labelledby="account-heading">
        <div>
          <h2 id="account-heading">Account</h2>
          <p>Your workspace data is associated with this signed-in account.</p>
        </div>
        <div className="account-row">
          <span className="account-email">{user.email ?? "Signed-in account"}</span>
          <form action={signOutAction}>
            <button className="account-signout" type="submit">
              <LogOut size={14} aria-hidden="true" /> Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
