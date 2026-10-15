import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { Inter, Patrick_Hand, Source_Sans_3 } from "next/font/google";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import "katex/dist/katex.min.css";
import "../globals.css";

// "vietnamese" subsets so ă, ơ, ư and stacked tone marks render in the same face.
const display = Inter({ variable: "--font-display", subsets: ["latin", "vietnamese"], weight: ["600", "700", "800"] });
const body = Source_Sans_3({ variable: "--font-body", subsets: ["latin", "vietnamese"] });
// Handwriting face for text notes on the board: chalk lettering, with Vietnamese tone marks.
const hand = Patrick_Hand({ variable: "--font-hand", subsets: ["latin", "vietnamese"], weight: "400" });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });
  return {
    title: t("title"),
    description: t("description"),
    // Each language at its own address, so search engines show the right one.
    alternates: { canonical: `/${locale}`, languages: { vi: "/vi", en: "/en", "x-default": "/" } },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#1a1d1c",
};

/**
 * Apply the saved board before first paint so there's no black→white flash.
 * The blackboard needs no attribute (a saved "dark", the older theme, is the blackboard too).
 * Kept tiny and inline on purpose; it must run before React hydrates.
 */
const THEME_SCRIPT = `try{var t=localStorage.getItem("mathcanvas:theme:v1");if(t==="light"||t==="green")document.documentElement.dataset.theme=t}catch(e){}`;

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <html
      lang={locale}
      className={`${display.variable} ${body.variable} ${hand.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
