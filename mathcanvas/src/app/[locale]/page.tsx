import { setRequestLocale } from "next-intl/server";
import BoardLoader from "./BoardLoader";

export default async function Home({ params }: PageProps<"/[locale]">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <BoardLoader />;
}
