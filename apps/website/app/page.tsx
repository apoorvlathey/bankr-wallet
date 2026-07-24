import type { Metadata } from "next";
import HomeV2Content from "./home-v2/HomeV2Content";

export const metadata: Metadata = {
  title: "WalletChan - Sign Smarter. Move Faster.",
  description:
    "A self-custody browser wallet with smart-account batching, decoded signing, asset previews, swap and bridge, ENS/IPFS browsing, and optional Bankr accounts.",
  openGraph: {
    title: "WalletChan - Sign Smarter. Move Faster.",
    description:
      "Bundle approvals, preview asset changes, decode calldata, and browse the onchain web from one browser wallet.",
    url: "https://walletchan.com",
    siteName: "WalletChan",
    type: "website",
    images: [
      {
        url: "https://walletchan.com/og/home-og.png",
        width: 1200,
        height: 630,
        alt: "WalletChan",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "WalletChan - Sign Smarter. Move Faster.",
    description:
      "A self-custody browser wallet with smart-account batching, decoded signing, swap and bridge, ENS/IPFS browsing, and optional Bankr accounts.",
    images: ["https://walletchan.com/og/home-og.png"],
  },
};

export default function HomePage() {
  return <HomeV2Content />;
}
