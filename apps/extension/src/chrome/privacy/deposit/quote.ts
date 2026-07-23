import type { Address } from "viem";

import { getAccountById } from "../../accounts/repository";
import {
  normalizeEvmAccountAddress,
} from "../../accounts/repository";
import type { Account, AccountType } from "../../types";
import { isPrivacyPoolsCustodyAccountType } from "../deployment/accountPolicy";
import { resolvePrivacyPoolsRpcUrl } from "../deployment/health";
import { readPrivacyShieldRpcQuote } from "./quoteClient";
import {
  createPrivacyShieldQuoteValues,
  grossPrivacyShieldAmount,
  parsePrivacyShieldAmount,
  parsePrivacyShieldGrossAmount,
  PrivacyShieldQuoteError,
  type PrivacyShieldQuoteValues,
} from "./quotePolicy";

const MAX_ACCOUNT_ID_LENGTH = 128;
export interface PrivacyShieldQuoteRequest {
  readonly accountId: string;
  readonly accountAddress: string;
  readonly accountType: AccountType;
  readonly amount: string;
  readonly grossAmountWei?: string;
}

type Dependencies = {
  getAccountById: (id: string) => Promise<Account | null>;
  resolveRpcUrl: () => Promise<string>;
  readRpcQuote: typeof readPrivacyShieldRpcQuote;
};

const productionDependencies: Dependencies = {
  getAccountById,
  resolveRpcUrl: resolvePrivacyPoolsRpcUrl,
  readRpcQuote: readPrivacyShieldRpcQuote,
};

function assertQuoteRequest(request: PrivacyShieldQuoteRequest): void {
  if (
    !request ||
    typeof request.accountId !== "string" ||
    request.accountId.length === 0 ||
    request.accountId.length > MAX_ACCOUNT_ID_LENGTH ||
    typeof request.accountAddress !== "string" ||
    request.accountAddress.length !== 42 ||
    typeof request.accountType !== "string" ||
    (!isPrivacyPoolsCustodyAccountType(request.accountType) &&
      request.accountType !== "impersonator") ||
    typeof request.amount !== "string" ||
    (request.grossAmountWei !== undefined &&
      typeof request.grossAmountWei !== "string")
  ) {
    throw new PrivacyShieldQuoteError("invalid-request");
  }
}

export function assertPinnedSourceAccount(
  request: PrivacyShieldQuoteRequest,
  account: Account | null,
): Address {
  if (
    !account ||
    account.id !== request.accountId ||
    account.type !== request.accountType
  ) {
    throw new PrivacyShieldQuoteError("account-unavailable");
  }
  if (account.type === "impersonator") {
    throw new PrivacyShieldQuoteError("view-only-account");
  }
  if (!isPrivacyPoolsCustodyAccountType(account.type)) {
    throw new PrivacyShieldQuoteError("account-unavailable");
  }

  let requestedAddress: string;
  let storedAddress: string;
  try {
    requestedAddress = normalizeEvmAccountAddress(request.accountAddress);
    storedAddress = normalizeEvmAccountAddress(account.address);
  } catch {
    throw new PrivacyShieldQuoteError("account-unavailable");
  }
  if (requestedAddress !== storedAddress) {
    throw new PrivacyShieldQuoteError("account-unavailable");
  }
  return requestedAddress as Address;
}

/** Return an informational active-profile quote; this module has no signing path. */
export async function quotePrivacyShield(
  request: PrivacyShieldQuoteRequest,
  overrides: Partial<Dependencies> = {},
): Promise<PrivacyShieldQuoteValues> {
  const dependencies = { ...productionDependencies, ...overrides };
  assertQuoteRequest(request);
  const shieldedAmountWei = parsePrivacyShieldAmount(request.amount);
  let amountWei = grossPrivacyShieldAmount(shieldedAmountWei);
  if (request.grossAmountWei !== undefined) {
    amountWei = parsePrivacyShieldGrossAmount(
      request.grossAmountWei,
      shieldedAmountWei,
    );
  }
  const account = await dependencies.getAccountById(request.accountId);
  const sourceAddress = assertPinnedSourceAccount(request, account);

  try {
    const rpcUrl = await dependencies.resolveRpcUrl();
    if (request.grossAmountWei !== undefined) {
      const rpcQuote = await dependencies.readRpcQuote(
        rpcUrl,
        sourceAddress,
        amountWei,
      );
      return createPrivacyShieldQuoteValues({
        shieldedAmountWei,
        amountWei,
        ...rpcQuote,
      });
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const rpcQuote = await dependencies.readRpcQuote(
        rpcUrl,
        sourceAddress,
        amountWei,
      );
      const quote = createPrivacyShieldQuoteValues({
        shieldedAmountWei,
        ...rpcQuote,
      });
      if (quote.amountWei === amountWei.toString()) return quote;
      amountWei = BigInt(quote.amountWei);
    }
    throw new PrivacyShieldQuoteError("quote-unavailable");
  } catch (error) {
    if (error instanceof PrivacyShieldQuoteError) throw error;
    throw new PrivacyShieldQuoteError("quote-unavailable");
  }
}
