import { AppError } from "@/lib/utils/api-error";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) {
    throw new AppError("Sign in to continue.", 401, "UNAUTHORIZED");
  }
  return { supabase, user };
}
