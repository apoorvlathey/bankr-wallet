import type { ChainEntry } from "@/constants/chainRegistry";
import type { BungeeChain } from "@walletchan/shared/bungee";

export interface EnrichedBridgeChain extends BungeeChain {
  /** Curated registry entry when the resolved chain exists in WalletChan's registry. */
  registry?: ChainEntry;
}
