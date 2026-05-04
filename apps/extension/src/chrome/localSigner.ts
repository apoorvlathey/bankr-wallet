/**
 * Local signing utilities using viem
 * Handles transaction signing and message signing for private key accounts
 *
 * CRITICAL: This module should ONLY be called from background.ts
 * Private keys must NEVER leave the background service worker context
 */

import {
  createWalletClient,
  http,
  type WalletClient,
  type Chain,
  type Transport,
  type LocalAccount,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { VIEM_CHAINS, RPC_URLS, buildCustomViemChain } from "@/constants/chainRegistry";

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
}

export interface SignedTransaction {
  txHash: string;
}

/**
 * Creates a wallet client for a given chain and private key.
 * For custom chains not in CHAIN_REGISTRY, builds a viem Chain dynamically.
 */
function createClient(
  chainId: number,
  privateKey: `0x${string}`,
  rpcUrl?: string,
  customChainMeta?: CustomChainMeta,
): { client: WalletClient<Transport, Chain, LocalAccount>; account: LocalAccount; chain: Chain } {
  let chain = VIEM_CHAINS[chainId];
  if (!chain) {
    const resolvedRpc = rpcUrl || RPC_URLS[chainId];
    if (!resolvedRpc) {
      throw new Error(`Unsupported chain: ${chainId}. No RPC URL available.`);
    }
    chain = buildCustomViemChain(
      chainId,
      customChainMeta?.name ?? `Chain ${chainId}`,
      resolvedRpc,
      customChainMeta?.nativeCurrency,
      customChainMeta?.explorer,
    );
  }

  const account = privateKeyToAccount(privateKey);
  const client = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl || RPC_URLS[chainId], { timeout: 30_000 }),
  });

  return { client, account, chain };
}

/**
 * Signs and broadcasts a transaction
 * Returns the transaction hash
 */
export async function signAndBroadcastTransaction(
  privateKey: `0x${string}`,
  tx: TransactionRequest,
  rpcUrl?: string,
  customChainMeta?: CustomChainMeta,
): Promise<SignedTransaction> {
  const { client, account, chain } = createClient(tx.chainId, privateKey, rpcUrl, customChainMeta);

  // Parse value from hex or decimal string
  let valueInWei: bigint;
  if (tx.value.startsWith("0x")) {
    valueInWei = BigInt(tx.value);
  } else {
    valueInWei = BigInt(tx.value || "0");
  }

  // Build transaction parameters
  const txParams: Parameters<typeof client.sendTransaction>[0] = {
    account,
    to: tx.to ? (tx.to as `0x${string}`) : undefined,
    data: tx.data as `0x${string}`,
    value: valueInWei,
    chain,
  };

  // Add gas parameters if provided
  if (tx.gas) {
    txParams.gas = BigInt(tx.gas);
  }
  if (tx.maxFeePerGas) {
    txParams.maxFeePerGas = BigInt(tx.maxFeePerGas);
  }
  if (tx.maxPriorityFeePerGas) {
    txParams.maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas);
  }
  if (tx.gasPrice) {
    txParams.gasPrice = BigInt(tx.gasPrice);
  }
  if (tx.nonce !== undefined) {
    txParams.nonce = tx.nonce;
  }

  // Send the transaction
  const txHash = await client.sendTransaction(txParams);

  return { txHash };
}

/**
 * Signs a message (personal_sign)
 */
export async function signMessage(
  privateKey: `0x${string}`,
  message: string | Uint8Array,
  chainId: number
): Promise<string> {
  const account = privateKeyToAccount(privateKey);

  // If message is a hex string, convert to bytes
  let messageToSign: string | { raw: Uint8Array };
  if (typeof message === "string") {
    if (message.startsWith("0x")) {
      // Hex-encoded message - convert to raw bytes
      const hex = message.slice(2);
      const bytes = new Uint8Array(
        hex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
      );
      messageToSign = { raw: bytes };
    } else {
      messageToSign = message;
    }
  } else {
    messageToSign = { raw: message };
  }

  const signature = await account.signMessage({
    message: messageToSign,
  });

  return signature;
}

/**
 * Signs typed data (EIP-712)
 */
export async function signTypedData(
  privateKey: `0x${string}`,
  typedData: any,
  chainId: number
): Promise<string> {
  const account = privateKeyToAccount(privateKey);

  // Parse typed data if it's a string
  const data = typeof typedData === "string" ? JSON.parse(typedData) : typedData;

  // Bind to request chain: reject mismatched domain.chainId to prevent
  // cross-chain replay/confusion attacks. Absent chainId is permitted.
  if (data?.domain && data.domain.chainId !== undefined && data.domain.chainId !== null) {
    const domainChainId = Number(data.domain.chainId);
    if (Number.isFinite(domainChainId) && domainChainId !== chainId) {
      throw new Error(
        `Provided chainId "${domainChainId}" must match the active chainId "${chainId}"`,
      );
    }
  }

  const signature = await account.signTypedData({
    domain: data.domain,
    types: data.types,
    primaryType: data.primaryType,
    message: data.message,
  });

  return signature;
}

/**
 * Handles any signature request method
 * Dispatches to the appropriate signing function based on method
 */
export async function handleSignatureRequest(
  privateKey: `0x${string}`,
  method: string,
  params: any[],
  chainId: number
): Promise<string> {
  // Defense in depth: derive the address from the private key and verify
  // it matches the signer address provided in the dapp request.
  const derivedAddress = privateKeyToAccount(privateKey).address.toLowerCase();
  let signerParam: string | undefined;
  if (method === "personal_sign") signerParam = params[1];
  else if (
    method === "eth_sign" ||
    method === "eth_signTypedData" ||
    method === "eth_signTypedData_v3" ||
    method === "eth_signTypedData_v4"
  )
    signerParam = params[0];

  if (
    typeof signerParam === "string" &&
    signerParam.toLowerCase() !== derivedAddress
  ) {
    throw new Error("Signer address does not match active account");
  }

  switch (method) {
    case "personal_sign": {
      // params[0] is the message (hex), params[1] is the address
      const message = params[0];
      return signMessage(privateKey, message, chainId);
    }

    case "eth_sign": {
      // params[0] is the address, params[1] is the data hash
      // eth_sign is dangerous and often disabled, but we'll support it
      const dataHash = params[1];
      return signMessage(privateKey, dataHash, chainId);
    }

    case "eth_signTypedData":
    case "eth_signTypedData_v3":
    case "eth_signTypedData_v4": {
      // params[0] is the address, params[1] is the typed data
      const typedData = params[1];
      return signTypedData(privateKey, typedData, chainId);
    }

    default:
      throw new Error(`Unsupported signature method: ${method}`);
  }
}

/**
 * Derives the address from a private key
 */
export function deriveAddress(privateKey: `0x${string}`): string {
  const account = privateKeyToAccount(privateKey);
  return account.address;
}

/**
 * Validates a private key format
 */
export function isValidPrivateKey(key: string): boolean {
  if (!key.startsWith("0x")) {
    return false;
  }
  if (key.length !== 66) {
    return false;
  }
  // Check if all characters after 0x are valid hex
  return /^0x[0-9a-fA-F]{64}$/.test(key);
}

