import { parseEther, parseUnits } from "viem";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import {
  buildApprovalTx,
  buildPermit2ApproveTx,
  type SwapQuoteResponse,
  type TokenInfo,
} from "@/chrome/swapApi";
import type { useThemedToast } from "@/hooks/useThemedToast";
import type { PreparedSwapTxEntry } from "./SwapConfirmation";
import { buildSwapBatchPlan } from "./swapBatchPlan";
import type { PreparedSwapPlan, SwapAccountType } from "./swapViewTypes";
import { to0xToken } from "./swapViewUtils";

interface PrepareSameChainSwapOptions {
  sellToken: PortfolioToken;
  buyTokenInfo: TokenInfo;
  buyTokenAddress: string;
  buyTokenLogoURI?: string;
  sellTokenAmount: string;
  indicativeQuote: SwapQuoteResponse;
  fromAddress: string;
  accountId?: string;
  accountType: SwapAccountType;
  chainId: number;
  slippageBps: number;
  toast: ReturnType<typeof useThemedToast>;
}

export async function prepareSameChainSwap({
  sellToken,
  buyTokenInfo,
  buyTokenAddress,
  buyTokenLogoURI,
  sellTokenAmount,
  indicativeQuote,
  fromAddress,
  accountId,
  accountType,
  chainId,
  slippageBps,
  toast,
}: PrepareSameChainSwapOptions): Promise<PreparedSwapPlan | null> {
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
          chainId,
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

  const firmQuote = await new Promise<{
    success: boolean;
    data?: SwapQuoteResponse;
    error?: string;
  }>((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: "fetchSwapQuote",
        chainId,
        sellToken: to0xToken(sellToken),
        buyToken: buyTokenAddress.trim(),
        sellAmount: sellAmountWei,
        taker: fromAddress,
        slippageBps,
      },
      resolve,
    );
  });
  if (!firmQuote.success || !firmQuote.data?.transaction) {
    toast({
      title: "Quote failed",
      description: firmQuote.error || "Could not get swap quote",
      status: "error",
      duration: 3000,
    });
    return null;
  }

  const transactions: PreparedSwapTxEntry[] = [];
  const allowanceSpender = indicativeQuote.issues?.allowance?.spender;
  if (sellToken.contractAddress !== "native" && allowanceSpender) {
    const allowanceResponse = await new Promise<{
      success: boolean;
      allowance?: string;
    }>((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "checkTokenAllowance",
          tokenAddress: sellToken.contractAddress,
          owner: fromAddress,
          spender: allowanceSpender,
          chainId,
        },
        resolve,
      );
    });
    if (BigInt(allowanceResponse.allowance || "0") < BigInt(sellAmountWei)) {
      const { data } = buildApprovalTx(
        sellToken.contractAddress,
        allowanceSpender,
        BigInt(sellAmountWei),
      );
      transactions.push({
        tx: {
          from: fromAddress,
          to: sellToken.contractAddress,
          data,
          value: "0x0",
          chainId,
        },
        origin: `Approve ${sellToken.symbol.toUpperCase()} for swap`,
        favicon: sellToken.logoUrl || null,
        functionName: "approve",
      });
    }
  }

  const permit2Approval = indicativeQuote.issues?.permit2Approval;
  if (permit2Approval) {
    const permit2Response = await new Promise<{
      success: boolean;
      amount?: string;
      expiration?: number;
    }>((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "checkPermit2Allowance",
          token: permit2Approval.token,
          owner: fromAddress,
          spender: permit2Approval.spender,
          chainId,
        },
        resolve,
      );
    });
    const permittedAmount = BigInt(permit2Response.amount || "0");
    const expiration = permit2Response.expiration || 0;
    const now = Math.floor(Date.now() / 1000);
    if (permittedAmount < BigInt(sellAmountWei) || expiration < now) {
      const { data } = buildPermit2ApproveTx(
        allowanceSpender!,
        permit2Approval.token,
        permit2Approval.spender,
        BigInt(sellAmountWei),
      );
      transactions.push({
        tx: {
          from: fromAddress,
          to: allowanceSpender!,
          data,
          value: "0x0",
          chainId,
        },
        origin: `Approve ${sellToken.symbol.toUpperCase()} on Permit2`,
        favicon: sellToken.logoUrl || null,
        functionName: "approve",
      });
    }
  }

  const swapTransaction = firmQuote.data.transaction;
  transactions.push({
    tx: {
      from: fromAddress,
      to: swapTransaction.to,
      data: swapTransaction.data,
      value: `0x${BigInt(swapTransaction.value).toString(16)}`,
      chainId,
      gas: swapTransaction.gas,
      ...(swapTransaction.gasPrice
        ? { gasPrice: swapTransaction.gasPrice }
        : {}),
    },
    origin: `Swap ${sellToken.symbol.toUpperCase()} to ${buyTokenInfo.symbol.toUpperCase()}`,
    favicon: sellToken.logoUrl || null,
    swapMeta: {
      sellTokenSymbol: sellToken.symbol,
      sellTokenLogo: sellToken.logoUrl || null,
      buyTokenSymbol: buyTokenInfo.symbol,
      buyTokenLogo: buyTokenLogoURI || null,
    },
  });

  const { batchTx, delegation } = await buildSwapBatchPlan({
    transactions,
    accountType,
    accountId,
    chainId,
    fromAddress,
  });
  return {
    transactions,
    batchTx,
    delegation,
    quote: firmQuote.data,
  };
}
