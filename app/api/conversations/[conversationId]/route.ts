import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { idSchema } from "@/lib/security/schemas";
import { AppError, apiErrorResponse } from "@/lib/utils/api-error";

type RouteContext = { params: Promise<{ conversationId: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { conversationId } = await context.params;
    const parsedId = idSchema.safeParse(conversationId);
    if (!parsedId.success) throw new AppError("Conversation not found.", 404, "NOT_FOUND");

    const { supabase } = await requireUser();
    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("id, title")
      .eq("id", parsedId.data)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) throw new AppError("Conversation not found.", 404, "NOT_FOUND");

    const { data: messages, error } = await supabase
      .from("messages")
      .select("id, role, content, created_at")
      .eq("conversation_id", conversation.id)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ conversation, messages: messages ?? [] });
  } catch (error) {
    return apiErrorResponse(error);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { conversationId } = await context.params;
    const parsedId = idSchema.safeParse(conversationId);
    if (!parsedId.success) throw new AppError("Conversation not found.", 404, "NOT_FOUND");

    const { supabase } = await requireUser();
    const { data, error } = await supabase
      .from("conversations")
      .delete()
      .eq("id", parsedId.data)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new AppError("Conversation not found.", 404, "NOT_FOUND");
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
