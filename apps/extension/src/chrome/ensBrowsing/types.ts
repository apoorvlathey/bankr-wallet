// Shared types for the ENS Browsing subsystem. Ported from dapp3's
// `src/lib/messaging.ts`. The shape is kept compatible so an upgrade path to
// Helios-verified resolution (see TODO(helios) markers in resolver.ts) does
// not require touching downstream code.

export type ResolveKind = "ipfs" | "ipns" | "web3";

// Tagged error codes the SW routes on. Plain string errors stay as-is for the
// generic error page; `code` is set only when the SW needs to take a specific
// branch (e.g. bouncing to the Kubo setup screen instead of the error page).
export type ResolveErrorCode = "kubo-cors-blocked" | "no-mainnet-rpc";

export type ResolveResponse =
  | {
      ok: true;
      kind: ResolveKind;
      value: string;
      ensName: string;
      // `true` when the resolution bypassed verified-state checks. Always true
      // in this iteration (Helios is deferred); the field is kept so the
      // banner / error surfaces can warn the user once Helios lands.
      trustedDirectly: boolean;
      contractAddress?: `0x${string}`;
    }
  | {
      ok: false;
      error: string;
      code?: ResolveErrorCode;
    };

export type TabContext = {
  ensName: string;
  kind: ResolveKind;
  value: string;
  path: string;
  trustedDirectly: boolean;
  contractAddress?: `0x${string}`;
  fromCache?: boolean;
};

export type ContentUpdatedMessage = {
  type: "ens-content-updated";
  ensName: string;
  kind: ResolveKind;
  value: string;
  gatewayUrl: string;
};

// What the SW returns from `get-theme-tokens` so the banner content script
// can paint in the user's selected theme. Content scripts can't load Chakra
// so we hand them a flat color set.
export type BannerThemeTokens = {
  themeId: "bauhaus" | "midnight";
  bg: string;
  fg: string;
  fgMuted: string;
  border: string;
  shadow: string;
  accent: string;
};
