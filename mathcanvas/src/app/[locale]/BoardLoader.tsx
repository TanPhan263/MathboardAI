"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

function Opening() {
  const t = useTranslations("app");
  return (
    <div className="grid h-dvh place-items-center bg-paper text-muted" role="status">
      {t("loading")}
    </div>
  );
}

// The board is browser-only (canvas, local storage), so it is never
// server-rendered and its code stays out of the landing page bundle.
const Workspace = dynamic(() => import("@/components/board/Workspace"), {
  ssr: false,
  loading: () => <Opening />,
});

export default function BoardLoader() {
  return <Workspace />;
}
