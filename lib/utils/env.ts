import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

const environmentSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  OPENROUTER_API_KEY: optionalString,
  OPENROUTER_MODEL: optionalString,
  OPENAI_COMPATIBLE_BASE_URL: optionalUrl,
  OPENAI_COMPATIBLE_API_KEY: optionalString,
  OPENAI_COMPATIBLE_MODEL: optionalString,
  OLLAMA_BASE_URL: optionalUrl,
  OLLAMA_MODEL: optionalString,
  COSMOS_DEFAULT_PROVIDER: z.enum(["openrouter", "openai-compatible", "ollama"]).optional(),
  NEXT_PUBLIC_APP_URL: optionalUrl,
});

export function getEnvironment() {
  return environmentSchema.parse(process.env);
}

export function isSupabaseConfigured() {
  const environment = getEnvironment();
  return Boolean(environment.NEXT_PUBLIC_SUPABASE_URL && environment.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function isModelConfigured() {
  return Boolean(getEnvironment().OPENROUTER_API_KEY);
}
