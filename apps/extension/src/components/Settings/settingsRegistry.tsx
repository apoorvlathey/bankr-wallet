import { Badge } from "@chakra-ui/react";
import { SettingsRow } from "./SettingsRow";
import {
  PaletteIcon,
  LockIcon,
  AgentIcon,
  ClockIcon,
  LinkChainIcon,
  TrashIcon,
  ResetIcon,
  ChatBubbleIcon,
  ShieldIcon,
  GlobeIcon,
} from "./icons";

export type LeafId =
  | "appearance"
  | "changePassword"
  | "agentPassword"
  | "autoLock"
  | "chains"
  | "ensBrowsing"
  | "clearSigning"
  | "clearTxHistory"
  | "resetNonce"
  | "clearChatHistory";

export type LeafGroup = "security" | "data" | null;

export interface LeafEntry {
  id: LeafId;
  title: string;
  subtitle: string;
  keywords: string[];
  group: LeafGroup;
}

export const LEAF_ENTRIES: readonly LeafEntry[] = [
  {
    id: "appearance",
    title: "Appearance",
    subtitle: "Choose theme and visual style",
    keywords: ["theme", "color", "dark", "light", "bauhaus", "midnight", "style"],
    group: null,
  },
  {
    id: "changePassword",
    title: "Change Password",
    subtitle: "Update your encryption password",
    keywords: ["password", "master", "encryption", "security"],
    group: "security",
  },
  {
    id: "agentPassword",
    title: "Agent Password",
    subtitle: "Allow AI agents to unlock wallet",
    keywords: ["agent", "ai", "password", "unlock", "security"],
    group: "security",
  },
  {
    id: "autoLock",
    title: "Auto-Lock",
    subtitle: "Configure wallet lock timeout",
    keywords: ["auto", "lock", "timeout", "idle", "security"],
    group: "security",
  },
  {
    id: "chains",
    title: "Chain RPCs",
    subtitle: "Configure network RPC endpoints",
    keywords: ["chain", "rpc", "network", "endpoint", "node"],
    group: null,
  },
  {
    id: "ensBrowsing",
    title: "dapp3 - ENS Browsing",
    subtitle: "Visit .eth and .gwei sites directly from the address bar",
    keywords: [
      "dapp3",
      "ens",
      "eth",
      "gwei",
      "gns",
      "ipfs",
      "ipns",
      "browse",
      "domain",
      "name",
      "eth.limo",
      "gwei.domains",
      "w3eth",
    ],
    group: null,
  },
  {
    id: "clearSigning",
    title: "Clear Signing",
    subtitle: "Show human-readable summaries for known contracts",
    keywords: ["clear", "signing", "erc-7730", "descriptor", "privacy", "human", "readable"],
    group: "security",
  },
  {
    id: "clearTxHistory",
    title: "Clear Transaction History",
    subtitle: "Remove all transaction records",
    keywords: ["clear", "transaction", "history", "tx", "data", "remove", "delete"],
    group: "data",
  },
  {
    id: "resetNonce",
    title: "Reset Nonce Cache",
    subtitle: "Fix stuck transactions from nonce conflicts",
    keywords: ["nonce", "reset", "stuck", "cache", "data"],
    group: "data",
  },
  {
    id: "clearChatHistory",
    title: "Clear Chat History",
    subtitle: "Remove all chat conversations",
    keywords: ["clear", "chat", "history", "conversation", "data", "remove", "delete"],
    group: "data",
  },
];

export function filterLeaves(query: string): LeafEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return LEAF_ENTRIES.filter((e) => {
    if (e.title.toLowerCase().includes(q)) return true;
    if (e.subtitle.toLowerCase().includes(q)) return true;
    return e.keywords.some((k) => k.toLowerCase().includes(q));
  });
}

export type NavigableLeafId =
  | "appearance"
  | "changePassword"
  | "agentPassword"
  | "autoLock"
  | "chains"
  | "ensBrowsing"
  | "clearSigning"
  | "clearTxHistory";

export type ActionLeafId = "resetNonce" | "clearChatHistory";

export interface RowContext {
  isDarkTheme: boolean;
  chainStripBg: string;
  chainStripFg: string;
  passwordType: "master" | "agent" | null;
  isAgentPasswordEnabled: boolean;
  onNavigate: (id: NavigableLeafId) => void;
  onAction: (id: ActionLeafId) => void;
}

export function renderLeafRow(id: LeafId, ctx: RowContext) {
  switch (id) {
    case "appearance":
      return (
        <SettingsRow
          key={id}
          title="Appearance"
          subtitle="Choose theme and visual style"
          icon={<PaletteIcon boxSize={5} />}
          iconBg="accent.secondary"
          iconColor="accentFg.secondary"
          cornerAccent="secondary"
          showChevron
          onClick={() => ctx.onNavigate(id)}
        />
      );

    case "changePassword": {
      const disabled = ctx.passwordType === "agent";
      return (
        <SettingsRow
          key={id}
          title="Change Password"
          subtitle={
            disabled
              ? "Unlock with master password to access"
              : "Update your encryption password"
          }
          icon={<LockIcon boxSize={5} />}
          iconBg="accent.highlight"
          iconColor="accentFg.highlight"
          cornerAccent="highlight"
          showChevron={!disabled}
          onClick={() => ctx.onNavigate(id)}
          disabled={disabled}
        />
      );
    }

    case "agentPassword": {
      const on = ctx.isAgentPasswordEnabled;
      const tileBg = on
        ? "accent.secondary"
        : ctx.isDarkTheme
          ? "border.strong"
          : "surface.sunken";
      const tileFg = on
        ? "accentFg.secondary"
        : ctx.isDarkTheme
          ? "fg.primary"
          : "fg.muted";
      return (
        <SettingsRow
          key={id}
          title="Agent Password"
          subtitle="Allow AI agents to unlock wallet"
          icon={<AgentIcon boxSize={5} />}
          iconBg={tileBg}
          iconColor={tileFg}
          cornerAccent="secondary"
          showChevron
          onClick={() => ctx.onNavigate(id)}
          badge={
            <Badge
              bg={tileBg}
              color={tileFg}
              border="2px solid"
              borderColor="border.default"
              fontSize="xs"
              fontWeight="700"
            >
              {on ? "ON" : "OFF"}
            </Badge>
          }
        />
      );
    }

    case "autoLock":
      return (
        <SettingsRow
          key={id}
          title="Auto-Lock"
          subtitle="Configure wallet lock timeout"
          icon={<ClockIcon boxSize={5} />}
          iconBg="accent.highlight"
          iconColor="accentFg.highlight"
          cornerAccent="highlight"
          showChevron
          onClick={() => ctx.onNavigate(id)}
        />
      );

    case "chains":
      // Bauhaus uses the inverted-strip pattern (BLACK chip) which is a signature
      // look. Midnight's surface.sunken read as a dark "hole" against the card,
      // so we lift onto border.strong for a clearly elevated neutral system chip
      // with primary fg on top.
      return (
        <SettingsRow
          key={id}
          title="Chain RPCs"
          subtitle="Configure network RPC endpoints"
          icon={<LinkChainIcon boxSize={5} />}
          iconBg={ctx.isDarkTheme ? "border.strong" : ctx.chainStripBg}
          iconColor={ctx.isDarkTheme ? "fg.primary" : ctx.chainStripFg}
          cornerBg="border.default"
          showChevron
          onClick={() => ctx.onNavigate(id)}
        />
      );

    case "ensBrowsing":
      // Hidden on Firefox (DNR dynamic rules + the interstitial flow are
      // Chrome-only this iteration; see plan + _docs/FIREFOX.md).
      if (typeof navigator !== "undefined" && /Firefox/.test(navigator.userAgent)) {
        return null;
      }
      return (
        <SettingsRow
          key={id}
          title="dapp3 - ENS Browsing"
          subtitle="Visit .eth and .gwei sites directly from the address bar"
          icon={<GlobeIcon boxSize={5} />}
          iconBg="chart.positive"
          iconColor="surface.base"
          cornerAccent="primary"
          showChevron
          onClick={() => ctx.onNavigate(id)}
        />
      );

    case "clearSigning":
      return (
        <SettingsRow
          key={id}
          title="Clear Signing"
          subtitle="Show human-readable summaries for known contracts"
          icon={<ShieldIcon boxSize={5} />}
          iconBg="accent.primary"
          iconColor="accentFg.primary"
          cornerAccent="primary"
          showChevron
          onClick={() => ctx.onNavigate(id)}
        />
      );

    case "clearTxHistory":
      return (
        <SettingsRow
          key={id}
          title="Clear Transaction History"
          subtitle="Choose accounts to clear"
          icon={<TrashIcon boxSize={5} />}
          iconBg="accent.primary"
          iconColor="accentFg.primary"
          cornerAccent="primary"
          showChevron
          onClick={() => ctx.onNavigate(id)}
        />
      );

    case "resetNonce":
      return (
        <SettingsRow
          key={id}
          title="Reset Nonce Cache"
          subtitle="Fix stuck transactions from nonce conflicts"
          icon={<ResetIcon boxSize={5} />}
          iconBg="accent.secondary"
          iconColor="accentFg.secondary"
          cornerAccent="secondary"
          onClick={() => ctx.onAction(id)}
        />
      );

    case "clearChatHistory":
      return (
        <SettingsRow
          key={id}
          title="Clear Chat History"
          subtitle="Remove all chat conversations"
          icon={<ChatBubbleIcon boxSize={5} />}
          iconBg="accent.primary"
          iconColor="accentFg.primary"
          cornerAccent="primary"
          borderRadiusFull
          onClick={() => ctx.onAction(id)}
        />
      );
  }
}
