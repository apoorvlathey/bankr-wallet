export type ResolveKind = "ipfs" | "ipns" | "web3";

export interface BannerTabContext {
  ensName: string;
  kind: ResolveKind;
  value: string;
  path: string;
  trustedDirectly: boolean;
  contractAddress?: `0x${string}`;
  fromCache?: boolean;
}

export interface BannerTheme {
  themeId: "bauhaus" | "midnight";
  isDark: boolean;
  bg: string;
  fg: string;
  fgMuted: string;
  border: string;
  shadow: string;
  accent: string;
}

export interface AddressField {
  setValue(text: string): void;
  getValue(): string;
  selectAll(): void;
  shake(): void;
}

export interface BannerRefs {
  host: HTMLDivElement;
  shadow: ShadowRoot;
  bar: HTMLDivElement;
  urlInput: HTMLDivElement;
  brandImg: HTMLImageElement;
  right: HTMLSpanElement;
  starBtn: HTMLButtonElement;
  historyLink: HTMLAnchorElement;
  menuBtn: HTMLButtonElement;
  menu: HTMLDivElement;
  copyItem: HTMLButtonElement;
  openGatewayItem: HTMLButtonElement;
  copyToast: HTMLSpanElement;
}
