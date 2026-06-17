import type { Metadata } from "next";
import RedirectClient from "./RedirectClient";

export const metadata: Metadata = {
  title: "Redirecting | WalletChan",
  robots: { index: false, follow: false },
};

export default async function RedirectPage({
  searchParams,
}: {
  searchParams: Promise<{
    __wc_prefix?: string | string[];
    __wc_path?: string | string[];
  }>;
}) {
  const params = await searchParams;
  return <RedirectClient prefix={params.__wc_prefix} path={params.__wc_path} />;
}
