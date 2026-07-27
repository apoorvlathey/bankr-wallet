import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <meta name="theme-color" content="#09090B" />
      <meta name="application-name" content="WalletChan Docs" />
      <meta name="author" content="WalletChan" />
      <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
      <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
      {children}
    </>
  );
}
