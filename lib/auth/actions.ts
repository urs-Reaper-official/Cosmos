"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getEnvironment } from "@/lib/utils/env";

export type AuthActionState = { error?: string; message?: string };

const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(72),
});

function parseCredentials(formData: FormData) {
  return credentialsSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
}

export async function signInAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const credentials = parseCredentials(formData);
  if (!credentials.success) return { error: "Enter a valid email and password (8+ characters)." };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithPassword(credentials.data);
    if (error) return { error: "Unable to sign in with those credentials." };
  } catch {
    return { error: "Authentication is not configured. Check the server environment." };
  }

  redirect("/chat");
}

export async function signUpAction(
  _previousState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const credentials = parseCredentials(formData);
  if (!credentials.success) return { error: "Enter a valid email and password (8+ characters)." };

  try {
    const supabase = await createSupabaseServerClient();
    const environment = getEnvironment();
    const { data, error } = await supabase.auth.signUp({
      ...credentials.data,
      options: {
        emailRedirectTo: `${environment.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/auth/callback`,
      },
    });
    if (error) return { error: "Unable to create an account. Check the details and try again." };
    if (!data.session)
      return { message: "Check your email to confirm your account, then sign in." };
  } catch {
    return { error: "Authentication is not configured. Check the server environment." };
  }

  redirect("/chat");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
