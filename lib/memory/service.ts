import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type UserDatabase = SupabaseClient<Database>;

export async function getEnabledMemories(database: UserDatabase, userId: string) {
  const { data: preference, error: preferenceError } = await database
    .from("cosmos_preferences")
    .select("memory_enabled")
    .eq("user_id", userId)
    .maybeSingle();
  if (preferenceError) throw preferenceError;
  if (!preference?.memory_enabled) return [];

  const { data, error } = await database
    .from("cosmos_memories")
    .select("content")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw error;
  return (data ?? []).map((memory) => memory.content);
}
