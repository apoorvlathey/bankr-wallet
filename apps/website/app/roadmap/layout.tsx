import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Roadmap | WalletChan",
  description:
    "See what we're building and what's next for WalletChan — the AI-powered browser wallet.",
  openGraph: {
    title: "Roadmap | WalletChan",
    description:
      "See what we're building and what's next for WalletChan — the AI-powered browser wallet.",
    url: "https://walletchan.com/roadmap",
    siteName: "WalletChan",
    type: "website",
    images: [
      {
        url: "https://walletchan.com/api/og/roadmap",
        width: 1200,
        height: 630,
        alt: "WalletChan Roadmap",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@walletchan_",
    title: "Roadmap | WalletChan",
    description:
      "See what we're building and what's next for WalletChan — the AI-powered browser wallet.",
    images: ["https://walletchan.com/api/og/roadmap"],
  },
};

export default function RoadmapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
