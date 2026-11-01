import { NextRequest, NextResponse } from "next/server";
import { getModelProviderRegistry } from "@/lib/ai/providers";
import { requireUser } from "@/lib/auth/user";
import { AppError, apiErrorResponse } from "@/lib/utils/api-error";
import { providerIdSchema } from "@/lib/security/schemas";

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError("Request body must be valid JSON.", 400, "INVALID_JSON");
    }
    const parsed = providerIdSchema.safeParse(
      body && typeof body === "object" ? (body as { providerId?: unknown }).providerId : undefined,
    );
    if (!parsed.success)
      throw new AppError("Choose a supported provider.", 400, "INVALID_PROVIDER");

    const provider = getModelProviderRegistry().get(parsed.data);
    return NextResponse.json({ health: await provider.validateCredentials(request.signal) });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
