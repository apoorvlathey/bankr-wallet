import { encodeFunctionData, decodeAbiParameters } from "viem";
import { quoterAbi } from "./abis";
import { getAddresses } from "./addresses";
import {
  buildPoolKey,
  buildOldTokenPoolKey,
  isWethCurrency0,
  isWethCurrency0ForOldToken,
} from "./poolKey";
import type { SwapDirection, WchanQuote } from "./types";

const RETURN_TYPES = [
  { type: "uint256" as const, name: "amountOut" as const },
  { type: "uint256" as const, name: "gasEstimate" as const },
] as const;

export async function getQuote(
  rpcUrl: string,
  chainId: number,
  direction: SwapDirection,
  amountIn: bigint
): Promise<WchanQuote> {
  const { quoter } = getAddresses(chainId);
  const poolKey = buildPoolKey(chainId);

  const wethIs0 = isWethCurrency0(chainId);
  const zeroForOne = direction === "buy" ? wethIs0 : !wethIs0;

  const calldata = encodeFunctionData({
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        poolKey: {
          currency0: poolKey.currency0,
          currency1: poolKey.currency1,
          fee: poolKey.fee,
          tickSpacing: poolKey.tickSpacing,
          hooks: poolKey.hooks,
        },
        zeroForOne,
        exactAmount: amountIn,
        hookData: "0x",
      },
    ],
  });

  const rpcResponse = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: quoter, data: calldata }, "latest"],
    }),
  });

  const json = await rpcResponse.json();
  if (json.error) {
    throw new Error(json.error.message || "Quoter RPC error");
  }

  const data = json.result as `0x${string}`;
  if (!data || data === "0x") throw new Error("Empty quoter response");

  const [amountOut, gasEstimate] = decodeAbiParameters(RETURN_TYPES, data);

  return { amountIn, amountOut, direction, route: "direct" as const, gasEstimate };
}

/**
 * Quote via BNKRW route: WETH↔BNKRW (OLD_TOKEN pool) + BNKRW↔WCHAN (1:1 wrap).
 * Since the wrap hop is 1:1, we only need to quote the WETH↔BNKRW hop.
 */
export async function getQuoteViaBnkrw(
  rpcUrl: string,
  chainId: number,
  direction: SwapDirection,
  amountIn: bigint
): Promise<WchanQuote> {
  const { quoter } = getAddresses(chainId);
  const poolKey = buildOldTokenPoolKey(chainId);

  const wethIs0 = isWethCurrency0ForOldToken(chainId);
  // Buy WCHAN = buy BNKRW with WETH → wrap to WCHAN
  // Sell WCHAN = unwrap WCHAN to BNKRW → sell BNKRW for WETH
  const zeroForOne = direction === "buy" ? wethIs0 : !wethIs0;

  const calldata = encodeFunctionData({
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        poolKey: {
          currency0: poolKey.currency0,
          currency1: poolKey.currency1,
          fee: poolKey.fee,
          tickSpacing: poolKey.tickSpacing,
          hooks: poolKey.hooks,
        },
        zeroForOne,
        exactAmount: amountIn,
        hookData: "0x",
      },
    ],
  });

  const rpcResponse = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to: quoter, data: calldata }, "latest"],
    }),
  });

  const json = await rpcResponse.json();
  if (json.error) {
    throw new Error(json.error.message || "Quoter RPC error (via-bnkrw)");
  }

  const data = json.result as `0x${string}`;
  if (!data || data === "0x") throw new Error("Empty quoter response (via-bnkrw)");

  const [amountOut, gasEstimate] = decodeAbiParameters(RETURN_TYPES, data);

  // amountOut from WETH↔BNKRW hop = final WCHAN amount (1:1 wrap)
  return { amountIn, amountOut, direction, route: "via-bnkrw" as const, gasEstimate };
}

/**
 * Fetch both routes in parallel and return the one with higher amountOut.
 * Falls back to the other route if one fails.
 */
export async function getBestQuote(
  rpcUrl: string,
  chainId: number,
  direction: SwapDirection,
  amountIn: bigint
): Promise<WchanQuote> {
  const [directResult, viaBnkrwResult] = await Promise.allSettled([
    getQuote(rpcUrl, chainId, direction, amountIn),
    getQuoteViaBnkrw(rpcUrl, chainId, direction, amountIn),
  ]);

  const directQuote =
    directResult.status === "fulfilled" ? directResult.value : null;
  const viaBnkrwQuote =
    viaBnkrwResult.status === "fulfilled" ? viaBnkrwResult.value : null;

  // Log route comparison
  console.log("[wchan-swap] Route quotes:", {
    direct: directQuote
      ? `${directQuote.amountOut.toString()} out`
      : `failed${directResult.status === "rejected" ? ` (${directResult.reason})` : ""}`,
    viaBnkrw: viaBnkrwQuote
      ? `${viaBnkrwQuote.amountOut.toString()} out`
      : `failed${viaBnkrwResult.status === "rejected" ? ` (${viaBnkrwResult.reason})` : ""}`,
  });

  let best: WchanQuote | null = null;

  if (directQuote && viaBnkrwQuote) {
    best =
      viaBnkrwQuote.amountOut > directQuote.amountOut
        ? viaBnkrwQuote
        : directQuote;
  } else if (directQuote) {
    best = directQuote;
  } else if (viaBnkrwQuote) {
    best = viaBnkrwQuote;
  }

  if (best) {
    console.log(
      `[wchan-swap] Selected route: ${best.route} (${best.direction} ${best.amountIn.toString()} → ${best.amountOut.toString()})`
    );
    return best;
  }

  // Both failed — rethrow the direct route error
  throw directResult.status === "rejected"
    ? directResult.reason
    : new Error("Both routes failed");
}
