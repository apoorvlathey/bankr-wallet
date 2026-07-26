import { WALLETCHAN_PIMLICO_PROXY_BASE } from "@/constants/externalUrls";
import { getAccountById } from "../accountStorage";
import { getLocalPrivateKeyForAccount } from "../accounts/localKeyResolver";
import { signFeePaymentEip7702Authorization } from "../feePayment/authorization";
import {
  getFeePaymentChainContext,
  getFeeTokenAllowance,
  getFeeTokenBalance,
} from "../feePayment/chainState";
import { PimlicoClient } from "../feePayment/pimlicoClient";
import type { Address } from "../feePayment/pimlicoTypes";
import {
  consumeFeePaymentQuote,
  type PreparedFeePaymentQuote,
} from "../feePayment/quotes";
import { assertFeePaymentQuoteChainState } from "../feePayment/quoteValidation";
import {
  signPreparedUserOperation,
  type FeePaymentSigner,
} from "../feePayment/signing";
import { submitUserOperationRecoverably } from "../feePayment/submission";
import {
  feePaymentCrossDappCalls,
  getCrossDappFeePaymentRequestId,
} from "../feePayment/crossDappRequest";
import { encodeMetaMaskDeleGatorCalls } from "../feePayment/userOperation";
import {
  beginPendingRequestEffectLease,
  guardPendingRequestEffectLease,
} from "../requests/pendingRequestResolution";
import { addTxToHistory, updateTxInHistory } from "../txHistoryStorage";
import { getBankrApiKeyForConfirmation } from "../transactions/bankrSession";
import { clearCrossDappBatch, type CrossDappBatch } from "./storage";
import {
  failConsumedCrossDappBatch,
  pollCrossDappFeePaymentReceipt,
} from "./feePaymentCompletion";
import { createCrossDappBatchResultRoute } from "./resultRoute";
import { enforceCrossDappBatchAuthorizationAtConfirmation } from "./lifecycle";

type CrossDappBatchAccount = Extract<
  FeePaymentSigner["account"],
  { type: "bankr" | "privateKey" | "seedPhrase" }
>;

async function resolveFeePaymentSigner(
  account: CrossDappBatchAccount,
  password: string,
): Promise<FeePaymentSigner> {
  if (account.type === "bankr") {
    const apiKey = await getBankrApiKeyForConfirmation(password);
    if (!apiKey) throw new Error("Invalid password");
    return { account, apiKey };
  }
  const privateKey = await getLocalPrivateKeyForAccount(account.id, password);
  if (!privateKey) throw new Error("Invalid password");
  return { account, privateKey };
}

async function assertLiveBatchAuthorization(
  batch: CrossDappBatch,
  account: CrossDappBatchAccount,
): Promise<void> {
  const latest = await getAccountById(account.id);
  if (
    !latest ||
    latest.type !== account.type ||
    latest.address.toLowerCase() !== account.address.toLowerCase()
  ) {
    throw new Error("Cross-dapp batch account is no longer available");
  }
  const authorization =
    await enforceCrossDappBatchAuthorizationAtConfirmation(batch);
  if (!authorization.authorized) throw new Error(authorization.error);
  const commit = authorization.commit();
  if (!commit.authorized) {
    await commit.terminalize();
    throw new Error(commit.error);
  }
}

async function assertFeeFunds(
  quote: PreparedFeePaymentQuote,
  sender: Address,
  context: Awaited<ReturnType<typeof getFeePaymentChainContext>>,
): Promise<void> {
  const [allowance, balance] = await Promise.all([
    quote.prepared.approvalAdded
      ? Promise.resolve(quote.prepared.maximumTokenCost)
      : getFeeTokenAllowance(
          context.client,
          quote.token.address,
          sender,
          quote.prepared.quote.paymaster,
        ),
    getFeeTokenBalance(context.client, quote.token.address, sender),
  ]);
  if (allowance < quote.prepared.maximumTokenCost) {
    throw new Error(
      `${quote.token.symbol} allowance changed; refresh the gas quote`,
    );
  }
  if (balance < quote.prepared.maximumTokenCost) {
    throw new Error(
      `Insufficient ${quote.token.symbol} balance for the maximum gas charge`,
    );
  }
}

export async function executeCrossDappBatchWithFeeToken(input: {
  batch: CrossDappBatch;
  account: CrossDappBatchAccount;
  password: string;
  feePaymentQuoteId?: string;
}): Promise<{ success: boolean; error?: string }> {
  const { batch, account } = input;
  const historyId = getCrossDappFeePaymentRequestId(batch);
  const calls = feePaymentCrossDappCalls(batch);
  const route = createCrossDappBatchResultRoute(batch);
  let batchConsumed = false;
  let submissionAccepted = false;
  let effectGuard:
    | ReturnType<typeof guardPendingRequestEffectLease>
    | undefined;
  try {
    const signer = await resolveFeePaymentSigner(account, input.password);
    const quote = consumeFeePaymentQuote({
      quoteId: input.feePaymentQuoteId ?? "",
      family: "crossDappBatch",
      requestId: historyId,
      account,
      calls,
    });
    const historyTx = {
      from: batch.fromAddress,
      to: batch.fromAddress,
      data: encodeMetaMaskDeleGatorCalls(
        batch.fromAddress as Address,
        calls,
      ),
      value: "0x0",
      chainId: batch.chainId,
    };
    const batchCallOrigins = batch.entries.map((entry) => ({
      origin: entry.origin,
      favicon: entry.favicon,
    }));
    await addTxToHistory({
      id: historyId,
      status: "processing",
      tx: historyTx,
      origin: "Cross-Dapp Batch",
      favicon: null,
      chainName: batch.chainName,
      chainId: batch.chainId,
      createdAt: batch.createdAt,
      accountType: account.type,
      accountId: account.id,
      functionName: `${calls.length} call${calls.length === 1 ? "" : "s"}`,
      batchCallOrigins,
      erc20FeePayment: { token: quote.token.address.toLowerCase() },
    });
    await updateTxInHistory(historyId, {
      status: "processing",
      tx: historyTx,
      batchCallOrigins,
      erc20FeePayment: { token: quote.token.address.toLowerCase() },
      error: undefined,
      completedAt: undefined,
    });

    const sender = account.address as Address;
    const context = await getFeePaymentChainContext(batch.chainId, sender);
    assertFeePaymentQuoteChainState(quote, context);
    await assertFeeFunds(quote, sender, context);
    let eip7702Auth;
    if (context.needsAuthorization) {
      if (!signer.privateKey || context.eoaNonce === null) {
        throw new Error(
          "Enable WalletChan's smart account before paying with a token",
        );
      }
      eip7702Auth = await signFeePaymentEip7702Authorization(
        signer.privateKey,
        {
          chainId: batch.chainId,
          currentEoaNonce: context.eoaNonce,
          rpcUrl: context.chain.rpcUrl,
          customChainMeta: context.chain.isCustom
            ? {
                name: context.chain.name,
                nativeCurrency: context.chain.nativeCurrency,
                explorer: context.chain.explorer || undefined,
              }
            : undefined,
        },
      );
    }
    await assertLiveBatchAuthorization(batch, account);
    const effectLease = beginPendingRequestEffectLease(
      "crossDappBatch",
      "active",
    );
    if (!effectLease) throw new Error("Wallet reset is in progress");
    effectGuard = guardPendingRequestEffectLease(effectLease);
    const userOperation = {
      ...quote.prepared.userOperation,
      ...(eip7702Auth ? { eip7702Auth } : { eip7702Auth: undefined }),
    };
    effectGuard.beginEffect();
    const signature = await signPreparedUserOperation(
      signer,
      userOperation,
      batch.chainId,
    );
    effectGuard.settleEffect();
    const client = new PimlicoClient(
      `${WALLETCHAN_PIMLICO_PROXY_BASE}/${batch.chainId}`,
      batch.chainId,
    );
    const submission = await submitUserOperationRecoverably({
      client,
      record: {
        version: 1,
        family: "crossDappBatch",
        txId: historyId,
        sender,
        chainId: batch.chainId,
        crossDappResultRoute: route,
      },
      userOperation: { ...userOperation, signature },
      beforeBroadcast: async () => {
        await assertLiveBatchAuthorization(batch, account);
        await clearCrossDappBatch();
        batchConsumed = true;
        effectGuard!.beginEffect();
      },
    });
    submissionAccepted = true;
    if (!submission.outcomeUnknown) effectGuard.settleEffect();
    void pollCrossDappFeePaymentReceipt({
      historyId,
      chainId: batch.chainId,
      sender,
      userOperationHash: submission.userOperationHash,
      route,
    }).then((finalized) => {
      if (finalized && submission.outcomeUnknown) {
        effectGuard?.settleEffect();
        effectGuard?.releaseIfSafe();
      }
    }).catch((error) =>
      console.warn("[fee-payment] cross-dapp receipt polling paused", error),
    );
    await updateTxInHistory(historyId, {
      status: "pending",
      userOperationHash: submission.userOperationHash,
      erc20FeePayment: { token: quote.token.address.toLowerCase() },
      ...(submission.outcomeUnknown ? { broadcastUncertain: true } : {}),
    });
    return { success: true };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Token gas payment failed";
    if (submissionAccepted) {
      console.warn(
        "[fee-payment] cross-dapp post-submission bookkeeping paused",
        error,
      );
      return { success: true };
    }
    if (batchConsumed) {
      await failConsumedCrossDappBatch({
        batch,
        historyId,
        route,
        error: message,
      });
    } else {
      await updateTxInHistory(historyId, {
        status: "failed",
        error: message,
        completedAt: Date.now(),
      });
    }
    return { success: false, error: message };
  } finally {
    effectGuard?.releaseIfSafe();
  }
}
