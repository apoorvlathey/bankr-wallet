import assert from "node:assert/strict";
import test from "node:test";

import { encodeAbiParameters, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { PRIVACY_POOLS_DEPLOYMENT } from "../../src/chrome/privacy/deployment/manifest";
import {
  PrivacyRelayerFeeCapError,
  verifyPrivacyRelayerQuote,
} from "../../src/chrome/privacy/relayer/client";
import {
  parsePrivacyRelayerDetails,
  parsePrivacyRelayerQuote,
} from "../../src/chrome/privacy/relayer/types";

const account = privateKeyToAccount(
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
);
const recipient = getAddress("0x1111111111111111111111111111111111111111");
const amount = 1_000_000_000_000_000_000n;
const baseFee = 10n;
const gasPrice = 10_000_000_000n;
const relayGas = 650_000n;
const relayCost = gasPrice * relayGas;
const feeBPS = baseFee + relayCost * 10_000n / amount;

async function fixture(
  now = 1_750_000_000_000,
  withdrawalAmount = amount,
) {
  const quotedFeeBPS = baseFee + relayCost * 10_000n / withdrawalAmount;
  const withdrawalData = encodeAbiParameters(
    [
      { name: "recipient", type: "address" },
      { name: "feeRecipient", type: "address" },
      { name: "relayFeeBPS", type: "uint256" },
    ],
    [recipient, account.address, quotedFeeBPS],
  );
  const expiration = now + 60_000;
  const signature = await account.signTypedData({
    domain: {
      name: "Privacy Pools Relayer",
      version: "1",
      chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
    },
    types: {
      RelayerCommitment: [
        { name: "withdrawalData", type: "bytes" },
        { name: "asset", type: "address" },
        { name: "expiration", type: "uint256" },
        { name: "amount", type: "uint256" },
        { name: "extraGas", type: "bool" },
      ],
    },
    primaryType: "RelayerCommitment",
    message: {
      withdrawalData,
      asset: PRIVACY_POOLS_DEPLOYMENT.nativeAsset,
      expiration: BigInt(expiration),
      amount: withdrawalAmount,
      extraGas: false,
    },
  });
  const rawDetails = {
    feeBPS: baseFee.toString(),
    feeReceiverAddress: account.address,
    chainId: PRIVACY_POOLS_DEPLOYMENT.chainId,
    assetAddress: PRIVACY_POOLS_DEPLOYMENT.nativeAsset,
    minWithdrawAmount: "100",
    maxGasPrice: "40000000000",
  };
  const rawQuote = {
    baseFeeBPS: baseFee.toString(),
    feeBPS: quotedFeeBPS.toString(),
    gasPrice: gasPrice.toString(),
    feeCommitment: {
      expiration,
      withdrawalData,
      asset: PRIVACY_POOLS_DEPLOYMENT.nativeAsset,
      amount: withdrawalAmount.toString(),
      extraGas: false,
      signedRelayerCommitment: signature,
    },
    detail: {
      relayTxCost: { gas: relayGas.toString(), eth: relayCost.toString() },
    },
  };
  const details = parsePrivacyRelayerDetails(rawDetails);
  const quote = parsePrivacyRelayerQuote(rawQuote);
  assert.ok(details);
  assert.ok(quote);
  return {
    now,
    withdrawalAmount,
    quotedFeeBPS,
    details,
    quote,
    rawDetails,
    rawQuote,
  };
}

test("strict relayer codecs accept the live Sepolia response shape", async () => {
  const value = await fixture();
  assert.equal(value.details.chainId, 11_155_111);
  assert.equal(value.quote.feeCommitment.amount, amount);
  assert.equal(
    PRIVACY_POOLS_DEPLOYMENT.services.relayers[0].signerAddress,
    "0x696FE46495688fC9e99BAd2dAF2133B33de364eA",
  );
});

test("verified quote binds fee data, recipient, economics, and signer", async () => {
  const value = await fixture();
  const selection = await verifyPrivacyRelayerQuote({
    pin: {
      name: "Fixture Relay",
      url: "https://fixture.invalid",
      signerPolicy: "fee-recipient",
    } as typeof PRIVACY_POOLS_DEPLOYMENT.services.relayers[1],
    details: value.details,
    quote: value.quote,
    amountWei: amount,
    recipient,
    now: value.now,
  });
  assert.equal(selection.signerAddress, account.address);
  assert.equal(selection.feeBPS, feeBPS);
  assert.equal(selection.netRecipientAmountWei, amount - amount * feeBPS / 10_000n);
});

test("quote validation rejects tampered economics and extra response fields", async () => {
  const value = await fixture();
  assert.equal(parsePrivacyRelayerQuote({ ...value.rawQuote, injected: true }), null);
  await assert.rejects(
    verifyPrivacyRelayerQuote({
      pin: {
        name: "Fixture Relay",
        url: "https://fixture.invalid",
        signerPolicy: "fee-recipient",
      } as typeof PRIVACY_POOLS_DEPLOYMENT.services.relayers[1],
      details: value.details,
      quote: { ...value.quote, relayCostWei: value.quote.relayCostWei + 1n },
      amountWei: amount,
      recipient,
      now: value.now,
    }),
    /policy checks/,
  );
});

test("quote validation rejects a signature not controlled by the fee recipient", async () => {
  const value = await fixture();
  await assert.rejects(
    verifyPrivacyRelayerQuote({
      pin: {
        name: "Fixture Relay",
        url: "https://fixture.invalid",
        signerPolicy: "fee-recipient",
      } as typeof PRIVACY_POOLS_DEPLOYMENT.services.relayers[1],
      details: {
        ...value.details,
        feeReceiverAddress: recipient,
      },
      quote: value.quote,
      amountWei: amount,
      recipient,
      now: value.now,
    }),
    /withdrawal data did not match/,
  );
});

test("a signed quote above the Entrypoint cap is retained as a verified diagnostic", async () => {
  const value = await fixture(1_750_000_000_000, 100_000_000_000_000_000n);
  await assert.rejects(
    verifyPrivacyRelayerQuote({
      pin: {
        name: "Fixture Relay",
        url: "https://fixture.invalid",
        signerPolicy: "fee-recipient",
      } as typeof PRIVACY_POOLS_DEPLOYMENT.services.relayers[1],
      details: value.details,
      quote: value.quote,
      amountWei: value.withdrawalAmount,
      recipient,
      now: value.now,
    }),
    (error: unknown) => {
      assert.ok(error instanceof PrivacyRelayerFeeCapError);
      assert.equal(error.relayerName, "Fixture Relay");
      assert.equal(error.feeBPS, value.quotedFeeBPS);
      assert.equal(error.maxFeeBPS, PRIVACY_POOLS_DEPLOYMENT.assetConfig.maxRelayFeeBPS);
      return true;
    },
  );
});

test("a signed quote above 100 percent still becomes a fee-cap diagnostic", async () => {
  const value = await fixture(1_750_000_000_000, 5_000_000_000_000_000n);
  assert.ok(value.quotedFeeBPS > 10_000n);
  await assert.rejects(
    verifyPrivacyRelayerQuote({
      pin: {
        name: "Fixture Relay",
        url: "https://fixture.invalid",
        signerPolicy: "fee-recipient",
      } as typeof PRIVACY_POOLS_DEPLOYMENT.services.relayers[1],
      details: value.details,
      quote: value.quote,
      amountWei: value.withdrawalAmount,
      recipient,
      now: value.now,
    }),
    (error: unknown) => {
      assert.ok(error instanceof PrivacyRelayerFeeCapError);
      assert.equal(error.feeBPS, value.quotedFeeBPS);
      return true;
    },
  );
});
