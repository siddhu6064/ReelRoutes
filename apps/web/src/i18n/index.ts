/**
 * i18n setup — W17 multilingual support
 * Supports: en (default), es, ja, ko, pt
 *
 * Usage:
 *   import { useTranslation } from "react-i18next";
 *   const { t } = useTranslation();
 *   t("trip.stops")  // → "stops"
 *   t("trip.travelTime", { time: "12 min" })
 *
 * Install deps (run once):
 *   pnpm --filter web add i18next react-i18next i18next-browser-languagedetector
 */
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
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

export type LanguageCode = (typeof SUPPORTED_LANGUAGES)[number]["code"];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      ja: { translation: ja },
      ko: { translation: ko },
      pt: { translation: pt },
    },
    fallbackLng: "en",
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
    },
  });

export default i18n;
