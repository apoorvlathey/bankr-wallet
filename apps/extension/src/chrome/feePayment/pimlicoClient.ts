import { fetchJsonBounded } from "@/chrome/network/boundedHttp";
import {
  ENTRY_POINT_V07,
  WALLETCHAN_OFFICIAL_DELEGATION_CODE,
} from "./constants";
import { getFeePaymentProviderErrorMessage } from "./errors";
import type {
  Address,
  Hex,
  PackedUserOperationV07,
  PimlicoGasPrice,
  PimlicoGasPriceTiers,
  PimlicoPaymasterData,
  PimlicoTokenQuote,
  UserOperationGasEstimate,
  UserOperationReceipt,
} from "./pimlicoTypes";

const REQUEST_TIMEOUT_MS = 15_000;
const MAX_RESPONSE_BYTES = 128_000;
const QUANTITY_PATTERN = /^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/;
const DATA_PATTERN = /^0x(?:[0-9a-fA-F]{2})*$/;
const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export class PimlicoRpcError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly httpStatus?: number,
    readonly definitive = false,
  ) {
    super(message);
    this.name = "PimlicoRpcError";
  }
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new PimlicoRpcError(`Invalid ${label} response`);
  }
  return value as Record<string, unknown>;
}

function quantity(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !QUANTITY_PATTERN.test(value)) {
    throw new PimlicoRpcError(`Invalid ${label}`);
  }
  return value as Hex;
}

function hexData(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !DATA_PATTERN.test(value)) {
    throw new PimlicoRpcError(`Invalid ${label}`);
  }
  return value as Hex;
}

function hash(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new PimlicoRpcError(`Invalid ${label}`);
  }
  return value as Hex;
}

function address(value: unknown, label: string): Address {
  if (typeof value !== "string" || !ADDRESS_PATTERN.test(value)) {
    throw new PimlicoRpcError(`Invalid ${label}`);
  }
  return value as Address;
}

function optionalQuantity(value: unknown, label: string): Hex | undefined {
  return value === undefined ? undefined : quantity(value, label);
}

function parseTokenQuote(value: unknown): PimlicoTokenQuote {
  const quote = object(value, "token quote");
  return {
    paymaster: address(quote.paymaster, "token quote paymaster"),
    token: address(quote.token, "token quote token"),
    postOpGas: quantity(quote.postOpGas, "token quote postOpGas"),
    exchangeRate: quantity(quote.exchangeRate, "token quote exchangeRate"),
    exchangeRateNativeToUsd: quantity(
      quote.exchangeRateNativeToUsd,
      "token quote native USD rate",
    ),
    balanceSlot: quantity(quote.balanceSlot, "token quote balanceSlot"),
    allowanceSlot: quantity(quote.allowanceSlot, "token quote allowanceSlot"),
  };
}

function parsePaymasterData(value: unknown): PimlicoPaymasterData {
  const data = object(value, "paymaster data");
  return {
    paymaster: address(data.paymaster, "paymaster"),
    paymasterData: hexData(data.paymasterData, "paymasterData"),
    paymasterVerificationGasLimit: optionalQuantity(
      data.paymasterVerificationGasLimit,
      "paymasterVerificationGasLimit",
    ),
    paymasterPostOpGasLimit: optionalQuantity(
      data.paymasterPostOpGasLimit,
      "paymasterPostOpGasLimit",
    ),
  };
}

function parseGasPrice(value: unknown, label: string): PimlicoGasPrice {
  const gasPrice = object(value, label);
  return {
    maxFeePerGas: quantity(gasPrice.maxFeePerGas, `${label} maxFeePerGas`),
    maxPriorityFeePerGas: quantity(
      gasPrice.maxPriorityFeePerGas,
      `${label} maxPriorityFeePerGas`,
    ),
  };
}

function parseGasEstimate(value: unknown): UserOperationGasEstimate {
  const estimate = object(value, "gas estimate");
  return {
    preVerificationGas: quantity(estimate.preVerificationGas, "preVerificationGas"),
    verificationGasLimit: quantity(
      estimate.verificationGasLimit,
      "verificationGasLimit",
    ),
    callGasLimit: quantity(estimate.callGasLimit, "callGasLimit"),
    paymasterVerificationGasLimit: optionalQuantity(
      estimate.paymasterVerificationGasLimit,
      "paymasterVerificationGasLimit",
    ),
    paymasterPostOpGasLimit: optionalQuantity(
      estimate.paymasterPostOpGasLimit,
      "paymasterPostOpGasLimit",
    ),
  };
}

function parseReceipt(value: unknown): UserOperationReceipt | null {
  if (value === null) return null;
  const result = object(value, "UserOperation receipt");
  if (typeof result.success !== "boolean") {
    throw new PimlicoRpcError("Invalid UserOperation receipt success");
  }
  return {
    userOpHash: hash(result.userOpHash, "UserOperation hash"),
    sender: address(result.sender, "UserOperation sender"),
    nonce: quantity(result.nonce, "UserOperation nonce"),
    success: result.success,
    actualGasCost: quantity(result.actualGasCost, "actualGasCost"),
    actualGasUsed: quantity(result.actualGasUsed, "actualGasUsed"),
    receipt: object(result.receipt, "transaction receipt"),
  };
}

export class PimlicoClient {
  private requestId = 0;

  constructor(
    private readonly proxyUrl: string,
    private readonly chainId: number,
  ) {
    const parsed = new URL(proxyUrl);
    if (parsed.protocol !== "https:" && parsed.hostname !== "localhost") {
      throw new Error("Pimlico proxy URL must use HTTPS");
    }
    if (!Number.isSafeInteger(chainId) || chainId <= 0) {
      throw new Error("Pimlico chain ID must be a positive integer");
    }
  }

  private async request(method: string, params: unknown[]): Promise<unknown> {
    const id = ++this.requestId;
    const { response, data } = await fetchJsonBounded(
      this.proxyUrl,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
      },
      {
        timeoutMs: REQUEST_TIMEOUT_MS,
        maxBytes: MAX_RESPONSE_BYTES,
        invalidMessage: "Pimlico proxy returned invalid JSON",
      },
    );
    if (!response.ok) {
      const responseBody = data && typeof data === "object" && !Array.isArray(data)
        ? data as Record<string, unknown>
        : null;
      const message = typeof responseBody?.error === "string"
        ? responseBody.error
        : `Pimlico proxy returned HTTP ${response.status}`;
      throw new PimlicoRpcError(
        message,
        undefined,
        response.status,
        response.status < 500,
      );
    }
    const envelope = object(data, "JSON-RPC");
    if (envelope.jsonrpc !== "2.0" || envelope.id !== id) {
      throw new PimlicoRpcError("Mismatched Pimlico JSON-RPC response");
    }
    if (envelope.error !== undefined) {
      const error = object(envelope.error, "JSON-RPC error");
      const providerMessage = typeof error.message === "string"
        ? error.message
        : "Pimlico request failed";
      throw new PimlicoRpcError(
        getFeePaymentProviderErrorMessage(method, providerMessage),
        typeof error.code === "number" ? error.code : undefined,
        undefined,
        true,
      );
    }
    if (!("result" in envelope)) {
      throw new PimlicoRpcError("Pimlico JSON-RPC response omitted result");
    }
    return envelope.result;
  }

  async getTokenQuotes(tokens: Address[]): Promise<PimlicoTokenQuote[]> {
    if (tokens.length === 0 || tokens.some((token) => !ADDRESS_PATTERN.test(token))) {
      throw new PimlicoRpcError("At least one valid fee token is required");
    }
    const response = await this.request("pimlico_getTokenQuotes", [
      { tokens },
      ENTRY_POINT_V07,
      `0x${this.chainId.toString(16)}`,
    ]);
    const result = Array.isArray(response)
      ? response
      : object(response, "token quotes").quotes;
    if (!Array.isArray(result)) {
      throw new PimlicoRpcError("Invalid token quotes response");
    }
    const requested = new Set(tokens.map((token) => token.toLowerCase()));
    const seen = new Set<string>();
    return result.map((value) => {
      const quote = parseTokenQuote(value);
      const token = quote.token.toLowerCase();
      if (!requested.has(token) || seen.has(token)) {
        throw new PimlicoRpcError("Pimlico returned an unexpected token quote");
      }
      seen.add(token);
      return quote;
    });
  }

  async getPaymasterData(
    userOperation: PackedUserOperationV07,
    token: Address,
    expectedPaymaster: Address,
  ): Promise<PimlicoPaymasterData> {
    const data = parsePaymasterData(
      await this.request("pm_getPaymasterData", [
        userOperation,
        ENTRY_POINT_V07,
        `0x${this.chainId.toString(16)}`,
        { token },
      ]),
    );
    if (data.paymaster.toLowerCase() !== expectedPaymaster.toLowerCase()) {
      throw new PimlicoRpcError("Pimlico changed the quoted paymaster");
    }
    return data;
  }

  async getPaymasterStubData(
    userOperation: PackedUserOperationV07,
    token: Address,
    expectedPaymaster: Address,
  ): Promise<PimlicoPaymasterData> {
    const data = parsePaymasterData(
      await this.request("pm_getPaymasterStubData", [
        userOperation,
        ENTRY_POINT_V07,
        `0x${this.chainId.toString(16)}`,
        { token },
      ]),
    );
    if (data.paymaster.toLowerCase() !== expectedPaymaster.toLowerCase()) {
      throw new PimlicoRpcError("Pimlico changed the quoted paymaster");
    }
    return data;
  }

  async getUserOperationGasPrice(): Promise<PimlicoGasPriceTiers> {
    const result = object(
      await this.request("pimlico_getUserOperationGasPrice", []),
      "UserOperation gas price",
    );
    return {
      slow: parseGasPrice(result.slow, "slow gas price"),
      standard: parseGasPrice(result.standard, "standard gas price"),
      fast: parseGasPrice(result.fast, "fast gas price"),
    };
  }

  async estimateUserOperationGas(
    userOperation: PackedUserOperationV07,
  ): Promise<UserOperationGasEstimate> {
    // A dummy authorization cannot recover to the real sender. Simulate a
    // fresh EOA with only WalletChan's exact official delegation designator,
    // while retaining eip7702Auth so the bundler accounts for its gas cost.
    const stateOverride = userOperation.eip7702Auth
      ? {
          [userOperation.sender]: {
            code: WALLETCHAN_OFFICIAL_DELEGATION_CODE,
          },
        }
      : undefined;
    return parseGasEstimate(
      await this.request("eth_estimateUserOperationGas", [
        userOperation,
        ENTRY_POINT_V07,
        ...(stateOverride ? [stateOverride] : []),
      ]),
    );
  }

  async sendUserOperation(
    userOperation: PackedUserOperationV07,
  ): Promise<Hex> {
    return hash(
      await this.request("eth_sendUserOperation", [
        userOperation,
        ENTRY_POINT_V07,
      ]),
      "UserOperation hash",
    );
  }

  async getUserOperationReceipt(
    userOperationHash: Hex,
  ): Promise<UserOperationReceipt | null> {
    const receipt = parseReceipt(
      await this.request("eth_getUserOperationReceipt", [userOperationHash]),
    );
    if (
      receipt &&
      receipt.userOpHash.toLowerCase() !== userOperationHash.toLowerCase()
    ) {
      throw new PimlicoRpcError("Pimlico returned a receipt for a different UserOperation");
    }
    return receipt;
  }
}
