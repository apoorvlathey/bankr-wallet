import { formatTokenAmount } from "@/components/feePaymentUi";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";

export interface Erc20FeeDisplay {
  token: string;
  amountWei?: string;
  symbol?: string;
  decimals?: number;
  logoUrl?: string;
  usd: string | null;
  pending: boolean;
}

export function buildErc20FeeDisplay(
  payment: CompletedTransaction["erc20FeePayment"],
  metadata: Pick<Erc20FeeDisplay, "symbol" | "decimals" | "logoUrl"> | undefined,
  cachedLogoUrl: string | undefined,
  usd: string | null,
  pending: boolean,
): Erc20FeeDisplay | undefined {
  return payment
    ? { ...payment, ...metadata, logoUrl: cachedLogoUrl, usd, pending }
    : undefined;
}

export function formatErc20FeeDisplayAmount(
  fee: Erc20FeeDisplay,
): string | null {
  if (!fee.amountWei) return null;
  if (fee.decimals === undefined) return `${fee.amountWei} base units`;
  try {
    const amount = formatTokenAmount(fee.amountWei, fee.decimals, 8);
    return fee.symbol ? `${amount} ${fee.symbol}` : amount;
  } catch {
    return null;
  }
}

export function getErc20FeeStatusLabel(fee: Erc20FeeDisplay): string {
  return fee.pending ? "Final fee pending" : "Fee amount unavailable";
}
