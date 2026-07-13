# Manifest exposure tests

`exposure.test.ts` freezes the Chrome manifest's web-accessible resource set:
the provider bundle and exact ENS HTML entrypoints are exposed, while the ENS
page scripts remain extension-internal.

WalletConnect's bundle-specific CSP shim is audited in `../walletConnect/`.
