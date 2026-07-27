import type { Metadata } from "next";
import { Providers } from "./providers";
import { Analytics } from "./components/Analytics";
import "./globals.css";

export const metadata: Metadata = {
  title: "WalletChan - EVM Wallet for Web3 | Sign Smarter. Move Faster.",
  description:
    "WalletChan is a self-custodial Ethereum and EVM browser wallet. Connect to Web3 dapps, swap and bridge, and understand each signature before you approve.",
  icons: {
    icon: "/images/walletchan-icon.png",
    apple: "/images/walletchan-icon.png",
  },
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
        alt: "WalletChan - EVM wallet for Web3",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@walletchan_",
    title: "WalletChan - EVM Wallet for Web3 | Sign Smarter. Move Faster.",
    description:
      "WalletChan is a self-custodial Ethereum and EVM browser wallet. Connect to Web3 dapps, swap and bridge, and understand each signature before you approve.",
    images: ["https://walletchan.com/og/home-og.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Analytics />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
