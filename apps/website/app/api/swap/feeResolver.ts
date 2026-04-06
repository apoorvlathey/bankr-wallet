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

export interface FeeResult {
  feeBps: string;
  isPremiumFee: boolean;
}

/**
 * Returns the fee BPS and premium status for a given taker address.
 * Falls back to the default fee on any error so swaps are never blocked.
 */
export async function resolveFeeBps(
  taker: string | undefined,
): Promise<FeeResult> {
  if (!taker) return { feeBps: DEFAULT_FEE_BPS, isPremiumFee: false };

  try {
    const res = await fetch(
      `${WCHAN_VAULT_INDEXER_API_URL}/balances/${taker.toLowerCase()}`,
      { next: { revalidate: 60 }, signal: AbortSignal.timeout(5_000) },
    );

    if (!res.ok) return { feeBps: DEFAULT_FEE_BPS, isPremiumFee: false };

    const data = await res.json();
    const balance = BigInt(data.shares);
    const isPremium = balance >= PREMIUM_THRESHOLD;

    return {
      feeBps: isPremium ? PREMIUM_FEE_BPS : DEFAULT_FEE_BPS,
      isPremiumFee: isPremium,
    };
  } catch {
    return { feeBps: DEFAULT_FEE_BPS, isPremiumFee: false };
  }
}
