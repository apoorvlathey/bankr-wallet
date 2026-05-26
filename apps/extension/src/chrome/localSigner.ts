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
  type TransactionReceipt,
  type SignedAuthorization,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { signAuthorization } from "viem/actions";
import {
  VIEM_CHAINS,
  RPC_URLS,
  buildCustomViemChain,
  CHAIN_REGISTRY,
} from "@/constants/chainRegistry";

const SYNC_SEND_TIMEOUT_MS = 5_000;
const CHAIN_BY_ID_LOCAL = new Map(CHAIN_REGISTRY.map((c) => [c.chainId, c]));

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
  /**
   * EIP-7702 type-4 tx fields. When `authorizationList` is set, viem
   * automatically serializes the tx as type 4. The list may be empty when
   * the EOA is already delegated to a 7821-compatible contract — in that
   * case we just send the ERC-7821 calldata against the EOA itself with a
   * standard EIP-1559 tx, no authorization needed.
   *
   * Use signEip7702Authorization() below to build entries.
   */
  type?: "eip7702";
  authorizationList?: readonly SignedAuthorization[];
}

export interface SignedTransaction {
  txHash: string;
  /**
   * Present only when the chain has `supportsSyncSend: true` and the sync
   * send call succeeded. Callers should write the receipt directly to tx
   * history (via `applyReceiptToHistory`) and skip the receipt poller.
   */
  receipt?: TransactionReceipt;
  /**
   * The gas limit we signed the tx with. Passed alongside `receipt` so the
   * sync-send finalization path doesn't need an extra eth_getTransactionByHash
   * RPC call to populate gasData.gasLimit.
   */
  signedGasLimit?: bigint;
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

  // EIP-7702: when an authorization list is attached, viem serializes the tx
  // as type 4. Sync-send is skipped in this case — sync-send chains (MegaETH
  // today) need conservative tx shapes and EIP-7702 hasn't been validated
  // against the sync RPC method yet.
  if (tx.authorizationList && tx.authorizationList.length > 0) {
    (txParams as any).authorizationList = tx.authorizationList;
  }

  // Sync-send path: chains that support EIP-7966 (e.g., MegaETH) return the
  // full receipt in one round trip (~100ms). Sign locally, then post via
  // sendRawTransactionSync. On any failure or timeout, fall through to the
  // standard async send so the user always gets some outcome.
  // Skipped for EIP-7702 type-4 txs — sync-send hasn't been validated against
  // type 4 yet, and the auth-bundle path needs a confirmed inclusion path.
  const chainEntry = CHAIN_BY_ID_LOCAL.get(tx.chainId);
  const isEip7702Tx = !!(tx.authorizationList && tx.authorizationList.length > 0);
  if (chainEntry?.supportsSyncSend && !isEip7702Tx) {
    try {
      // signTransaction needs explicit gas + fee fields, so let viem fill in
      // anything missing first by going through prepareTransactionRequest.
      const prepared = await client.prepareTransactionRequest(txParams);
      const serializedTransaction = await client.signTransaction(prepared);
      // We call the RPC method directly instead of going through viem's
      // sendRawTransactionSync wrapper because viem hex-encodes the timeout
      // (`numberToHex(timeout)` → `"0x1388"`) per EIP-7966, but MegaETH's
      // implementation rejects that with `Invalid params: timeout must be a
      // positive number` and only accepts a plain integer. The receipt comes
      // back in raw RPC shape (status as `0x1`/`0x0`, hex bigints) which
      // applyReceiptToHistory already normalizes.
      const rawReceipt = await client.request({
        method: "eth_sendRawTransactionSync" as any,
        params: [serializedTransaction, SYNC_SEND_TIMEOUT_MS] as any,
      } as any, { retryCount: 0 });
      const receipt = rawReceipt as TransactionReceipt & {
        transactionHash: `0x${string}`;
        status: any;
      };
      return {
        txHash: receipt.transactionHash,
        receipt,
        signedGasLimit: prepared.gas,
      };
    } catch (err) {
      console.warn(
        `[WalletChan] sync send failed on chain ${tx.chainId}, falling back to async:`,
        err,
      );
      // Fall through to standard async path
    }
  }

  // Send the transaction (standard async path)
  const txHash = await client.sendTransaction(txParams);

  return { txHash };
}

/**
 * Sign an EIP-7702 authorization tuple.
 *
 * The signed authorization tells the network "the EOA at signer.address
 * authorizes its `code` to be set to the delegation designator pointing at
 * contractAddress on chainId, valid only while the EOA's nonce equals
 * `nonce`."
 *
 * When the EOA both signs the auth AND broadcasts the bundling tx (the
 * common case for our batch flow), the auth's nonce must be `txNonce + 1`
 * because the tx's own inclusion increments the EOA nonce before the
 * auth list is processed. Pass `executor: "self"` to let viem handle that
 * +1 automatically, OR pass an explicit nonce.
 */
export async function signEip7702Authorization(
  privateKey: `0x${string}`,
  params: {
    contractAddress: `0x${string}`;
    chainId: number;
    /**
     * Explicit auth nonce. When the same EOA submits the tx, pass
     * `txNonce + 1`. Omit + set `selfExecuted: true` to let viem derive
     * it from `eth_getTransactionCount(pending)`.
     */
    nonce?: number;
    selfExecuted?: boolean;
    rpcUrl?: string;
    customChainMeta?: CustomChainMeta;
  },
): Promise<SignedAuthorization> {
  if (params.chainId === 0) {
    throw new Error("EIP-7702 authorization chainId must be chain-specific");
  }

  const { client } = createClient(
    params.chainId,
    privateKey,
    params.rpcUrl,
    params.customChainMeta,
  );
  const account = privateKeyToAccount(privateKey);
  const baseParams: {
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
  if (params.nonce !== undefined) {
    baseParams.nonce = params.nonce;
  } else if (params.selfExecuted) {
    baseParams.executor = "self";
  }
  return signAuthorization(client, baseParams as any);
}

/**
 * Signs a message (personal_sign)
 */
export async function signMessage(
  privateKey: `0x${string}`,
  message: string | Uint8Array
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
      return signMessage(privateKey, message);
    }

    case "eth_sign": {
      // params[0] is the address, params[1] is the data hash
      // eth_sign is dangerous and often disabled, but we'll support it
      const dataHash = params[1];
      return signMessage(privateKey, dataHash);
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
