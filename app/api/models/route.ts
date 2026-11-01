import { NextRequest, NextResponse } from "next/server";
import { getModelProviderRegistry } from "@/lib/ai/providers";
import { requireUser } from "@/lib/auth/user";
import { providerIdSchema } from "@/lib/security/schemas";
import { AppError, apiErrorResponse } from "@/lib/utils/api-error";

export async function GET(request: NextRequest) {
  try {
    await requireUser();
    const providerId = providerIdSchema.safeParse(request.nextUrl.searchParams.get("providerId"));
    if (!providerId.success)
      throw new AppError("Choose a supported provider.", 400, "INVALID_PROVIDER");

    const provider = getModelProviderRegistry().get(providerId.data);
    if (!provider.isConfigured()) {
      throw new AppError(
        "This provider is not configured on the server.",
        503,
        "PROVIDER_NOT_CONFIGURED",
      );
    }
    try {
      const models = await provider.discoverModels(request.signal);
      return NextResponse.json({ providerId: provider.id, models });
    } catch {
      throw new AppError(
        "Could not retrieve the current model catalog.",
        502,
        "MODEL_DISCOVERY_FAILED",
      );
    }
  } catch (error) {
    return apiErrorResponse(error);
  }
}
