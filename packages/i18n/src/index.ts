export type MessageValues = Record<string, number | string>;

export type Dictionary<TKey extends string = string> = Record<TKey, string>;

export type PluralCategory = "zero" | "one" | "two" | "few" | "many" | "other";

export type PluralMessages = Partial<Record<PluralCategory, string>> & {
  other: string;
};

export type PluralFormatOptions = Intl.PluralRulesOptions & {
  values?: MessageValues;
};

export type RelativeTimeUnit = Intl.RelativeTimeFormatUnit;

export type LocaleMetadata<TLocale extends string = string> = {
  id: TLocale;
  htmlLang: string;
  intlLocale: string;
  label: string;
  shortLabel: string;
};

export type LocaleDictionaries<TLocale extends string, TKey extends string> = Record<
  TLocale,
  Dictionary<TKey>
>;

export type Translate<TKey extends string = string> = (key: TKey, values?: MessageValues) => string;

export function createTranslator<TLocale extends string, TKey extends string>(options: {
  defaultLocale: TLocale;
  dictionaries: LocaleDictionaries<TLocale, TKey>;
  locale: TLocale;
}): Translate<TKey> {
  return (key, values) => {
    const template =
      options.dictionaries[options.locale][key] ??
      options.dictionaries[options.defaultLocale][key] ??
      key;

    return interpolate(template, values);
  };
}

export function defineMessages<const TMessages extends Dictionary>(messages: TMessages): TMessages {
  return messages;
}

export function hasMessageKey<TKey extends string>(
  dictionary: Dictionary<TKey>,
  key: string,
): key is TKey {
  return key in dictionary;
}

export function createCodeLabeler<TKey extends string>(options: {
  fallback?: (code: string) => string;
  hasMessageKey: (key: string) => key is TKey;
  prefix: string;
  translate: Translate<TKey>;
}): (code: string) => string {
  return (code) => {
    const key = `${options.prefix}.${code}`;
    if (options.hasMessageKey(key)) {
      return options.translate(key);
    }

    return options.fallback?.(code) ?? code;
  };
}

export function createLocaleFormatters<TKey extends string>(options: {
  intlLocale: string;
  translate?: Translate<TKey>;
  unknownKey?: TKey;
}) {
  const formatNumber = (value: number, numberOptions?: Intl.NumberFormatOptions): string => {
    return new Intl.NumberFormat(options.intlLocale, numberOptions).format(value);
  };
  const formatBytes = (value: number | null): string => {
    if (value === null) {
      return options.unknownKey && options.translate
        ? options.translate(options.unknownKey)
        : "unknown";
    }

    if (value < 1024) {
      return `${formatNumber(value)} B`;
    }

    return `${formatNumber(value / 1024, { maximumFractionDigits: 1 })} KB`;
  };
  const formatDateTime = (value: Date | string): string => {
    return new Intl.DateTimeFormat(options.intlLocale, {
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
    }).format(toDate(value));
  };
  const formatTime = (value: Date | string): string => {
    return new Intl.DateTimeFormat(options.intlLocale, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(toDate(value));
  };
  const formatPlural = (
    value: number,
    forms: PluralMessages,
    pluralOptions: PluralFormatOptions = {},
  ): string => {
    const { values, ...rulesOptions } = pluralOptions;
    const category = new Intl.PluralRules(options.intlLocale, rulesOptions).select(
      value,
    ) as PluralCategory;
    const template = forms[category] ?? forms.other;

    return interpolate(template, {
      count: value,
      formattedCount: formatNumber(value),
      ...values,
    });
  };
  const formatRelativeTime = (value: number, unit: RelativeTimeUnit): string => {
    return new Intl.RelativeTimeFormat(options.intlLocale, {
      numeric: "auto",
    }).format(value, unit);
  };

  return {
    formatBytes,
    formatDateTime,
    formatNumber,
    formatPlural,
    formatRelativeTime,
    formatTime,
  };
}

export function isKnownLocale<TLocale extends string>(
  value: string | null | undefined,
  localeOptions: readonly LocaleMetadata<TLocale>[],
): value is TLocale {
  return localeOptions.some((option) => option.id === value);
}

export function resolveLocale<TLocale extends string>(options: {
  candidates: readonly (string | null | undefined)[];
  defaultLocale: TLocale;
  localeOptions: readonly LocaleMetadata<TLocale>[];
}): TLocale {
  for (const candidate of options.candidates) {
    const locale = matchLocaleCandidate(candidate, options.localeOptions);
    if (locale) return locale;
  }

  return options.defaultLocale;
}

export function localeCandidatesFromAcceptLanguage(value: string | null | undefined): string[] {
  if (!value) return [];

  return value
    .split(",")
    .map((entry, index) => {
      const [tag = "", ...parameters] = entry.trim().split(";");
      const quality = parameters
        .map((parameter) => parameter.trim())
        .find((parameter) => parameter.startsWith("q="));
      const parsedQuality = quality ? Number(quality.slice(2)) : 1;

      return {
        index,
        quality: Number.isFinite(parsedQuality) ? parsedQuality : 0,
        tag: tag.trim(),
      };
    })
    .filter((entry) => entry.tag && entry.quality > 0)
    .sort((left, right) => right.quality - left.quality || left.index - right.index)
    .map((entry) => entry.tag);
}

export function nextLocale<TLocale extends string>(
  current: TLocale,
  localeOptions: readonly LocaleMetadata<TLocale>[],
): TLocale {
  const first = localeOptions[0];
  if (!first) {
    throw new Error("localeOptions must include at least one locale.");
  }

  const currentIndex = localeOptions.findIndex((option) => option.id === current);
  return localeOptions[(currentIndex + 1) % localeOptions.length]?.id ?? first.id;
}

export function interpolate(template: string, values: MessageValues | undefined): string {
  if (!values) return template;

  return Object.entries(values).reduce((result, [name, value]) => {
    return result.replace(new RegExp(`\\{${escapeRegExp(name)}\\}`, "g"), String(value));
  }, template);
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function matchLocaleCandidate<TLocale extends string>(
  value: string | null | undefined,
  localeOptions: readonly LocaleMetadata<TLocale>[],
): TLocale | null {
  if (!value) return null;

  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "*") return null;

  for (const option of localeOptions) {
    if (
      option.id.toLowerCase() === normalized ||
      option.htmlLang.toLowerCase() === normalized ||
      option.intlLocale.toLowerCase() === normalized
    ) {
      return option.id;
    }
  }

  const baseLanguage = normalized.split("-")[0];
  if (!baseLanguage) return null;

  return (
    localeOptions.find((option) => {
      return (
        option.id.toLowerCase().split("-")[0] === baseLanguage ||
        option.htmlLang.toLowerCase().split("-")[0] === baseLanguage ||
        option.intlLocale.toLowerCase().split("-")[0] === baseLanguage
      );
    })?.id ?? null
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
