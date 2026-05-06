/**
 * WCHAN custom routing — compares Uniswap V4 direct/via-BNKRW routes
 * against the 0x quote and returns whichever gives better output.
 *
 * Only applies to ETH <> WCHAN swaps on Base (chainId 8453).
 */
import {
  getBestQuote,
  getAddresses,
  applySlippage,
  encodeBuyWchan,
  encodeBuyWchanViaBnkrw,
  encodeSellWchan,
  encodeSellWchanViaBnkrw,
  type WchanQuote,
  type SwapDirection,
} from "@walletchan/wchan-swap";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_CHAIN_ID = 8453;
const WCHAN_ADDRESS = "0xBa5ED0000e1CA9136a695f0a848012A16008B032";
const NATIVE_TOKEN = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
const BASE_RPC_URL =
  process.env.NEXT_PUBLIC_BASE_RPC_URL || "https://base.llamarpc.com";
const DEFAULT_SLIPPAGE_BPS = 100; // 1%
const QUOTE_TIMEOUT = 8_000;

// Gas accounting for the encoded Universal Router tx. The V4 quoter only
// reports the gas inside `PoolManager.swap` — UR routing, WRAP/SWEEP, hook
// callbacks, and (for via-bnkrw) the BNKRW↔WCHAN wrap call all live outside
// it. We add a fixed per-route overhead, then a 1.5x safety multiplier so
// users don't OOG. (On Base unused gas is refunded — overestimating is safe.)
const UR_OVERHEAD_DIRECT = 120_000n;   // WRAP_ETH + V4_SWAP wrapper + SWEEP
const UR_OVERHEAD_VIA_BNKRW = 200_000n; // + BNKRW↔WCHAN wrap call
const GAS_BUFFER_NUM = 3n;
const GAS_BUFFER_DEN = 2n; // 1.5x
const FALLBACK_GAS_DIRECT = 500_000n;
const FALLBACK_GAS_VIA_BNKRW = 700_000n;

function estimateTxGas(quote: { gasEstimate: bigint; route: "direct" | "via-bnkrw" }): bigint {
  const overhead =
    quote.route === "via-bnkrw" ? UR_OVERHEAD_VIA_BNKRW : UR_OVERHEAD_DIRECT;
  const fallback =
    quote.route === "via-bnkrw" ? FALLBACK_GAS_VIA_BNKRW : FALLBACK_GAS_DIRECT;
  // If the quoter returned 0 (unlikely, but guard anyway), fall back to a
  // safe constant rather than just shipping the overhead.
  if (quote.gasEstimate === 0n) return fallback;
  const withOverhead = quote.gasEstimate + overhead;
  const buffered = (withOverhead * GAS_BUFFER_NUM) / GAS_BUFFER_DEN;
  return buffered < fallback ? fallback : buffered;
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function isEthToken(address: string): boolean {
  const lower = address.toLowerCase();
  return (
    lower === NATIVE_TOKEN.toLowerCase() ||
    lower === "0x0000000000000000000000000000000000000000"
  );
}

function isWchanToken(address: string): boolean {
  return address.toLowerCase() === WCHAN_ADDRESS.toLowerCase();
}

export function detectWchanSwap(
  chainId: string,
  sellToken: string,
  buyToken: string,
): { isWchan: boolean; direction: SwapDirection } {
  if (chainId !== String(BASE_CHAIN_ID)) {
    return { isWchan: false, direction: "buy" };
  }

  // ETH → WCHAN (buy)
  if (isEthToken(sellToken) && isWchanToken(buyToken)) {
    return { isWchan: true, direction: "buy" };
  }
  // WCHAN → ETH (sell)
  if (isWchanToken(sellToken) && isEthToken(buyToken)) {
    return { isWchan: true, direction: "sell" };
  }

  return { isWchan: false, direction: "buy" };
}

// ---------------------------------------------------------------------------
// Custom quote fetcher (with timeout)
// ---------------------------------------------------------------------------

export async function fetchWchanQuote(
  direction: SwapDirection,
  sellAmount: string,
): Promise<WchanQuote> {
  // Race against a timeout since getBestQuote makes RPC calls
  const quotePromise = getBestQuote(
    BASE_RPC_URL,
    BASE_CHAIN_ID,
    direction,
    BigInt(sellAmount),
  );
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("WCHAN quote timeout")), QUOTE_TIMEOUT),
  );

  return Promise.race([quotePromise, timeoutPromise]);
}

// ---------------------------------------------------------------------------
// Response formatting — matches 0x SwapQuoteResponse shape
// ---------------------------------------------------------------------------

interface FormatOptions {
  quote: WchanQuote;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  slippageBps: number;
  taker?: string;
  includeTransaction?: boolean;
}

export function formatWchanResponse(opts: FormatOptions) {
  const {
    quote,
    sellToken,
    buyToken,
    sellAmount,
    slippageBps,
    taker,
    includeTransaction,
  } = opts;

  const minBuyAmount = applySlippage(quote.amountOut, slippageBps);
  const addrs = getAddresses(BASE_CHAIN_ID);
  const gas = estimateTxGas(quote).toString();

  // Build response matching 0x shape
  const response: Record<string, unknown> = {
    buyAmount: quote.amountOut.toString(),
    sellAmount: quote.amountIn.toString(),
    buyToken,
    sellToken,
    gas,
    totalNetworkFee: "0",
    liquidityAvailable: true,
    minBuyAmount: minBuyAmount.toString(),
    allowanceTarget:
      quote.direction === "sell" ? addrs.permit2 : "",
    issues: {
      ...(quote.direction === "sell"
        ? {
            allowance: {
              spender: addrs.permit2,
              actual: "0",
              expected: sellAmount,
            },
            permit2Approval: {
              token: addrs.wchan,
              spender: addrs.universalRouter,
            },
          }
        : {}),
    },
    fees: {},
    route: {
      fills:
        quote.route === "via-bnkrw"
          ? [
              {
                from: sellToken,
                to: addrs.oldToken,
                source: "Uniswap_V4",
                proportionBps: "10000",
              },
              {
                from: addrs.oldToken,
                to: buyToken,
                source: "Uniswap_V4_Wrap",
                proportionBps: "10000",
              },
            ]
          : [
              {
                from: sellToken,
                to: buyToken,
                source: "Uniswap_V4",
                proportionBps: "10000",
              },
            ],
    },
    routeSource: "wchan-v4",
    wchanRoute: quote.route,
  };

  // Encode transaction data for quote endpoint
  if (includeTransaction && taker) {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60); // 30 min

    let tx: { to: `0x${string}`; data: `0x${string}`; value: bigint };

    if (quote.direction === "buy") {
      tx =
        quote.route === "via-bnkrw"
          ? encodeBuyWchanViaBnkrw(
              BASE_CHAIN_ID,
              quote.amountIn,
              minBuyAmount,
              deadline,
            )
          : encodeBuyWchan(
              BASE_CHAIN_ID,
              quote.amountIn,
              minBuyAmount,
              deadline,
            );
    } else {
      tx =
        quote.route === "via-bnkrw"
          ? encodeSellWchanViaBnkrw(
              BASE_CHAIN_ID,
              quote.amountIn,
              minBuyAmount,
              deadline,
            )
          : encodeSellWchan(
              BASE_CHAIN_ID,
              quote.amountIn,
              minBuyAmount,
              deadline,
            );
    }

    response.transaction = {
      to: tx.to,
      data: tx.data,
      value: tx.value.toString(),
      gas: response.gas,
    };
  }

  return response;
}

/**
 * Compare parsed 0x response against custom WCHAN quote.
 * Returns the formatted response for whichever is better.
 */
export function compareBestRoute(
  zeroXData: Record<string, unknown> | null,
  zeroXOk: boolean,
  wchanQuote: WchanQuote | null,
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  slippageBps: number,
  taker?: string,
  includeTransaction?: boolean,
): { data: Record<string, unknown>; source: string } | null {
  const zeroXBuyAmount =
    zeroXOk && zeroXData?.buyAmount
      ? BigInt(zeroXData.buyAmount as string)
      : 0n;

  const wchanBuyAmount = wchanQuote?.amountOut ?? 0n;

  console.log("[wchanRoute] Quote comparison:", {
    "0x": zeroXOk ? zeroXBuyAmount.toString() : "failed",
    wchan: wchanQuote ? wchanBuyAmount.toString() : "failed",
    wchanRoute: wchanQuote?.route ?? "n/a",
  });

  // Both failed
  if (!zeroXOk && !wchanQuote) return null;

  // Only 0x succeeded
  if (zeroXOk && !wchanQuote) {
    return { data: zeroXData!, source: "0x" };
  }

  // Only WCHAN succeeded
  if (!zeroXOk && wchanQuote) {
    const formatted = formatWchanResponse({
      quote: wchanQuote,
      sellToken,
      buyToken,
      sellAmount,
      slippageBps,
      taker,
      includeTransaction,
    });
    return { data: formatted, source: "wchan-v4" };
  }

  // Both succeeded — pick higher buyAmount
  if (wchanBuyAmount > zeroXBuyAmount) {
    console.log(
      `[wchanRoute] WCHAN route wins: ${wchanBuyAmount} > ${zeroXBuyAmount} (${wchanQuote!.route})`,
    );
    const formatted = formatWchanResponse({
      quote: wchanQuote!,
      sellToken,
      buyToken,
      sellAmount,
      slippageBps,
      taker,
      includeTransaction,
    });
    return { data: formatted, source: "wchan-v4" };
  }

  console.log(
    `[wchanRoute] 0x route wins: ${zeroXBuyAmount} >= ${wchanBuyAmount}`,
  );
  return { data: zeroXData!, source: "0x" };
}
