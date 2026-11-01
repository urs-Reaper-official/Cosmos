import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { SetupNotice } from "@/components/layout/setup-notice";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/utils/env";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  let configured = false;
  try {
    configured = isSupabaseConfigured();
  } catch {
    configured = false;
  }
  if (!configured) {
    return (
      <main className="min-h-dvh px-5 py-12">
        <SetupNotice title="Set up COSMOS authentication" />
      </main>
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/chat");
  const params = await searchParams;

  return <AuthForm confirmationError={params.error === "confirmation"} />;
}
