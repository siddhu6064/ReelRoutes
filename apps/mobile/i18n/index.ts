/**
 * i18n setup for Expo React Native — W17 multilingual support
 *
 * Install deps (run once):
 *   pnpm --filter mobile add i18next react-i18next
 *   pnpm --filter mobile add expo-localization
 *
 * Usage:
 *   import { useTranslation } from "react-i18next";
 *   const { t } = useTranslation();
 *   t("trip.markVisited")
 */
import * as Localization from "expo-localization";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en.json";
import es from "./es.json";
import ja from "./ja.json";
import ko from "./ko.json";
import pt from "./pt.json";

export const SUPPORTED_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "pt", label: "Português" },
] as const;

// Detect device locale and map to supported language
function detectLanguage(): string {
  const locales = Localization.getLocales();
  const deviceLang = locales[0]?.languageCode ?? "en";
  const supported = ["en", "es", "ja", "ko", "pt"];
  return supported.includes(deviceLang) ? deviceLang : "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
    ja: { translation: ja },
    ko: { translation: ko },
    pt: { translation: pt },
  },
  lng: detectLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
