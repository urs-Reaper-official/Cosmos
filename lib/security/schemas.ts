import { z } from "zod";

export const providerIdSchema = z.enum(["openrouter", "openai-compatible", "ollama"]);
export const modelIdSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);

export const chatRequestSchema = z
  .object({
    conversationId: z.uuid().optional(),
    message: z.string().trim().min(1).max(8000),
    regenerate: z.boolean().default(false),
    editFromMessageId: z.uuid().optional(),
  })
  .refine((value) => !(value.regenerate && value.editFromMessageId), {
    message: "Regeneration and editing cannot be requested together.",
  });

export const memoryRequestSchema = z.object({
  content: z.string().trim().min(1).max(1200),
});

export const preferenceRequestSchema = z
  .object({
    memoryEnabled: z.boolean().optional(),
    providerId: providerIdSchema.optional(),
    preferredModel: modelIdSchema.nullable().optional(),
    calculatorEnabled: z.boolean().optional(),
    fallbackProvider: providerIdSchema.nullable().optional(),
    fallbackModel: modelIdSchema.nullable().optional(),
    temperature: z.number().min(0).max(2).optional(),
    maxOutputTokens: z.number().int().min(64).max(8192).optional(),
    systemInstructions: z.string().max(4000).nullable().optional(),
  })
  .refine(
    (value) =>
      value.memoryEnabled !== undefined ||
      value.providerId !== undefined ||
      value.preferredModel !== undefined ||
      value.calculatorEnabled !== undefined ||
      value.fallbackProvider !== undefined ||
      value.fallbackModel !== undefined ||
      value.temperature !== undefined ||
      value.maxOutputTokens !== undefined ||
      value.systemInstructions !== undefined,
    { message: "At least one preference is required." },
  )
  .refine(
    (value) =>
      (value.fallbackProvider === undefined && value.fallbackModel === undefined) ||
      (value.fallbackProvider !== undefined &&
        value.fallbackModel !== undefined &&
        ((value.fallbackProvider === null && value.fallbackModel === null) ||
          (value.fallbackProvider !== null && value.fallbackModel !== null))),
    { message: "Fallback provider and model must be configured together." },
  );

export const idSchema = z.uuid();
