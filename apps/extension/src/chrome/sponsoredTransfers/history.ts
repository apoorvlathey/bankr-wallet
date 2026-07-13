import {
  addTxToHistory,
  getTxById,
  updateTxInHistory,
} from "../txHistoryStorage";
import {
  BASE_USDC_ADDRESS,
  USDC_LOGO_URL,
} from "./constants";
import type { SponsoredTransferIntentRecord } from "./intentStorage";

export async function ensureSponsoredTransferHistory(
  record: SponsoredTransferIntentRecord,
): Promise<void> {
  if (await getTxById(record.txId)) return;
  await addTxToHistory({
    id: record.txId,
    status: "processing",
    tx: {
      from: record.accountAddress,
      to: BASE_USDC_ADDRESS,
      data: "0x",
      value: "0x0",
      chainId: 8453,
    },
    origin: "Send USDC (Sponsored)",
    favicon: USDC_LOGO_URL,
    chainName: "Base",
    chainId: 8453,
    createdAt: record.createdAt,
    accountType: record.accountType,
    functionName: "transferWithAuthorization",
    transferMeta: {
      recipient: record.to,
      amount: record.amount,
      symbol: "USDC",
      tokenLogo: USDC_LOGO_URL,
    },
  });
}

export { updateTxInHistory };
