import { parseEther, parseUnits } from "viem";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import {
  NATIVE_TOKEN_ADDRESS,
  buildApprovalTx,
  type SwapQuoteResponse,
  type TokenInfo,
} from "@/chrome/swapApi";
import type { useThemedToast } from "@/hooks/useThemedToast";
import { BUNGEE_NATIVE_TOKEN, type BungeeQuoteResponse } from "@walletchan/shared/bungee";
import type { PreparedSwapTxEntry } from "./swapViewTypes";
import { getExecutableBridgeRouteSelection } from "./bridgeRouteUtils";
import { buildSwapBatchPlan } from "./swapBatchPlan";
import type {
  PreparedSwapPlan,
  SwapAccountType,
} from "./swapViewTypes";

interface PrepareBridgeSwapOptions {
  sellToken: PortfolioToken;
  buyTokenInfo: TokenInfo;
  buyTokenAddress: string;
  buyTokenLogoURI?: string;
  sellTokenAmount: string;
  fromAddress: string;
  accountId?: string;
  accountType: SwapAccountType;
  sellChainId: number;
  buyChainId: number;
  resolvedBuyChainName: string;
  slippageBps: number;
  toast: ReturnType<typeof useThemedToast>;
}

export async function prepareBridgeSwap({
  sellToken,
  buyTokenInfo,
  buyTokenAddress,
  buyTokenLogoURI,
  sellTokenAmount,
  fromAddress,
  accountId,
  accountType,
  sellChainId,
  buyChainId,
  resolvedBuyChainName,
  slippageBps,
  toast,
}: PrepareBridgeSwapOptions): Promise<PreparedSwapPlan | null> {
  let sellAmountWei: string;
  try {
    sellAmountWei =
      sellToken.contractAddress === "native"
        ? parseEther(sellTokenAmount).toString()
        : parseUnits(sellTokenAmount, sellToken.decimals).toString();
  } catch {
    toast({ title: "Invalid amount", status: "error", duration: 3000 });
    return null;
  }

  if (sellToken.contractAddress !== "native") {
    const balanceResponse = await new Promise<{
      success: boolean;
      balance?: string;
    }>((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "getTokenBalanceWei",
          tokenAddress: sellToken.contractAddress,
          owner: fromAddress,
          chainId: sellChainId,
        },
        resolve,
      );
    });
    if (balanceResponse.success && balanceResponse.balance) {
      const onchainBalance = BigInt(balanceResponse.balance);
      if (BigInt(sellAmountWei) > onchainBalance) {
        sellAmountWei = onchainBalance.toString();
      }
    }
  }

  const freshQuote = await new Promise<{
    success: boolean;
    data?: BungeeQuoteResponse;
    error?: string;
  }>((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "fetchBridgeQuote",
        userAddress: fromAddress,
        receiverAddress: fromAddress,
        originChainId: sellChainId,
        destinationChainId: buyChainId,
        inputToken:
          sellToken.contractAddress === "native"
            ? BUNGEE_NATIVE_TOKEN
            : sellToken.contractAddress,
        outputToken:
          buyTokenAddress.toLowerCase() ===
          NATIVE_TOKEN_ADDRESS.toLowerCase()
            ? BUNGEE_NATIVE_TOKEN
            : buyTokenAddress,
        inputAmount: sellAmountWei,
        slippage: slippageBps / 100,
      },
      resolve,
    );
  });
  const routeSelection = freshQuote.success
    ? getExecutableBridgeRouteSelection(freshQuote.data)
    : null;
  const route = routeSelection?.route;
  if (!freshQuote.success || !route) {
    toast({
      title: "Bridge quote failed",
      description: freshQuote.error || "Could not refresh bridge quote",
      status: "error",
      duration: 3000,
    });
    return null;
  }

  const transactionData = route.txData;
  const approval = route.approvalData ?? null;
  if (!route.quoteId) {
    toast({
      title: "Bridge quote failed",
      description: "Socket did not return a quote id",
      status: "error",
      duration: 3000,
    });
    return null;
  }
  if (!transactionData) {
    toast({
      title: "Bridge build failed",
      description: "Socket did not return bridge transaction data",
      status: "error",
      duration: 3000,
    });
    return null;
  }

  const transactions: PreparedSwapTxEntry[] = [];
  if (approval && sellToken.contractAddress !== "native") {
    const allowanceResponse = await new Promise<{
      success: boolean;
      allowance?: string;
    }>((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "checkTokenAllowance",
          tokenAddress: approval.tokenAddress,
          owner: fromAddress,
          spender: approval.spenderAddress,
          chainId: sellChainId,
        },
        resolve,
      );
    });
    const currentAllowance = BigInt(allowanceResponse.allowance || "0");
    const neededAllowance = BigInt(approval.amount);
    if (currentAllowance < neededAllowance) {
      const { data } = buildApprovalTx(
        approval.tokenAddress,
        approval.spenderAddress,
        neededAllowance,
      );
      transactions.push({
        tx: {
          from: fromAddress,
          to: approval.tokenAddress,
          data,
          value: "0x0",
          chainId: sellChainId,
        },
        origin: `Approve ${sellToken.symbol.toUpperCase()} for bridge`,
        favicon: sellToken.logoUrl || null,
        functionName: "approve",
      });
    }
  }

  const swapMeta = {
    sellTokenSymbol: sellToken.symbol,
    sellTokenLogo: sellToken.logoUrl || null,
    buyTokenSymbol: buyTokenInfo.symbol,
    buyTokenLogo: buyTokenLogoURI || null,
  };
  transactions.push({
    tx: {
      from: fromAddress,
      to: transactionData.to,
      data: transactionData.data,
      value: `0x${BigInt(transactionData.value || "0").toString(16)}`,
      chainId: sellChainId,
    },
    origin: `Bridge ${sellToken.symbol.toUpperCase()} → ${resolvedBuyChainName}`,
    favicon: sellToken.logoUrl || null,
    swapMeta,
    bridge: {
      sourceChainId: sellChainId,
      destinationChainId: buyChainId,
      destinationChainName: resolvedBuyChainName,
      routeName: route.routeDetails?.name,
      receiverAddress: fromAddress,
      requestHash: route.quoteId,
    },
  });

  const { batchTx, delegation } = await buildSwapBatchPlan({
    transactions,
    accountType,
    accountId,
    chainId: sellChainId,
    fromAddress,
  });

  const quote = {
    buyAmount: route.output.amount,
    sellAmount: sellAmountWei,
    buyToken: transactionData.to,
    sellToken: sellToken.contractAddress,
    gas: "0",
    gasPrice: "0",
    totalNetworkFee: "0",
    liquidityAvailable: true,
    minBuyAmount: route.output.minAmountOut ?? route.output.amount,
    allowanceTarget: approval?.spenderAddress ?? "",
    issues: {},
    fees: {},
    route: { fills: [] },
  } as SwapQuoteResponse;

  return { transactions, batchTx, delegation, quote };
}
