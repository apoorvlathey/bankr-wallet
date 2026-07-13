/** Local transaction and EIP-7702 authorization signing. */

import type { SignedAuthorization } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { signAuthorization } from "viem/actions";
import { CHAIN_REGISTRY } from "@/constants/chainRegistry";
import { createLocalSignerClient } from "./client";
import { prepareSignAndBroadcastTransaction } from "./transactionBroadcast";
import type {
  BeforeLocalTransactionBroadcast,
  CustomChainMeta,
  SignedTransaction,
  TransactionRequest,
} from "./types";

const CHAIN_BY_ID_LOCAL = new Map(
  CHAIN_REGISTRY.map((chain) => [chain.chainId, chain]),
);

export async function signAndBroadcastTransaction(
  privateKey: `0x${string}`,
  tx: TransactionRequest,
  rpcUrl?: string,
  customChainMeta?: CustomChainMeta,
  beforeBroadcast?: BeforeLocalTransactionBroadcast,
): Promise<SignedTransaction> {
  const { client, account, chain } = createLocalSignerClient(
    tx.chainId,
    privateKey,
    rpcUrl,
    customChainMeta,
  );
  const txParams: Parameters<typeof client.sendTransaction>[0] = {
    account,
    to: tx.to ? (tx.to as `0x${string}`) : undefined,
    data: tx.data as `0x${string}`,
    value: BigInt(tx.value || "0"),
    chain,
  };

  if (tx.gas) txParams.gas = BigInt(tx.gas);
  if (tx.maxFeePerGas) txParams.maxFeePerGas = BigInt(tx.maxFeePerGas);
  if (tx.maxPriorityFeePerGas) {
    txParams.maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas);
  }
  if (tx.gasPrice) txParams.gasPrice = BigInt(tx.gasPrice);
  if (tx.nonce !== undefined) txParams.nonce = tx.nonce;
  if (tx.authorizationList && tx.authorizationList.length > 0) {
    (txParams as any).authorizationList = tx.authorizationList;
  }

  const chainEntry = CHAIN_BY_ID_LOCAL.get(tx.chainId);
  const isEip7702Tx = !!(
    tx.authorizationList && tx.authorizationList.length > 0
  );
  return prepareSignAndBroadcastTransaction(client, txParams as any, {
    chainId: tx.chainId,
    supportsSyncSend: !!chainEntry?.supportsSyncSend && !isEip7702Tx,
    beforeBroadcast,
  });
}

export async function signEip7702Authorization(
  privateKey: `0x${string}`,
  params: {
    contractAddress: `0x${string}`;
    chainId: number;
    nonce?: number;
    selfExecuted?: boolean;
    rpcUrl?: string;
    customChainMeta?: CustomChainMeta;
  },
): Promise<SignedAuthorization> {
  if (params.chainId === 0) {
    throw new Error("EIP-7702 authorization chainId must be chain-specific");
  }

  const { client } = createLocalSignerClient(
    params.chainId,
    privateKey,
    params.rpcUrl,
    params.customChainMeta,
  );
  const account = privateKeyToAccount(privateKey);
  const authorization: {
    account: typeof account;
    contractAddress: `0x${string}`;
    chainId: number;
    nonce?: number;
    executor?: "self";
  } = {
    account,
    contractAddress: params.contractAddress,
    chainId: params.chainId,
  };
  if (params.nonce !== undefined) authorization.nonce = params.nonce;
  else if (params.selfExecuted) authorization.executor = "self";
  return signAuthorization(client, authorization as any);
}
