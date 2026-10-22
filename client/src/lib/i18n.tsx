import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { zh } from "@/lib/i18n-zh";

export type Locale = "en" | "zh";

const LOCALE_STORAGE_KEY = "fisczim-locale";

type Translate = (
  key: string,
  params?: Record<string, string | number>,
) => string;

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: Translate;
}

const I18nContext = createContext<I18nContextValue | null>(null);

let currentLocale: Locale = "en";

// Reads the current locale outside of the React tree. Needed for code that
// renders in a separate reconciler (e.g. @react-pdf/renderer documents),
// which cannot access LanguageProvider context.
export function getLocale(): Locale {
  return currentLocale;
}

const zhLookup = new Map<string, string>(
  Object.entries(zh).map(([k, v]) => [k, v]),
);

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window === "undefined") return "en";
    const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    const initial: Locale = stored === "zh" ? "zh" : "en";
    currentLocale = initial;
    return initial;
  });

  useEffect(() => {
    currentLocale = locale;
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    currentLocale = next;
    setLocaleState(next);
  }, []);

  const t = useCallback<Translate>(
    (key, params) => {
      if (locale === "zh") {
        const translated = zhLookup.get(key);
        if (translated !== undefined) return interpolate(translated, params);
      }
      return interpolate(key, params);
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within LanguageProvider");
  return ctx;
}