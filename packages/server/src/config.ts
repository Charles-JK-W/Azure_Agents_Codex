import { z } from "zod";

const baseSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.string().default("info"),
  ALLOWED_ORIGINS: z
    .string()
    .optional()
    .transform(
      (value) =>
        value
          ?.split(",")
          .map((origin) => origin.trim())
          .filter(Boolean) ?? [],
    ),
});

const azureSchema = z.object({
  AZURE_AI_FOUNDRY_ENDPOINT: z.string().url(),
  AZURE_AI_FOUNDRY_PROJECT: z.string().min(1),
  AZURE_AI_FOUNDRY_AGENT_ID: z.string().min(1),
  AZURE_TENANT_ID: z.string().min(1),
  AZURE_CLIENT_ID: z.string().min(1),
  AZURE_CLIENT_SECRET: z.string().min(1),
});

export type AzureConfig = z.infer<typeof azureSchema>;

export interface AppConfig extends z.infer<typeof baseSchema> {
  azure?: AzureConfig;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const base = baseSchema.parse(env);
  const azure = azureSchema.safeParse(env);

  if (azure.success) {
    return { ...base, azure: azure.data };
  }

  return base;
}
