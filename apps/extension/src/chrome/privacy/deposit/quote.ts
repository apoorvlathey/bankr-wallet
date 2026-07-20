import type { Address } from "viem";

import { getAccountById } from "../../accounts/repository";
import {
  normalizeEvmAccountAddress,
} from "../../accounts/repository";
import type { Account, AccountType } from "../../types";
import { resolvePrivacyPoolsSepoliaRpcUrl } from "../deployment/health";
import { readPrivacyShieldRpcQuote } from "./quoteClient";
import {
  createPrivacyShieldQuoteValues,
  parsePrivacyShieldAmount,
  PrivacyShieldQuoteError,
  type PrivacyShieldQuoteValues,
} from "./quotePolicy";

const MAX_ACCOUNT_ID_LENGTH = 128;
const SUPPORTED_SOURCE_TYPES = new Set<AccountType>([
  "bankr",
  "privateKey",
  "seedPhrase",
]);

export interface PrivacyShieldQuoteRequest {
  readonly accountId: string;
  readonly accountAddress: string;
  readonly accountType: AccountType;
  readonly amount: string;
}

type Dependencies = {
  getAccountById: (id: string) => Promise<Account | null>;
  resolveRpcUrl: () => Promise<string>;
  readRpcQuote: typeof readPrivacyShieldRpcQuote;
};

const productionDependencies: Dependencies = {
  getAccountById,
  resolveRpcUrl: resolvePrivacyPoolsSepoliaRpcUrl,
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
    (!SUPPORTED_SOURCE_TYPES.has(request.accountType) &&
      request.accountType !== "impersonator") ||
    typeof request.amount !== "string"
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
  if (!SUPPORTED_SOURCE_TYPES.has(account.type)) {
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

/** Return an informational Sepolia quote; this module has no signing path. */
export async function quotePrivacyShield(
  request: PrivacyShieldQuoteRequest,
  overrides: Partial<Dependencies> = {},
): Promise<PrivacyShieldQuoteValues> {
  const dependencies = { ...productionDependencies, ...overrides };
  assertQuoteRequest(request);
  const amountWei = parsePrivacyShieldAmount(request.amount);
  const account = await dependencies.getAccountById(request.accountId);
  const sourceAddress = assertPinnedSourceAccount(request, account);

  try {
    const rpcUrl = await dependencies.resolveRpcUrl();
    const rpcQuote = await dependencies.readRpcQuote(
      rpcUrl,
      sourceAddress,
      amountWei,
    );
    return createPrivacyShieldQuoteValues({ amountWei, ...rpcQuote });
  } catch (error) {
    if (error instanceof PrivacyShieldQuoteError) throw error;
    throw new PrivacyShieldQuoteError("quote-unavailable");
  }
}
