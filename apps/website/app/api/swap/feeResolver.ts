/**
 * Resolves the integrator fee BPS shared by swaps and bridges.
 *
 * Staking tiers are retained behind a disabled flag for future use. While the
 * flag is disabled, resolution is local and never calls the staking indexer.
 */
import { WCHAN_VAULT_INDEXER_API_URL } from "../../constants";

const FLAT_FEE_BPS = "10"; // 0.1%

const STAKING_FEE_TIERS_ENABLED = false;
const DEFAULT_FEE_BPS = "80"; // 0.8% (dormant staking-tier default)
const PREMIUM_FEE_BPS = "30"; // 0.3%

/** 20 million sWCHAN (18 decimals) */
const PREMIUM_THRESHOLD = 20_000_000n * 10n ** 18n;

export interface FeeResult {
  feeBps: string;
  isPremiumFee: boolean;
}

/**
 * Returns the fee BPS and premium status for a given taker address.
 *
 * The active flat-fee path performs no network or onchain lookup. If staking
 * tiers are re-enabled, lookup failures fall back to the tier default so a
 * fee-resolution dependency cannot block swaps or bridges.
 */
export async function resolveFeeBps(
  taker: string | undefined,
): Promise<FeeResult> {
  if (!STAKING_FEE_TIERS_ENABLED) {
    return { feeBps: FLAT_FEE_BPS, isPremiumFee: false };
  }

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
