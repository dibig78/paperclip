import i18n, { type InitOptions, type TOptions } from "i18next";
import { initReactI18next, useTranslation as useReactI18nextTranslation } from "react-i18next";

import { DEFAULT_LOCALE, i18nextResources, supportedLocales } from "./locales";

import { readDisplayLanguage } from "./preference";

let initialLanguage: "en" | "ko" = "ko";
try {
  initialLanguage = readDisplayLanguage(window.localStorage);
} catch { /* Storage may be disabled by browser policy. */ }
if (typeof document !== "undefined") document.documentElement.lang = initialLanguage;

const i18nextOptions: InitOptions = {
  resources: i18nextResources,
  lng: initialLanguage,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: supportedLocales,
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  returnObjects: false,
  initAsync: false,
};

void i18n.use(initReactI18next).init(i18nextOptions).catch((error: unknown) => {
  console.error("Failed to initialize i18next", error);
});

export function t(key: string, options: TOptions = {}) {
  return i18n.t(key, options);
}

export const useTranslation = useReactI18nextTranslation;
export { i18n };
