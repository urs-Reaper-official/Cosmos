import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth/user";
import { idSchema } from "@/lib/security/schemas";
import { AppError, apiErrorResponse } from "@/lib/utils/api-error";

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ memoryId: string }> },
) {
  try {
    const { memoryId } = await context.params;
    const parsedId = idSchema.safeParse(memoryId);
    if (!parsedId.success) throw new AppError("Memory not found.", 404, "NOT_FOUND");

    const { supabase, user } = await requireUser();
    const { data, error } = await supabase
      .from("cosmos_memories")
      .delete()
      .eq("id", parsedId.data)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new AppError("Memory not found.", 404, "NOT_FOUND");
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
