import type { Metadata } from "next";

import PrivacyPoolsExplorerContent from "./PrivacyPoolsExplorerContent";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Privacy Pools Explorer | WalletChan Admin",
  description: "Internal Privacy Pools Shield compliance verification tool.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
      "max-image-preview": "none",
      "max-snippet": 0,
    },
  },
};

export default function PrivacyPoolsExplorerPage() {
  return <PrivacyPoolsExplorerContent />;
}


