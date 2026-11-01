import { NextResponse } from "next/server";
import { getDefaultProviderId, getModelProviderRegistry } from "@/lib/ai/providers";
import { requireUser } from "@/lib/auth/user";
import { apiErrorResponse } from "@/lib/utils/api-error";

export async function GET() {
  try {
    await requireUser();
    const registry = getModelProviderRegistry();
    return NextResponse.json({
      defaultProviderId: getDefaultProviderId(),
      providers: registry.list().map((provider) => ({
        id: provider.id,
        name: provider.displayName,
        configured: provider.isConfigured(),
      })),
    });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
