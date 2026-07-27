import type { Metadata } from "next";
import HomeV2Content from "./home-v2/HomeV2Content";

export const metadata: Metadata = {
  title: "WalletChan - EVM Wallet for Web3 | Sign Smarter. Move Faster.",
  description:
    "WalletChan is a self-custodial Ethereum and EVM browser wallet. Connect to Web3 dapps, swap and bridge, and understand each signature before you approve.",
  openGraph: {
    title: "WalletChan - EVM Wallet for Web3 | Sign Smarter. Move Faster.",
    description:
      "WalletChan is a self-custodial Ethereum and EVM browser wallet. Connect to Web3 dapps, swap and bridge, and understand each signature before you approve.",
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
    title: "WalletChan - EVM Wallet for Web3 | Sign Smarter. Move Faster.",
    description:
      "WalletChan is a self-custodial Ethereum and EVM browser wallet. Connect to Web3 dapps, swap and bridge, and understand each signature before you approve.",
    images: ["https://walletchan.com/og/home-og.png"],
  },
};

export default function HomePage() {
  return <HomeV2Content />;
}
