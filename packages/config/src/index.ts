import * as v from "valibot";

export const AppEnvironmentSchema = v.picklist(["local", "preview", "production"]);

export const RuntimeConfigSchema = v.object({
  APP_ENV: AppEnvironmentSchema,
  MAIL_FROM: v.optional(v.pipe(v.string(), v.email())),
  PUBLIC_APP_NAME: v.optional(v.string()),
  PUBLIC_APP_URL: v.optional(v.string()),
});

export type AppEnvironment = v.InferOutput<typeof AppEnvironmentSchema>;
export type RuntimeConfig = v.InferOutput<typeof RuntimeConfigSchema>;

export function parseRuntimeConfig(input: unknown): RuntimeConfig {
  return v.parse(RuntimeConfigSchema, input);
}
