/**
 * Resolves the integrator fee BPS based on the taker's sWCHAN staking balance.
 *
 * Premium users (>= 20M sWCHAN) pay 0.3%; everyone else pays 0.8%.
 */
import { WCHAN_VAULT_INDEXER_API_URL } from "../../constants";

const DEFAULT_FEE_BPS = "80"; // 0.8%
const PREMIUM_FEE_BPS = "30"; // 0.3%

/** 20 million sWCHAN (18 decimals) */
const PREMIUM_THRESHOLD = 20_000_000n * 10n ** 18n;

/**
 * Returns the fee BPS string for a given taker address.
 * Falls back to the default fee on any error so swaps are never blocked.
 */
export async function resolveFeeBps(
  taker: string | undefined,
): Promise<string> {
  if (!taker) return DEFAULT_FEE_BPS;

  try {
    const res = await fetch(
      `${WCHAN_VAULT_INDEXER_API_URL}/balances/${taker.toLowerCase()}`,
      { next: { revalidate: 60 }, signal: AbortSignal.timeout(5_000) },
    );

    if (!res.ok) return DEFAULT_FEE_BPS;

    const data = await res.json();
    const balance = BigInt(data.shares);

    return balance >= PREMIUM_THRESHOLD ? PREMIUM_FEE_BPS : DEFAULT_FEE_BPS;
  } catch {
    return DEFAULT_FEE_BPS;
  }
}
