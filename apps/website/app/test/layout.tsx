import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Test Dapp | WalletChan",
  description:
    "Manual QA harness for WalletChan. Exercise every JSON-RPC method and confirmation screen.",
  robots: { index: false, follow: false },
};

export default function TestLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
