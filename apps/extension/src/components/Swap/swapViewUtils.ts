import { formatTokenAmountFromBase } from "@/lib/tokenFormatUtils";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import { NATIVE_TOKEN_ADDRESS } from "@/chrome/swapApi";
import type { PreparedDelegation } from "./swapViewTypes";

export const formatOutputAmount = (amount: string, decimals: number): string =>
  formatTokenAmountFromBase(amount, decimals);

export function to0xToken(token: PortfolioToken): string {
  return token.contractAddress === "native"
    ? NATIVE_TOKEN_ADDRESS
    : token.contractAddress;
}

export function resolveSwapDelegate(
  accountId: string,
  chainId: number,
): Promise<PreparedDelegation | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "getDelegationStatus", accountId, chainId },
      (res: any) => {
        if (chrome.runtime.lastError || !res?.success || !res?.delegate) {
          resolve(null);
          return;
        }
        resolve({
          delegate: res.delegate,
          needsAuth: Boolean(res.needsAuthorization),
          onchainDelegate: res.onchainDelegate ?? null,
        });
      },
    );
  });
}
