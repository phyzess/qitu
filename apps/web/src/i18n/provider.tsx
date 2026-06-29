import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createCodeLabeler,
  createLocaleFormatters,
  createTranslator,
  hasMessageKey,
  isKnownLocale,
  type PluralFormatOptions,
  type PluralMessages,
  type RelativeTimeUnit,
  type Translate as BaseTranslate,
} from "@qitu/i18n";
import { defaultLocale, localeOptions, storageKey, type Locale, type LocaleMeta } from "./locales";
import { messages, type MessageKey } from "./messages";

type I18nContextValue = {
  locale: Locale;
  localeMeta: LocaleMeta;
  setLocale: (locale: Locale) => void;
  t: Translate;
  formatBytes: (value: number | null) => string;
  formatDateTime: (value: string) => string;
  formatNumber: (value: number) => string;
  formatPlural: (value: number, forms: PluralMessages, options?: PluralFormatOptions) => string;
  formatRelativeTime: (value: number, unit: RelativeTimeUnit) => string;
  formatStatus: (status: string) => string;
  formatTime: (value: string) => string;
  roleLabel: (role: string) => string;
};

export type Translate = BaseTranslate<MessageKey>;

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider(props: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => readStoredLocale());
  const localeMeta = localeOptions.find((option) => option.id === locale) ?? localeOptions[0]!;

  useEffect(() => {
    window.localStorage.setItem(storageKey, locale);
    document.documentElement.lang = localeMeta.htmlLang;
  }, [locale, localeMeta.htmlLang]);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
  }, []);

  const t = useMemo(
    () =>
      createTranslator({
        defaultLocale,
        dictionaries: messages,
        locale,
      }),
    [locale],
  );

  const localeFormatters = useMemo(
    () =>
      createLocaleFormatters({
        intlLocale: localeMeta.intlLocale,
        translate: t,
        unknownKey: "common.unknown",
      }),
    [localeMeta.intlLocale, t],
  );
  const formatStatus = useMemo(
    () =>
      createCodeLabeler({
        hasMessageKey: isMessageKey,
        prefix: "status",
        translate: t,
      }),
    [t],
  );
  const roleLabel = useMemo(
    () =>
      createCodeLabeler({
        hasMessageKey: isMessageKey,
        prefix: "role",
        translate: t,
      }),
    [t],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      formatBytes: localeFormatters.formatBytes,
      formatDateTime: localeFormatters.formatDateTime,
      formatNumber: localeFormatters.formatNumber,
      formatPlural: localeFormatters.formatPlural,
      formatRelativeTime: localeFormatters.formatRelativeTime,
      formatStatus,
      formatTime: localeFormatters.formatTime,
      locale,
      localeMeta,
      roleLabel,
      setLocale,
      t,
    }),
    [formatStatus, locale, localeFormatters, localeMeta, roleLabel, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{props.children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error("useI18n must be used inside I18nProvider.");
  }

  return value;
}

function readStoredLocale(): Locale {
  const stored = window.localStorage.getItem(storageKey);
  return isKnownLocale(stored, localeOptions) ? stored : defaultLocale;
}

function isMessageKey(key: string): key is MessageKey {
  return hasMessageKey(messages[defaultLocale], key);
}
