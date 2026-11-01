import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { memoryRequestSchema } from "@/lib/security/schemas";
import { AppError, apiErrorResponse } from "@/lib/utils/api-error";

export async function GET() {
  try {
    const { supabase, user } = await requireUser();
    const { data, error } = await supabase
      .from("cosmos_memories")
      .select("id, content, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ memories: data ?? [] });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError("Request body must be valid JSON.", 400, "INVALID_JSON");
    }
    const parsed = memoryRequestSchema.safeParse(body);
    if (!parsed.success)
      throw new AppError("Memory must be up to 1,200 characters.", 400, "INVALID_REQUEST");

    const { supabase, user } = await requireUser();
    const { data, error } = await supabase
      .from("cosmos_memories")
      .insert({ user_id: user.id, content: parsed.data.content })
      .select("id, content, created_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ memory: data }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
