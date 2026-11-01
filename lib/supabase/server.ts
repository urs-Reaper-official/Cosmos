import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { Database } from "@/types/database";
import { AppError } from "@/lib/utils/api-error";
import { getEnvironment } from "@/lib/utils/env";

export async function createSupabaseServerClient() {
  const environment = getEnvironment();
  const url = environment.NEXT_PUBLIC_SUPABASE_URL;
  const key = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new AppError("Supabase is not configured.", 503, "SUPABASE_NOT_CONFIGURED");
  }

  const cookieStore = await cookies();
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot write cookies; the auth proxy refreshes sessions.
        }
      },
    },
  });
}
