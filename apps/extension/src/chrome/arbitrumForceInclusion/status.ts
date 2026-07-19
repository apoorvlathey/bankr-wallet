import {
  createWalletClient,
  encodeFunctionData,
  keccak256,
  slice,
  type Hash,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { getAccountById } from "../accountStorage";
import { assertLocalAccountEffectBinding } from "../accounts/localEffectBoundary";
import { getLocalPrivateKeyForAccount } from "../accounts/localKeyResolver";
import { prepareSignAndBroadcastTransaction } from "../localSigner";
import { secureHttpTransport } from "../network/rpcClient";
import {
  getTxById,
  updateTxInHistory,
  type CompletedTransaction,
  type ForceInclusionMeta,
} from "../txHistoryStorage";
import {
  createL1PublicClient,
  getL1Chain,
  getL1RpcUrl,
  L1_RPC_TIMEOUT,
} from "../forceInclusion/l1Client";
import { startReceiptPolling } from "../forceInclusion/receiptPoller";
import {
  ARBITRUM_SEQUENCER_INBOX_ABI,
  decodeDeliveredMessage,
  decodeInboxMessage,
} from "./contracts";
import { isArbitrumForceEligible } from "./policy";

export type ArbitrumForceStatus = {
  applicable: boolean;
  state: "waiting" | "eligible" | "submitted" | "forced" | "consumed" | "unavailable";
  eligible: boolean;
  forceTransactionHash?: string;
  error?: string;
};

const activeForceSubmissions = new Set<string>();

function hasForcePreimage(meta: ForceInclusionMeta) {
  return Boolean(
    meta.protocol === "arbitrum" &&
      meta.l1TxHash &&
      meta.inbox &&
      meta.bridge &&
      meta.sequencerInbox &&
      meta.messageIndex !== undefined &&
      meta.messageBlockNumber !== undefined &&
      meta.messageBlockHash &&
      meta.messageTimestamp !== undefined &&
      meta.kind === 3 &&
      meta.sender &&
      meta.baseFeeL1 !== undefined &&
      meta.messageDataHash,
  );
}

async function loadRecord(txId: string): Promise<CompletedTransaction> {
  const tx = await getTxById(txId);
  if (!tx?.forceInclusionMeta || tx.forceInclusionMeta.protocol !== "arbitrum") {
    throw new Error("Arbitrum delayed-inclusion transaction not found");
  }
  return tx;
}

export async function getArbitrumForceInclusionStatus(
  txId: string,
): Promise<ArbitrumForceStatus> {
  const tx = await loadRecord(txId).catch(() => null);
  if (!tx?.forceInclusionMeta) {
    return { applicable: false, state: "unavailable", eligible: false };
  }
  const meta = tx.forceInclusionMeta;
  if (tx.status !== "pending" || meta.l2Confirmed) {
    return { applicable: true, state: "consumed", eligible: false };
  }
  if (!hasForcePreimage(meta)) {
    return { applicable: true, state: "waiting", eligible: false };
  }
  try {
    const client = createL1PublicClient(await getL1RpcUrl(meta.l1ChainId));
    if (meta.forceTransactionHash) {
      const receipt = await client
        .getTransactionReceipt({ hash: meta.forceTransactionHash as Hash })
        .catch(() => null);
      if (!receipt) {
        return {
          applicable: true,
          state: "submitted",
          eligible: false,
          forceTransactionHash: meta.forceTransactionHash,
        };
      }
      if (receipt.status === "success") {
        return {
          applicable: true,
          state: "forced",
          eligible: false,
          forceTransactionHash: meta.forceTransactionHash,
        };
      }
    }
    const [read, deadline, currentBlock] = await Promise.all([
      client.readContract({
        address: meta.sequencerInbox!,
        abi: ARBITRUM_SEQUENCER_INBOX_ABI,
        functionName: "totalDelayedMessagesRead",
      }),
      client.readContract({
        address: meta.sequencerInbox!,
        abi: ARBITRUM_SEQUENCER_INBOX_ABI,
        functionName: "forceInclusionDeadline",
        args: [BigInt(meta.messageBlockNumber!)],
      }),
      client.getBlockNumber(),
    ]);
    if (read > BigInt(meta.messageIndex!)) {
      return { applicable: true, state: "consumed", eligible: false };
    }
    const eligible = isArbitrumForceEligible({
      currentBlock,
      deadlineBlock: deadline,
      totalDelayedMessagesRead: read,
      messageIndex: BigInt(meta.messageIndex!),
    });
    return {
      applicable: true,
      state: eligible ? "eligible" : "waiting",
      eligible,
    };
  } catch (error) {
    return {
      applicable: true,
      state: "unavailable",
      eligible: false,
      error: error instanceof Error ? error.message : "Could not check force-inclusion status",
    };
  }
}

async function assertPreimageMatchesChain(tx: CompletedTransaction) {
  const meta = tx.forceInclusionMeta!;
  const client = createL1PublicClient(await getL1RpcUrl(meta.l1ChainId));
  const receipt = await client.getTransactionReceipt({ hash: meta.l1TxHash as Hash });
  if (
    receipt.status !== "success" ||
    receipt.blockNumber !== BigInt(meta.messageBlockNumber!) ||
    receipt.blockHash.toLowerCase() !== meta.messageBlockHash!.toLowerCase()
  ) {
    throw new Error("The delayed-inbox receipt no longer matches transaction history");
  }
  const delivered = decodeDeliveredMessage(receipt, meta.bridge!, meta.inbox!);
  const inboxMessage = decodeInboxMessage(receipt, meta.inbox!);
  const childHash = meta.l2TxHash || tx.txHash;
  if (
    delivered.messageIndex !== BigInt(meta.messageIndex!) ||
    delivered.kind !== meta.kind ||
    delivered.sender.toLowerCase() !== meta.sender!.toLowerCase() ||
    delivered.messageDataHash.toLowerCase() !== meta.messageDataHash!.toLowerCase() ||
    delivered.baseFeeL1 !== BigInt(meta.baseFeeL1!) ||
    delivered.timestamp !== BigInt(meta.messageTimestamp!) ||
    inboxMessage.messageNum !== delivered.messageIndex ||
    !inboxMessage.data.startsWith("0x04") ||
    !childHash ||
    keccak256(slice(inboxMessage.data, 1)).toLowerCase() !== childHash.toLowerCase() ||
    keccak256(inboxMessage.data).toLowerCase() !== delivered.messageDataHash.toLowerCase()
  ) {
    throw new Error("The delayed-inbox message preimage does not match Ethereum");
  }
  return client;
}

export async function submitArbitrumForceInclusion(txId: string) {
  const tx = await loadRecord(txId);
  const meta = tx.forceInclusionMeta!;
  if (!hasForcePreimage(meta) || !tx.accountId) {
    return { success: false, error: "Force inclusion is not ready" };
  }
  const account = await getAccountById(tx.accountId);
  if (!account || (account.type !== "privateKey" && account.type !== "seedPhrase")) {
    return { success: false, error: "The signing account is no longer available" };
  }
  const privateKey = await getLocalPrivateKeyForAccount(account.id, "");
  if (!privateKey) return { success: false, error: "Unlock wallet to force inclusion" };
  if (activeForceSubmissions.has(txId)) {
    return { success: false, error: "Force inclusion is already being submitted" };
  }
  activeForceSubmissions.add(txId);

  try {
    const status = await getArbitrumForceInclusionStatus(txId);
    if (!status.eligible) {
      return {
        success: false,
        error: status.state === "consumed"
          ? "The sequencer has already consumed this message"
          : "This transaction is not yet eligible for force inclusion",
      };
    }
    const l1Client = await assertPreimageMatchesChain(tx);
    const data = encodeFunctionData({
      abi: ARBITRUM_SEQUENCER_INBOX_ABI,
      functionName: "forceInclusion",
      args: [
        BigInt(meta.messageIndex!) + 1n,
        meta.kind!,
        [BigInt(meta.messageBlockNumber!), BigInt(meta.messageTimestamp!)],
        BigInt(meta.baseFeeL1!),
        meta.sender!,
        meta.messageDataHash!,
      ],
    });
    const gas = await l1Client.estimateGas({
      account: account.address as `0x${string}`,
      to: meta.sequencerInbox!,
      data,
      value: 0n,
    });
    const l1RpcUrl = await getL1RpcUrl(meta.l1ChainId);
    const viemAccount = privateKeyToAccount(privateKey);
    const wallet = createWalletClient({
      account: viemAccount,
      chain: getL1Chain(meta.l1ChainId),
      transport: secureHttpTransport(l1RpcUrl, { timeout: L1_RPC_TIMEOUT }),
    });
    const broadcast = await prepareSignAndBroadcastTransaction(
      wallet,
      {
        account: viemAccount,
        chain: getL1Chain(meta.l1ChainId),
        to: meta.sequencerInbox!,
        data,
        value: 0n,
        gas: (gas * 120n) / 100n,
      },
      {
        chainId: meta.l1ChainId,
        supportsSyncSend: false,
        beforeBroadcast: async () => {
          await assertLocalAccountEffectBinding(account);
          const latest = await getArbitrumForceInclusionStatus(txId);
          if (!latest.eligible) throw new Error("The message is no longer force-includable");
          await assertPreimageMatchesChain(await loadRecord(txId));
        },
      },
    );
    const forceTransactionHash = broadcast.txHash as `0x${string}`;
    await updateTxInHistory(txId, {
      forceInclusionMeta: { ...meta, forceTransactionHash },
    });
    const childHash = meta.l2TxHash || tx.txHash;
    if (childHash) startReceiptPolling(txId, childHash, meta.l2ChainId);
    return { success: true, txHash: forceTransactionHash };
  } catch (error: any) {
    return {
      success: false,
      error: error?.shortMessage || error?.message || "Could not force inclusion",
    };
  } finally {
    activeForceSubmissions.delete(txId);
  }
}
