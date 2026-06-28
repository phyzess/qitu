import { parseRuntimeConfig } from "@qitu/config";

export function runtimeConfig(env: Env) {
  return parseRuntimeConfig({
    APP_ENV: env.APP_ENV,
    MAIL_FROM: env.MAIL_FROM || undefined,
    PUBLIC_APP_NAME: env.PUBLIC_APP_NAME || undefined,
    PUBLIC_APP_URL: env.PUBLIC_APP_URL || undefined,
  });
}

export function appName(env: Env): string {
  return runtimeConfig(env).PUBLIC_APP_NAME ?? "qitu";
}

export function buildAppUrl(env: Env, path: string): string {
  const baseUrl = runtimeConfig(env).PUBLIC_APP_URL ?? "http://localhost:5173";
  return new URL(path, baseUrl).toString();
}

export function isLocalAppEnv(env: Env): boolean {
  return runtimeConfig(env).APP_ENV === "local";
}
