// Supported chains are defined in ../chains.ts (single source of truth).
// Dune Sim takes raw chainIds via the `chain_ids` query param — no local map.
import {
  PortfolioProvider,
  PortfolioToken,
  ProviderResult,
  formatBalance,
  normalizeContractAddress,
  rawToDecimal,
} from "./types";

interface SimBalance {
  chain: string;
  chain_id: number;
  address: string;
  amount: string;
  symbol?: string;
  name?: string;
  decimals: number;
  price_usd?: number;
  value_usd?: number;
  low_liquidity?: boolean;
  token_metadata?: { logo?: string; url?: string };
}

interface SimBalancesResponse {
  wallet_address: string;
  balances: SimBalance[];
  next_offset?: string | null;
}

export const duneSimProvider: PortfolioProvider = {
  name: "dune-sim",

  isConfigured() {
    return !!process.env.SIM_API_KEY;
  },

  async fetch(address, chainIds): Promise<ProviderResult> {
    const apiKey = process.env.SIM_API_KEY!;
    const params = new URLSearchParams({
      chain_ids: chainIds.join(","),
      metadata: "logo",
      limit: "1000",
    });

    const res = await fetch(
      `https://api.sim.dune.com/v1/evm/balances/${address}?${params.toString()}`,
      {
        headers: { "X-Sim-Api-Key": apiKey },
        next: { revalidate: 60 },
      }
    );

    if (!res.ok) throw new Error(`Dune Sim ${res.status}`);

    const data = (await res.json()) as SimBalancesResponse;
    const tokens: PortfolioToken[] = [];
    for (const b of data.balances || []) {
      if (!b.symbol && !b.name) continue;
      const decimals = typeof b.decimals === "number" ? b.decimals : 18;
      const balance = rawToDecimal(b.amount || "0", decimals);
      const valueUsd = typeof b.value_usd === "number" ? b.value_usd : 0;
      if (balance === 0 && valueUsd === 0) continue;

      tokens.push({
        symbol: b.symbol || "???",
        name: b.name || b.symbol || "Unknown",
        contractAddress: normalizeContractAddress(b.address),
        chainId: b.chain_id,
        decimals,
        balance: balance.toString(),
        balanceFormatted: formatBalance(balance),
        priceUsd: typeof b.price_usd === "number" ? b.price_usd : 0,
        valueUsd,
        logoUrl: b.token_metadata?.logo || undefined,
      });
    }
    return { tokens, defiPositions: [] };
  },
};
