import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "WalletChan OS — Web3 Operating System",
  description:
    "Browse and use your favorite dapps in a desktop OS experience. Swap, stake, and explore — all from one place.",
  openGraph: {
    title: "WalletChan OS — Web3 Operating System",
    description:
      "Browse and use your favorite dapps in a desktop OS experience. Swap, stake, and explore — all from one place.",
    url: "https://os.walletchan.com",
    siteName: "WalletChan",
    type: "website",
    images: [
      {
        url: "https://os.walletchan.com/api/og/os",
        width: 1200,
        height: 630,
        alt: "WalletChan OS — Web3 Operating System",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@walletchan_",
    title: "WalletChan OS — Web3 Operating System",
    description:
      "Browse and use your favorite dapps in a desktop OS experience. Swap, stake, and explore — all from one place.",
    images: ["https://os.walletchan.com/api/og/os"],
  },
};

export default function OsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
