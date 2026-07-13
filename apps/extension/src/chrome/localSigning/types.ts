/** Explicit data contracts shared by local-signing modules. */

import type {
  Chain,
  LocalAccount,
  SignedAuthorization,
  TransactionReceipt,
  Transport,
  WalletClient,
} from "viem";

export interface CustomChainMeta {
  name: string;
  nativeCurrency?: { name: string; symbol: string; decimals: number };
  explorer?: string;
}

export interface TransactionRequest {
  from: string;
  to: string | null;
  data: string;
  value: string;
  chainId: number;
  gas?: string;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: number;
  type?: "eip7702";
  authorizationList?: readonly SignedAuthorization[];
}

export interface SignedTransaction {
  txHash: string;
  receipt?: TransactionReceipt;
  signedGasLimit?: bigint;
  broadcastUncertain?: true;
}

export type RawBroadcastClient = Pick<
  WalletClient<Transport, Chain, LocalAccount>,
  "request"
>;

export type PrepareAndSignClient = Pick<
  WalletClient<Transport, Chain, LocalAccount>,
  "prepareTransactionRequest" | "signTransaction" | "request"
>;

export type BeforeLocalTransactionBroadcast = () => Promise<void>;
