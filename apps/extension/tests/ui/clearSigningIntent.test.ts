import assert from "node:assert/strict";
import test from "node:test";

import {
  applyFormat,
  resolveIntentText,
  runtimeTokenMetadataKey,
  type RenderInput,
} from "../../src/lib/clearSigning/applyFormat";
import type {
  Erc7730Descriptor,
  Erc7730Format,
} from "../../src/lib/clearSigning/types";
import {
  collectRuntimeTokenReferences,
  toRuntimeTokenMetadataHint,
} from "../../src/components/ClearSigning/model/runtimeTokenMetadata";

const chainId = 8453;
const tokenAddress = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
const permit2Address = "0x000000000022d473030f116ddee9f6b43ac78ba3";

const format: Erc7730Format = {
  interpolatedIntent: "Transfer {permitted.amount}",
  fields: [
    {
      path: "permitted",
      label: "",
      fields: [
        {
          path: "amount",
          label: "Amount",
          format: "tokenAmount",
          params: { tokenPath: "token" },
        },
      ],
    },
  ],
};

const descriptor: Erc7730Descriptor = {};
const baseInput: RenderInput = {
  chainId,
  data: {
    permitted: {
      token: tokenAddress,
      amount: "1000000",
    },
  },
  envelope: { to: permit2Address },
};

test("Permit2 intent formats base units with runtime ERC-20 metadata", () => {
  const input: RenderInput = {
    ...baseInput,
    tokenMetadata: {
      [runtimeTokenMetadataKey(chainId, tokenAddress)]: {
        symbol: "USDC",
        decimals: 6,
      },
    },
  };

  assert.equal(resolveIntentText(format, input, descriptor), "Transfer 1 USDC");
});

test("Permit2 intent is identical for every signing wallet type", () => {
  const input: RenderInput = {
    ...baseInput,
    tokenMetadata: {
      [runtimeTokenMetadataKey(chainId, tokenAddress)]: {
        symbol: "USDC",
        decimals: 6,
      },
    },
  };
  const signingWalletTypes = [
    "bankr",
    "privateKey",
    "seedPhrase",
    "ledger",
  ] as const;

  for (const accountType of signingWalletTypes) {
    assert.equal(
      resolveIntentText(format, input, descriptor),
      "Transfer 1 USDC",
      accountType,
    );
  }
});

test("Permit2 intent retains raw base units when token metadata is unavailable", () => {
  assert.equal(
    resolveIntentText(format, baseInput, descriptor),
    "Transfer 1000000",
  );
});

test("runtime token discovery traverses nested clear-signing fields", () => {
  const fields = applyFormat(format, baseInput, descriptor);

  assert.deepEqual(collectRuntimeTokenReferences(fields, chainId), [
    { chainId, tokenAddress },
  ]);
  assert.deepEqual(
    toRuntimeTokenMetadataHint({
      symbol: "USDC",
      decimals: 6,
      logoUrl: "https://example.com/usdc.png",
    }),
    {
      symbol: "USDC",
      decimals: 6,
      logoUrl: "https://example.com/usdc.png",
    },
  );
  assert.equal(
    toRuntimeTokenMetadataHint({ symbol: "USDC" }),
    null,
  );
  assert.equal(
    toRuntimeTokenMetadataHint({ symbol: "USDC", decimals: 256 }),
    null,
  );
});
