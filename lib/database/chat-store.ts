import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import { AppError } from "@/lib/utils/api-error";

type UserDatabase = SupabaseClient<Database>;
export type ChatTurn = { role: "user" | "assistant"; content: string };

export async function getConversationHistory(
  database: UserDatabase,
  userId: string,
  conversationId: string,
): Promise<ChatTurn[]> {
  const { data: conversation, error: conversationError } = await database
    .from("conversations")
    .select("id")
    .eq("id", conversationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (conversationError) throw conversationError;
  if (!conversation) throw new AppError("Conversation not found.", 404, "NOT_FOUND");

  const { data, error } = await database
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) throw error;
  return (data ?? [])
    .reverse()
    .filter((turn) => turn.role === "user" || turn.role === "assistant")
    .map(({ role, content }) => ({ role, content }));
}

export async function getConversationHistoryBeforeMessage(
  database: UserDatabase,
  userId: string,
  conversationId: string,
  messageId: string,
): Promise<ChatTurn[]> {
  const { data: messages, error } = await database
    .from("messages")
    .select("id, role, content")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;

  const targetIndex = (messages ?? []).findIndex((message) => message.id === messageId);
  if (targetIndex < 0 || messages?.[targetIndex]?.role !== "user") {
    throw new AppError("That message cannot be edited.", 404, "NOT_FOUND");
  }
  return (messages ?? [])
    .slice(0, targetIndex)
    .filter((turn) => turn.role === "user" || turn.role === "assistant")
    .map(({ role, content }) => ({ role, content }));
}

export async function createConversation(database: UserDatabase, userId: string, title: string) {
  const { data, error } = await database
    .from("conversations")
    .insert({ user_id: userId, title: title.slice(0, 80) })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

export async function persistConversationTurn(
  database: UserDatabase,
  userId: string,
  conversationId: string,
  userMessage: string,
  assistantMessage: string,
) {
  const { error: messageError } = await database.from("messages").insert([
    { conversation_id: conversationId, user_id: userId, role: "user", content: userMessage },
    {
      conversation_id: conversationId,
      user_id: userId,
      role: "assistant",
      content: assistantMessage,
    },
  ]);
  if (messageError) throw messageError;

  const { error: updateError } = await database
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("user_id", userId);
  if (updateError) throw updateError;
}

export async function replaceLatestAssistantReply(
  database: UserDatabase,
  userId: string,
  conversationId: string,
  assistantMessage: string,
) {
  const { data: latestAssistant, error: lookupError } = await database
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("user_id", userId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!latestAssistant) throw new AppError("Assistant reply not found.", 404, "NOT_FOUND");

  const { error } = await database
    .from("messages")
    .update({ content: assistantMessage })
    .eq("id", latestAssistant.id)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function createEditedConversationBranch(
  database: UserDatabase,
  userId: string,
  sourceConversationId: string,
  messageId: string,
  editedPrompt: string,
  assistantReply: string,
) {
  const { data: sourceMessages, error: sourceError } = await database
    .from("messages")
    .select("id, role, content")
    .eq("conversation_id", sourceConversationId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (sourceError) throw sourceError;

  const targetIndex = (sourceMessages ?? []).findIndex((message) => message.id === messageId);
  if (targetIndex < 0 || sourceMessages?.[targetIndex]?.role !== "user") {
    throw new AppError("That message cannot be edited.", 404, "NOT_FOUND");
  }

  const { data: conversation, error: conversationError } = await database
    .from("conversations")
    .insert({ user_id: userId, title: editedPrompt.slice(0, 80) })
    .select("id")
    .single();
  if (conversationError) throw conversationError;

  const branchMessages = [
    ...(sourceMessages ?? []).slice(0, targetIndex).map(({ role, content }) => ({
      conversation_id: conversation.id,
      user_id: userId,
      role: role as "user" | "assistant",
      content,
    })),
    {
      conversation_id: conversation.id,
      user_id: userId,
      role: "user" as const,
      content: editedPrompt,
    },
    {
      conversation_id: conversation.id,
      user_id: userId,
      role: "assistant" as const,
      content: assistantReply,
    },
  ];
  const { error: insertError } = await database.from("messages").insert(branchMessages);
  if (insertError) {
    await database.from("conversations").delete().eq("id", conversation.id).eq("user_id", userId);
    throw insertError;
  }
  return conversation.id;
}

export async function deleteEmptyConversation(
  database: UserDatabase,
  userId: string,
  conversationId: string,
) {
  const { count, error: countError } = await database
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
  if (countError) throw countError;
  if (count) return;

  const { error } = await database
    .from("conversations")
    .delete()
    .eq("id", conversationId)
    .eq("user_id", userId);
  if (error) throw error;
}
