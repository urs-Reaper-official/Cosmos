import { redirect } from "next/navigation";
import { ChatWorkspace } from "@/components/chat/chat-workspace";
import { SetupNotice } from "@/components/layout/setup-notice";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getDefaultModelId,
  getDefaultProviderId,
  getModelProviderRegistry,
} from "@/lib/ai/providers";
import type { ProviderId } from "@/lib/ai/provider-types";
import { isSupabaseConfigured } from "@/lib/utils/env";

export const metadata = { title: "Chat" };

export default async function ChatPage() {
  if (!isSupabaseConfigured()) {
    return <SetupNotice title="Connect your Supabase project" />;
  }

  let supabase: Awaited<ReturnType<typeof createSupabaseServerClient>> | undefined;
  try {
    supabase = await createSupabaseServerClient();
  } catch {
    return <SetupNotice title="COSMOS could not connect to its data service" />;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [conversationsResult, preferencesResult] = await Promise.all([
    supabase
      .from("conversations")
      .select("id, title, updated_at")
      .order("updated_at", { ascending: false })
      .limit(40),
    supabase
      .from("cosmos_preferences")
      .select(
        "provider_id, preferred_model, calculator_enabled, fallback_provider, fallback_model, temperature, max_output_tokens, system_instructions",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (conversationsResult.error || preferencesResult.error) {
    return <SetupNotice title="COSMOS could not load your workspace" />;
  }
  const conversations = conversationsResult.data;

  const activeConversation = conversations?.[0] ?? null;
  const { data: initialMessages, error: messagesError } = activeConversation
    ? await supabase
        .from("messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", activeConversation.id)
        .order("created_at", { ascending: true })
        .limit(100)
    : { data: [], error: null };
  if (messagesError) return <SetupNotice title="COSMOS could not load this conversation" />;

  const preferences = preferencesResult.data;
  const providerId = (preferences?.provider_id ?? getDefaultProviderId()) as ProviderId;
  const providers = getModelProviderRegistry()
    .list()
    .map((provider) => ({
      id: provider.id,
      name: provider.displayName,
      configured: provider.isConfigured(),
    }));
  return (
    <ChatWorkspace
      conversations={conversations ?? []}
      initialConversationId={activeConversation?.id ?? null}
      initialMessages={initialMessages ?? []}
      userId={user.id}
      userEmail={user.email ?? "Account"}
      providerId={providerId}
      providers={providers}
      model={preferences?.preferred_model ?? getDefaultModelId(providerId)}
      calculatorEnabled={preferences?.calculator_enabled ?? false}
    />
  );
}
