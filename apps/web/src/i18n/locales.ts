import type { LocaleMetadata } from "@qitu/i18n";

export const localeOptions = [
  {
    id: "en",
    label: "English",
    shortLabel: "EN",
    htmlLang: "en",
    intlLocale: "en-GB",
  },
  {
    id: "zh-CN",
    label: "简体中文",
    shortLabel: "中",
    htmlLang: "zh-CN",
    intlLocale: "zh-CN",
  },
] as const satisfies readonly LocaleMetadata<string>[];

export type Locale = (typeof localeOptions)[number]["id"];
export type LocaleMeta = LocaleMetadata<Locale>;

export const defaultLocale: Locale = "en";
export const storageKey = "qitu.locale";
