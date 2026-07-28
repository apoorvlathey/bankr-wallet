import type { Metadata } from "next";

import { DiscordRedirect } from "./DiscordRedirect";

const title = "WalletChan Discord";
const description =
  "Join the WalletChan community for product updates, support, feedback, and onchain conversation.";
const canonicalUrl = "https://walletchan.com/discord";
const imageUrl = "https://walletchan.com/og/discord-og.png";

export const metadata: Metadata = {
  title,
  description,
  alternates: {
    canonical: canonicalUrl,
  },
  robots: {
    index: false,
    follow: true,
  },
  openGraph: {
    title,
    description,
    url: canonicalUrl,
    siteName: "WalletChan",
    type: "website",
    images: [
      {
        url: imageUrl,
        width: 1280,
        height: 640,
        alt: "Discord and WalletChan",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@WalletChan_",
    title,
    description,
    images: [imageUrl],
  },
};

export default function DiscordPage() {
  return <DiscordRedirect />;
}
