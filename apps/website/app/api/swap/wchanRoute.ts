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

// Gas budget for the encoded Universal Router tx. We can't trust the V4
// quoter's `gasEstimate` alone — it only reports the gas inside
// `PoolManager.swap` and misses UR routing, WRAP_ETH/SWEEP, hook callbacks,
// and (for via-bnkrw) the BNKRW↔WCHAN wrap call entirely. Underestimating
// here causes on-chain OOG (the wrap call ran with only the leftover
// gas after the first swap consumed most of it).
//
// `estimateTxGas` does a real `eth_estimateGas` against the encoded tx,
// using a state override so the call works even if the taker doesn't have
// enough native balance to cover the swap value. Any failure or RPC hiccup
// falls back to a conservative hardcoded value.
// All gas values are well within Number's safe integer range (< 2^53), so
// we use plain numbers here. We tried with BigInt math originally but
// Vercel's @vercel/nft static analyzer chokes on BigInt binary expressions
// during file tracing — fails the production build with "Cannot mix BigInt
// and other types". Numbers sidestep that entirely.
const FALLBACK_GAS_DIRECT = 700_000;
const FALLBACK_GAS_VIA_BNKRW = 1_200_000;
const ESTIMATE_GAS_TIMEOUT = 5_000;
// 100 ETH override balance, generous for any quote we'd ever route.
const STATE_OVERRIDE_BALANCE = "0x56bc75e2d63100000";

// RPCs to try in order for gas estimation. We try the configured one first,
// then llamarpc as a public fallback. Some Base providers (mainnet.base.org,
// some Alchemy tiers) ignore or reject state overrides on eth_estimateGas,
// which would push us to the hardcoded fallback even when llamarpc could
// have given us a real estimate.
const ESTIMATE_RPC_URLS = Array.from(
  new Set([BASE_RPC_URL, "https://base.llamarpc.com"]),
);

// Captured during estimateTxGas so we can surface what actually went wrong
// in the API response (Vercel logs are hard to grab; this is a temporary
// debug aid until we know why eth_estimateGas keeps hitting fallback).
const estimateTrace: string[] = [];

async function tryEstimateOnce(
  rpcUrl: string,
  opts: { taker: string; to: string; data: string; valueHex: string },
  withOverride: boolean,
): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ESTIMATE_GAS_TIMEOUT);
  const tag = `${new URL(rpcUrl).host} ov=${withOverride}`;
  try {
    const params: unknown[] = [
      {
        from: opts.taker,
        to: opts.to,
        data: opts.data,
        value: opts.valueHex,
      },
      "latest",
    ];
    if (withOverride) {
      params.push({ [opts.taker]: { balance: STATE_OVERRIDE_BALANCE } });
    }
    const res = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_estimateGas",
        params,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      estimateTrace.push(`${tag}: HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    if (json.error || !json.result) {
      const msg = json.error?.message || "no result";
      estimateTrace.push(`${tag}: ${String(msg).slice(0, 120)}`);
      return null;
    }
    estimateTrace.push(`${tag}: ok=${parseInt(json.result, 16)}`);
    return parseInt(json.result as string, 16);
  } catch (err) {
    estimateTrace.push(
      `${tag}: threw ${(err as Error).name}: ${String((err as Error).message).slice(0, 120)}`,
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function estimateTxGas(opts: {
  taker: string;
  to: string;
  data: string;
  valueHex: string;
  route: "direct" | "via-bnkrw";
}): Promise<number> {
  const fallback =
    opts.route === "via-bnkrw" ? FALLBACK_GAS_VIA_BNKRW : FALLBACK_GAS_DIRECT;

  // Reset per-call so we don't accumulate across requests in a warm worker.
  estimateTrace.length = 0;

  // Try each RPC, both with and without state override, until one returns
  // a usable result. With-override goes first since the API is often hit by
  // takers that don't have enough native balance to cover the simulation.
  let raw: number | null = null;
  outer: for (const rpcUrl of ESTIMATE_RPC_URLS) {
    for (const withOverride of [true, false]) {
      raw = await tryEstimateOnce(rpcUrl, opts, withOverride);
      if (raw !== null) break outer;
    }
  }

  if (raw === null) return fallback;
  const buffered = Math.ceil(raw * 1.5);
  return buffered < fallback ? fallback : buffered;
}

export function getLastEstimateTrace(): string[] {
  return estimateTrace.slice();
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

export async function formatWchanResponse(opts: FormatOptions) {
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

  // Encode the tx up front so we can run a real `eth_estimateGas` against it.
  // Without this, gas accounting is a heuristic over the V4 quoter's partial
  // gasEstimate, which misses the second hop on via-bnkrw and OOGs on-chain.
  let tx: { to: `0x${string}`; data: `0x${string}`; value: bigint } | null = null;
  // For gas estimation only, we re-encode with minAmountOut=0 so pool drift
  // between the quote and the simulation doesn't trip the slippage check
  // and revert eth_estimateGas (which would force us back to the fallback).
  // The on-the-wire tx still uses the user's slippage.
  let estimateTx: { to: `0x${string}`; data: `0x${string}`; value: bigint } | null = null;
  if (includeTransaction && taker) {
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 30 * 60); // 30 min

    const encode = (minOut: bigint) => {
      if (quote.direction === "buy") {
        return quote.route === "via-bnkrw"
          ? encodeBuyWchanViaBnkrw(BASE_CHAIN_ID, quote.amountIn, minOut, deadline)
          : encodeBuyWchan(BASE_CHAIN_ID, quote.amountIn, minOut, deadline);
      }
      return quote.route === "via-bnkrw"
        ? encodeSellWchanViaBnkrw(BASE_CHAIN_ID, quote.amountIn, minOut, deadline)
        : encodeSellWchan(BASE_CHAIN_ID, quote.amountIn, minOut, deadline);
    };

    tx = encode(minBuyAmount);
    estimateTx = encode(0n);
  }

  const fallback =
    quote.route === "via-bnkrw" ? FALLBACK_GAS_VIA_BNKRW : FALLBACK_GAS_DIRECT;
  const gasNum =
    estimateTx && taker
      ? await estimateTxGas({
          taker,
          to: estimateTx.to,
          data: estimateTx.data,
          valueHex: `0x${estimateTx.value.toString(16)}`,
          route: quote.route,
        })
      : fallback;
  const gas = gasNum.toString();

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
    // TEMP: surface RPC failure reasons so we can see why eth_estimateGas
    // keeps falling back to the conservative gas value in production.
    // Remove once the underlying issue is identified and fixed.
    _estimateTrace: getLastEstimateTrace(),
  };

  if (tx) {
    response.transaction = {
      to: tx.to,
      data: tx.data,
      value: tx.value.toString(),
      gas,
    };
  }

  return response;
}

/**
 * Compare parsed 0x response against custom WCHAN quote.
 * Returns the formatted response for whichever is better.
 */
export async function compareBestRoute(
  zeroXData: Record<string, unknown> | null,
  zeroXOk: boolean,
  wchanQuote: WchanQuote | null,
  sellToken: string,
  buyToken: string,
  sellAmount: string,
  slippageBps: number,
  taker?: string,
  includeTransaction?: boolean,
): Promise<{ data: Record<string, unknown>; source: string } | null> {
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
    const formatted = await formatWchanResponse({
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
    const formatted = await formatWchanResponse({
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
