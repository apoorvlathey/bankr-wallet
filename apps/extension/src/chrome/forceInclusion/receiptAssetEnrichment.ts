import { getRpcUrl } from "../transactions/rpcConfig";
import { getTxById } from "../txHistoryStorage";
import { isWalletOuterGasPayer } from "../history/nativeDelta";
import { getUserOperationTokenFeeFromReceipt } from "../feePayment/userOperationEvent";

export async function startReceiptAssetChangeExtraction(
  txId: string,
  txHash: string,
  chainId: number,
  receipt?: any,
  rpcUrlOverride?: string,
  feePaymentPaymaster?: string,
): Promise<void> {
  try {
    const rpcUrl = rpcUrlOverride ?? (await getRpcUrl(chainId));
    if (!rpcUrl) return;
    const tx = await getTxById(txId);
    const sender = tx?.tx?.from;
    if (!sender) return;
    const sponsoredFee = receipt && tx?.userOperationHash && tx.erc20FeePayment
      ? getUserOperationTokenFeeFromReceipt(
          receipt,
          tx.userOperationHash,
          sender,
          tx.erc20FeePayment.token,
        )
      : null;
    const { extractAssetChangesWhenReceiptAvailable } = await import(
      "../receiptEnrichment"
    );
    await extractAssetChangesWhenReceiptAvailable({
      txId,
      txHash,
      chainId,
      userAddress: sender,
      receipt,
      rpcUrl,
      payerForGas: isWalletOuterGasPayer(
        tx?.feePaymentToken,
        tx?.erc20FeePayment,
      ),
      ...(feePaymentPaymaster && tx?.erc20FeePayment
        ? {
            feePayment: {
              token: tx.erc20FeePayment.token,
              paymaster: feePaymentPaymaster,
              amountWei: sponsoredFee?.amountWei,
            },
          }
        : {}),
    });
  } catch (error) {
    console.warn("[receipt] asset-changes extraction failed", error);
  }
}

/** Enriches flows whose status and bundle mirrors have separate owners. */
export async function applyErc20FeeReceiptEnrichment(
  txId: string,
  txHash: string,
  chainId: number,
  receipt: any,
  paymaster: string,
): Promise<void> {
  void startReceiptAssetChangeExtraction(
    txId,
    txHash,
    chainId,
    receipt,
    undefined,
    paymaster,
  );
}
