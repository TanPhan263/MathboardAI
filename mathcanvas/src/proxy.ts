import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

// Picks the language from the URL ("/" Vietnamese, "/en" English), else the browser's.
export default createMiddleware(routing);

export const config = {
  // Not the handwriting API proxy (/api/ink), Next internals, or files.
  matcher: "/((?!api|_next|_vercel|.*\..*).*)",
};
