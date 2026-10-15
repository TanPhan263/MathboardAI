import { defineRouting } from "next-intl/routing";

/**
 * "/vi" and "/en": one address per language. "/" sends visitors to the language
 * they chose before, else their browser's, else Vietnamese (the students we build for).
 */
export const routing = defineRouting({
  locales: ["vi", "en"],
  defaultLocale: "vi",
  localePrefix: "always",
});

export type Locale = (typeof routing.locales)[number];
