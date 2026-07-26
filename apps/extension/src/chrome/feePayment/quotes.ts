import { WALLETCHAN_PIMLICO_PROXY_BASE } from "@/constants/externalUrls";
import { getAccountById } from "../accountStorage";
import type { PendingBatchTxRequest } from "../erc5792Types";
import { getPendingBatchTxRequestById } from "../requests/pendingBatchTxStorage";
import type { PendingTxRequest } from "../requests/pendingTxStorage";
import { getPendingTxRequestById } from "../requests/pendingTxStorage";
import type { Account } from "../types";
import { createDummyFeePaymentAuthorization } from "./authorization";
import {
  getFeePaymentChainContext,
  getFeeTokenAllowance,
  getFeeTokenBalance,
} from "./chainState";
import { PimlicoClient } from "./pimlicoClient";
import {
  prepareTokenUserOperation,
  type PreparedTokenUserOperation,
} from "./prepareUserOperation";
import type { Address, Hex } from "./pimlicoTypes";
import { getPimlicoFeeToken, type PimlicoFeeToken } from "./tokens";
import type { FeePaymentCall } from "./userOperation";
import { getSafeProposal } from "../safe/proposalRepository";
import { buildSafeExecutionData } from "../safe/executionData";
import { hasUnresolvedSafeExecution } from "../safe/executionPolicy";
import { isSafeFeeTokenExecutorAccount } from "../safe/accountTypePolicy";
import { parseInternalSwapFeePaymentPayload } from "./internalSwap";

const QUOTE_TTL_MS = 45_000;
const MAX_QUOTES = 30;

export interface PreparedFeePaymentQuote {
  id: string;
  family: "transaction" | "batchTransaction" | "safeExecution" | "internalSwap";
  requestId: string;
  accountId: string;
  accountAddress: Address;
  chainId: number;
  fingerprint: string;
  token: PimlicoFeeToken;
  prepared: PreparedTokenUserOperation;
  needsAuthorization: boolean;
  eoaNonce: number | null;
  expiresAt: number;
}

function singleCalls(pending: PendingTxRequest): FeePaymentCall[] {
  if (!pending.tx.to || !/^0x[0-9a-fA-F]{40}$/.test(pending.tx.to)) {
    throw new Error("Token gas payment does not support contract deployment");
  }
  return [{
    to: pending.tx.to as Address,
    value: BigInt(pending.tx.value ?? "0x0"),
    data: (pending.tx.data ?? "0x") as Hex,
  }];
}

function batchCalls(pending: PendingBatchTxRequest): FeePaymentCall[] {
  return pending.params.calls.map((call, index) => {
    if (!call.to || !/^0x[0-9a-fA-F]{40}$/.test(call.to)) {
      throw new Error(`Call ${index + 1} is a contract deployment`);
    }
    return {
      to: call.to as Address,
      value: BigInt(call.value ?? "0x0"),
      data: (call.data ?? "0x") as Hex,
    };
  });
}

export function feePaymentSafeExecutionCalls(input: {
  safeAddress: string;
  executionData: string;
}): FeePaymentCall[] {
  if (!/^0x[0-9a-fA-F]{40}$/.test(input.safeAddress) ||
      !/^0x(?:[0-9a-fA-F]{2})*$/.test(input.executionData)) {
    throw new Error("Invalid Safe execution request");
  }
  return [{
    to: input.safeAddress as Address,
    value: 0n,
    data: input.executionData as Hex,
  }];
}

export function fingerprintFeePaymentCalls(
  calls: readonly FeePaymentCall[],
): string {
  return JSON.stringify(calls.map((call) => ({
    to: call.to.toLowerCase(),
    value: (call.value ?? 0n).toString(),
    data: (call.data ?? "0x").toLowerCase(),
  })));
}

export class FeePaymentQuoteStore {
  private readonly quotes = new Map<string, PreparedFeePaymentQuote>();

  constructor(
    private readonly maximum = MAX_QUOTES,
    private readonly now: () => number = Date.now,
  ) {}

  put(quote: PreparedFeePaymentQuote): void {
    this.prune();
    this.quotes.set(quote.id, quote);
  }

  consume(input: {
    quoteId: string;
    family: PreparedFeePaymentQuote["family"];
    requestId: string;
    accountId: string;
    accountAddress: Address;
    calls: FeePaymentCall[];
  }): PreparedFeePaymentQuote {
    const quote = this.quotes.get(input.quoteId);
    this.quotes.delete(input.quoteId);
    if (
      !quote ||
      quote.expiresAt <= this.now() ||
      quote.family !== input.family ||
      quote.requestId !== input.requestId ||
      quote.accountId !== input.accountId ||
      quote.accountAddress.toLowerCase() !== input.accountAddress.toLowerCase() ||
      quote.fingerprint !== fingerprintFeePaymentCalls(input.calls)
    ) {
      throw new Error("Fee-token quote expired or no longer matches this request");
    }
    return quote;
  }

  private prune(): void {
    const now = this.now();
    for (const [id, quote] of this.quotes) {
      if (quote.expiresAt <= now) this.quotes.delete(id);
    }
    while (this.quotes.size >= this.maximum) {
      const first = this.quotes.keys().next().value;
      if (typeof first !== "string") break;
      this.quotes.delete(first);
    }
  }
}

const quoteStore = new FeePaymentQuoteStore();

async function prepareQuote(input: {
  family: PreparedFeePaymentQuote["family"];
  requestId: string;
  account: Exclude<Account, { type: "impersonator" }>;
  chainId: number;
  calls: FeePaymentCall[];
  tokenId: unknown;
}) {
  const token = getPimlicoFeeToken(input.chainId, input.tokenId);
  if (!token) throw new Error("Selected token is unavailable for network fees");
  const sender = input.account.address as Address;
  const context = await getFeePaymentChainContext(input.chainId, sender);
  if (context.needsAuthorization && input.account.type === "bankr") {
    throw new Error("Enable WalletChan's smart account before paying with a token");
  }
  const dummyAuthorization = context.needsAuthorization
    ? createDummyFeePaymentAuthorization({
        chainId: input.chainId,
        currentEoaNonce: context.eoaNonce!,
      })
    : undefined;
  const client = new PimlicoClient(
    `${WALLETCHAN_PIMLICO_PROXY_BASE}/${input.chainId}`,
    input.chainId,
  );
  const prepared = await prepareTokenUserOperation(client, {
    sender,
    nonce: context.userOperationNonce,
    calls: input.calls,
    token: token.address,
    maximumGasCost: token.maximumGasCost,
    getCurrentAllowance: (paymaster) =>
      getFeeTokenAllowance(context.client, token.address, sender, paymaster),
    ...(dummyAuthorization ? { eip7702Auth: dummyAuthorization } : {}),
  });
  const balance = await getFeeTokenBalance(context.client, token.address, sender);
  const sufficientBalance = balance >= prepared.maximumTokenCost;
  const quote: PreparedFeePaymentQuote = {
    id: crypto.randomUUID(),
    family: input.family,
    requestId: input.requestId,
    accountId: input.account.id,
    accountAddress: sender,
    chainId: input.chainId,
    fingerprint: fingerprintFeePaymentCalls(input.calls),
    token,
    prepared,
    needsAuthorization: context.needsAuthorization,
    eoaNonce: context.eoaNonce,
    expiresAt: Date.now() + QUOTE_TTL_MS,
  };
  quoteStore.put(quote);
  return {
    success: true as const,
    tokenId: token.id,
    tokenAddress: token.address,
    tokenSymbol: token.symbol,
    tokenDecimals: token.decimals,
    tokenStablecoin: token.stablecoin,
    quoteId: quote.id,
    maximumTokenCost: quote.prepared.maximumTokenCost.toString(),
    tokenBalance: balance.toString(),
    expiresAt: quote.expiresAt,
    approvalAdded: quote.prepared.approvalAdded,
    approvalAmount: quote.prepared.approvalAmount?.toString() ?? null,
    paymaster: quote.prepared.quote.paymaster,
    userOperationNonce: quote.prepared.userOperation.nonce,
    sufficientBalance,
    needsAuthorization: quote.needsAuthorization,
  };
}

export async function prepareFeePaymentQuote(
  family: "transaction" | "batchTransaction" | "safeExecution" | "internalSwap",
  requestId: string,
  tokenId: unknown,
  accountId?: string,
  requestPayload?: unknown,
) {
  if (family === "transaction") {
    const pending = await getPendingTxRequestById(requestId);
    if (!pending?.accountId) throw new Error("Transaction request not found");
    const account = await getAccountById(pending.accountId);
    if (
      !account ||
      account.type === "impersonator" ||
      (pending.accountAddress &&
        pending.accountAddress.toLowerCase() !== account.address.toLowerCase())
    ) {
      throw new Error("Pending request account is no longer available");
    }
    return prepareQuote({
      family,
      requestId,
      account,
      chainId: pending.tx.chainId,
      calls: singleCalls(pending),
      tokenId,
    });
  }
  if (family === "safeExecution") {
    const [proposal, account] = await Promise.all([
      getSafeProposal(requestId),
      accountId ? getAccountById(accountId) : null,
    ]);
    if (!proposal || proposal.state !== "readyToExecute" || hasUnresolvedSafeExecution(proposal)) {
      throw new Error("Safe proposal is not ready to execute");
    }
    if (!account || !isSafeFeeTokenExecutorAccount(account)) {
      throw new Error("Safe execution account cannot pay gas with a token");
    }
    return prepareQuote({
      family,
      requestId,
      account,
      chainId: proposal.chainId,
      calls: feePaymentSafeExecutionCalls({
        safeAddress: proposal.safeAddress,
        executionData: buildSafeExecutionData(proposal),
      }),
      tokenId,
    });
  }
  if (family === "internalSwap") {
    const [account, payload] = await Promise.all([
      accountId ? getAccountById(accountId) : null,
      Promise.resolve().then(() => parseInternalSwapFeePaymentPayload(requestPayload)),
    ]);
    if (!account || account.type === "impersonator" || account.type === "ledger") {
      throw new Error("Swap account cannot pay gas with a token");
    }
    return prepareQuote({
      family,
      requestId,
      account,
      chainId: payload.chainId,
      calls: payload.calls,
      tokenId,
    });
  }
  const pending = await getPendingBatchTxRequestById(requestId);
  if (!pending?.accountId) throw new Error("Batch request not found");
  const account = await getAccountById(pending.accountId);
  if (
    !account ||
    account.type === "impersonator" ||
    (pending.accountAddress &&
      pending.accountAddress.toLowerCase() !== account.address.toLowerCase())
  ) {
    throw new Error("Pending request account is no longer available");
  }
  return prepareQuote({
    family,
    requestId,
    account,
    chainId: pending.chainId,
    calls: batchCalls(pending),
    tokenId,
  });
}

export function consumeFeePaymentQuote(input: {
  quoteId: string;
  family: PreparedFeePaymentQuote["family"];
  requestId: string;
  account: Exclude<Account, { type: "impersonator" }>;
  calls: FeePaymentCall[];
}): PreparedFeePaymentQuote {
  return quoteStore.consume({
    quoteId: input.quoteId,
    family: input.family,
    requestId: input.requestId,
    accountId: input.account.id,
    accountAddress: input.account.address as Address,
    calls: input.calls,
  });
}

export { batchCalls as feePaymentBatchCalls, singleCalls as feePaymentSingleCalls };
