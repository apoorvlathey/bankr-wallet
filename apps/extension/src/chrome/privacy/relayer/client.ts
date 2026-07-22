import {
  decodeAbiParameters,
  getAddress,
  recoverTypedDataAddress,
  type Address,
} from "viem";

import { fetchJsonBounded } from "../../network/boundedHttp";
import { PRIVACY_POOLS_DEPLOYMENT } from "../deployment/manifest";
import {
  parsePrivacyRelayerDetails,
  parsePrivacyRelayerQuote,
  parsePrivacyRelayerSubmission,
  PRIVACY_RELAYER_MAX_QUOTE_LIFETIME_MS,
  PRIVACY_RELAYER_MAX_RESPONSE_BYTES,
  PRIVACY_RELAYER_QUOTE_TIMEOUT_MS,
  PRIVACY_RELAYER_SUBMIT_TIMEOUT_MS,
  type PrivacyRelayerDetails,
  type PrivacyRelayerQuote,
  type PrivacyRelayerQuoteSelection,
  type PrivacyRelayerSubmission,
} from "./types";
import type { PrivacyGroth16Proof } from "../prover/messages";
import type {
  PrivacyUnshieldDetailsV1,
  PrivacyUnshieldSummaryV1,
} from "../withdrawals/types";

const WITHDRAWAL_DATA_ABI = [
  { name: "recipient", type: "address" },
  { name: "feeRecipient", type: "address" },
  { name: "relayFeeBPS", type: "uint256" },
] as const;

const RELAYER_COMMITMENT_TYPES = {
  RelayerCommitment: [
    { name: "withdrawalData", type: "bytes" },
    { name: "asset", type: "address" },
    { name: "expiration", type: "uint256" },
    { name: "amount", type: "uint256" },
    { name: "extraGas", type: "bool" },
  ],
} as const;

type RelayerPin = typeof PRIVACY_POOLS_DEPLOYMENT.services.relayers[number];

export class PrivacyRelayerSubmissionError extends Error {
  constructor(readonly kind: "rejected" | "ambiguous") {
    super(kind);
    this.name = "PrivacyRelayerSubmissionError";
  }
}

/** A fully verified quote that the active Entrypoint would reject onchain. */
export class PrivacyRelayerFeeCapError extends Error {
  readonly relayerName: string;
  readonly feeBPS: bigint;
  readonly maxFeeBPS: bigint;
  readonly expiresAt: number;

  constructor(selection: Pick<
    PrivacyRelayerQuoteSelection,
    "relayerName" | "feeBPS" | "expiresAt"
  >) {
    super("relay-fee-cap-exceeded");
    this.name = "PrivacyRelayerFeeCapError";
    this.relayerName = selection.relayerName;
    this.feeBPS = selection.feeBPS;
    this.maxFeeBPS = PRIVACY_POOLS_DEPLOYMENT.assetConfig.maxRelayFeeBPS;
    this.expiresAt = selection.expiresAt;
  }
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function relayerUrl(pin: RelayerPin, path: string): URL {
  const base = new URL(pin.url);
  if (base.protocol !== "https:" || base.pathname !== "/" || base.search || base.hash) {
    throw new Error("Invalid pinned Privacy Pools relayer");
  }
  return new URL(path, base);
}

async function fetchDetails(pin: RelayerPin): Promise<PrivacyRelayerDetails> {
  const url = relayerUrl(pin, "/relayer/details");
  url.searchParams.set("chainId", String(PRIVACY_POOLS_DEPLOYMENT.chainId));
  url.searchParams.set("assetAddress", PRIVACY_POOLS_DEPLOYMENT.nativeAsset);
  const { response, data } = await fetchJsonBounded(
    url,
    { method: "GET", headers: { Accept: "application/json" } },
    {
      timeoutMs: PRIVACY_RELAYER_QUOTE_TIMEOUT_MS,
      maxBytes: PRIVACY_RELAYER_MAX_RESPONSE_BYTES,
      invalidMessage: "Relayer details were invalid",
    },
  );
  if (!response.ok) throw new Error("Relayer details were unavailable");
  const details = parsePrivacyRelayerDetails(data);
  if (!details || !sameAddress(details.assetAddress, PRIVACY_POOLS_DEPLOYMENT.nativeAsset)) {
    throw new Error("Relayer details did not match the active ETH pool");
  }
  return details;
}

async function fetchQuote(
  pin: RelayerPin,
  amountWei: bigint,
  recipient: Address,
): Promise<PrivacyRelayerQuote> {
  const { response, data } = await fetchJsonBounded(
    relayerUrl(pin, "/relayer/quote"),
    {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({
        chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
        amount: amountWei.toString(),
        asset: PRIVACY_POOLS_DEPLOYMENT.nativeAsset,
        recipient,
        extraGas: false,
      }),
    },
    {
      timeoutMs: PRIVACY_RELAYER_QUOTE_TIMEOUT_MS,
      maxBytes: PRIVACY_RELAYER_MAX_RESPONSE_BYTES,
      invalidMessage: "Relayer quote was invalid",
    },
  );
  if (!response.ok) throw new Error("Relayer quote was unavailable");
  const quote = parsePrivacyRelayerQuote(data);
  if (!quote) throw new Error("Relayer quote was invalid");
  return quote;
}

export async function verifyPrivacyRelayerQuote(input: {
  pin: RelayerPin;
  details: PrivacyRelayerDetails;
  quote: PrivacyRelayerQuote;
  amountWei: bigint;
  recipient: Address;
  now?: number;
}): Promise<PrivacyRelayerQuoteSelection> {
  const now = input.now ?? Date.now();
  const { quote, details } = input;
  if (
    input.amountWei < details.minWithdrawAmount ||
    quote.feeCommitment.amount !== input.amountWei ||
    !sameAddress(quote.feeCommitment.asset, PRIVACY_POOLS_DEPLOYMENT.nativeAsset) ||
    quote.baseFeeBPS !== details.feeBPS ||
    quote.feeBPS < quote.baseFeeBPS ||
    quote.gasPrice > details.maxGasPrice ||
    quote.relayCostWei !== quote.relayGas * quote.gasPrice ||
    quote.feeCommitment.expiration <= now ||
    quote.feeCommitment.expiration > now + PRIVACY_RELAYER_MAX_QUOTE_LIFETIME_MS
  ) throw new Error("Relayer quote failed policy checks");

  const expectedFeeBPS = quote.baseFeeBPS +
    (quote.relayCostWei * 10_000n) / input.amountWei;
  if (quote.feeBPS !== expectedFeeBPS) {
    throw new Error("Relayer fee calculation did not match");
  }

  const [recipient, feeRecipient, relayFeeBPS] = decodeAbiParameters(
    WITHDRAWAL_DATA_ABI,
    quote.feeCommitment.withdrawalData,
  );
  if (
    !sameAddress(recipient, input.recipient) ||
    !sameAddress(feeRecipient, details.feeReceiverAddress) ||
    relayFeeBPS !== quote.feeBPS
  ) throw new Error("Relayer withdrawal data did not match");

  const signerAddress = getAddress(await recoverTypedDataAddress({
    domain: {
      name: "Privacy Pools Relayer",
      version: "1",
      chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
    },
    types: RELAYER_COMMITMENT_TYPES,
    primaryType: "RelayerCommitment",
    message: {
      withdrawalData: quote.feeCommitment.withdrawalData,
      asset: quote.feeCommitment.asset,
      expiration: BigInt(quote.feeCommitment.expiration),
      amount: quote.feeCommitment.amount,
      extraGas: false,
    },
    signature: quote.feeCommitment.signedRelayerCommitment,
  }));
  const expectedSigner = input.pin.signerPolicy === "pinned"
    ? input.pin.signerAddress
    : details.feeReceiverAddress;
  if (!sameAddress(signerAddress, expectedSigner)) {
    throw new Error("Relayer quote signature did not match");
  }

  if (quote.feeBPS > PRIVACY_POOLS_DEPLOYMENT.assetConfig.maxRelayFeeBPS) {
    throw new PrivacyRelayerFeeCapError({
      relayerName: input.pin.name,
      feeBPS: quote.feeBPS,
      expiresAt: quote.feeCommitment.expiration,
    });
  }
  const relayFeeWei = input.amountWei * quote.feeBPS / 10_000n;
  if (relayFeeWei >= input.amountWei) throw new Error("Relayer fee consumed the withdrawal");
  const selection = Object.freeze({
    ...quote,
    relayerName: input.pin.name,
    relayerUrl: input.pin.url,
    feeReceiverAddress: getAddress(details.feeReceiverAddress),
    signerAddress,
    expiresAt: quote.feeCommitment.expiration,
    netRecipientAmountWei: input.amountWei - relayFeeWei,
  });
  return selection;
}

async function quoteOneRelayer(
  pin: RelayerPin,
  amountWei: bigint,
  recipient: Address,
): Promise<PrivacyRelayerQuoteSelection> {
  const details = await fetchDetails(pin);
  if (amountWei < details.minWithdrawAmount) {
    throw new Error("Withdrawal is below the relayer minimum");
  }
  const quote = await fetchQuote(pin, amountWei, recipient);
  return verifyPrivacyRelayerQuote({ pin, details, quote, amountWei, recipient });
}

/** Query pinned active-profile relayers and return the cheapest verified quote. */
export async function quotePrivacyUnshield(
  amountWei: bigint,
  recipient: Address,
): Promise<PrivacyRelayerQuoteSelection> {
  if (amountWei <= 0n) throw new Error("Invalid Unshield amount");
  const settled = await Promise.allSettled(
    PRIVACY_POOLS_DEPLOYMENT.services.relayers.map((pin) =>
      quoteOneRelayer(pin, amountWei, recipient)
    ),
  );
  settled.forEach((result, index) => {
    if (result.status !== "rejected") return;
    console.warn("[privacy-unshield] relayer quote rejected", {
      relayer: PRIVACY_POOLS_DEPLOYMENT.services.relayers[index]?.name ?? "unknown",
      reason: result.reason instanceof Error ? result.reason.message : "unknown",
    });
  });
  const valid = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : []
  );
  if (valid.length === 0) {
    const overCap = settled.flatMap((result) =>
      result.status === "rejected" && result.reason instanceof PrivacyRelayerFeeCapError
        ? [result.reason]
        : []
    );
    overCap.sort((left, right) =>
      left.feeBPS < right.feeBPS ? -1 :
        left.feeBPS > right.feeBPS ? 1 :
          left.expiresAt - right.expiresAt
    );
    if (overCap[0]) throw overCap[0];
    throw new Error("No valid Privacy Pools relayer quote");
  }
  valid.sort((left, right) =>
    left.feeBPS < right.feeBPS ? -1 :
      left.feeBPS > right.feeBPS ? 1 :
        left.expiresAt - right.expiresAt
  );
  return valid[0];
}

export async function submitPrivacyUnshieldToRelayer(input: {
  summary: PrivacyUnshieldSummaryV1;
  details: PrivacyUnshieldDetailsV1;
  proof: PrivacyGroth16Proof;
  publicSignals: readonly string[];
  beforeSubmit?: () => void;
}): Promise<PrivacyRelayerSubmission> {
  const pin = PRIVACY_POOLS_DEPLOYMENT.services.relayers.find(
    (candidate) => candidate.url === input.details.relayerUrl,
  );
  if (!pin || input.publicSignals.length !== 8) {
    throw new Error("Invalid Unshield relayer request");
  }
  const details = await fetchDetails(pin);
  const quote: PrivacyRelayerQuote = {
    baseFeeBPS: BigInt(input.details.baseFeeBPS),
    feeBPS: BigInt(input.summary.feeBPS),
    gasPrice: BigInt(input.details.gasPrice),
    relayGas: BigInt(input.details.relayGas),
    relayCostWei: BigInt(input.details.relayCostWei),
    feeCommitment: {
      ...input.details.feeCommitment,
      amount: BigInt(input.details.feeCommitment.amount),
    },
  };
  const verified = await verifyPrivacyRelayerQuote({
    pin,
    details,
    quote,
    amountWei: BigInt(input.summary.amountWei),
    recipient: input.summary.recipient,
  });
  if (
    verified.netRecipientAmountWei !== BigInt(input.summary.netRecipientAmountWei) ||
    !sameAddress(verified.signerAddress, input.details.signerAddress) ||
    !sameAddress(verified.feeReceiverAddress, input.details.feeReceiverAddress)
  ) throw new Error("Unshield quote binding changed");

  input.beforeSubmit?.();

  let relayResponse: Awaited<ReturnType<typeof fetchJsonBounded>>;
  try {
    relayResponse = await fetchJsonBounded(
      relayerUrl(pin, "/relayer/request"),
      {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
          withdrawal: {
            processooor: PRIVACY_POOLS_DEPLOYMENT.contracts.entrypointProxy.address,
            data: input.details.feeCommitment.withdrawalData,
          },
          proof: input.proof,
          publicSignals: input.publicSignals,
          scope: PRIVACY_POOLS_DEPLOYMENT.scope.toString(),
          chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
          feeCommitment: input.details.feeCommitment,
        }),
      },
      {
        timeoutMs: PRIVACY_RELAYER_SUBMIT_TIMEOUT_MS,
        maxBytes: PRIVACY_RELAYER_MAX_RESPONSE_BYTES,
        invalidMessage: "Relayer submission was invalid",
      },
    );
  } catch {
    throw new PrivacyRelayerSubmissionError("ambiguous");
  }
  const { response, data } = relayResponse;
  if (!response.ok) throw new PrivacyRelayerSubmissionError("rejected");
  const submitted = parsePrivacyRelayerSubmission(data);
  if (!submitted) throw new PrivacyRelayerSubmissionError("ambiguous");
  return submitted;
}
