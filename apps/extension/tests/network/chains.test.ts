import assert from "node:assert/strict";
import test from "node:test";

import {
  CHAIN_REGISTRY,
  DEFAULT_NETWORKS,
  ZEROX_SUPPORTED_CHAIN_IDS,
} from "../../src/constants/chainRegistry";
import {
  getVisibleChains,
  MAX_SAVED_RPC_URLS,
  normalizeNetworksInfo,
  normalizeSavedRpcUrls,
} from "../../src/lib/chains";
import {
  getChainEnvironmentLabel,
  resolveChainIconMeta,
} from "../../src/lib/chainIcons";

const DEFAULT_HIDDEN_CHAIN_NAMES = [
  "Blast",
  "Mantle",
  "Mode",
  "Scroll",
  "Sonic",
] as const;

test("low-usage chains are hidden when they have no stored entry", () => {
  const normalized = normalizeNetworksInfo(undefined);
  const visibleNames = new Set(getVisibleChains(undefined).map((chain) => chain.name));

  for (const name of DEFAULT_HIDDEN_CHAIN_NAMES) {
    assert.equal(normalized[name]?.hidden, true, `${name} should default hidden`);
    assert.equal(DEFAULT_NETWORKS[name]?.hidden, true, `${name} default should be persisted`);
    assert.equal(visibleNames.has(name), false, `${name} should not be queried as visible`);
  }
});

test("a stored visible choice overrides the registry default", () => {
  const storedBlast = {
    Blast: {
      chainId: DEFAULT_NETWORKS.Blast.chainId,
      rpcUrl: DEFAULT_NETWORKS.Blast.rpcUrl,
      hidden: undefined,
    },
  };

  const normalized = normalizeNetworksInfo(storedBlast);
  const visibleNames = new Set(getVisibleChains(storedBlast).map((chain) => chain.name));

  assert.equal(normalized.Blast.hidden, undefined);
  assert.equal(visibleNames.has("Blast"), true);
  assert.equal(normalized.Mantle.hidden, true, "missing default-hidden chains stay hidden");
});

test("saved RPC URLs keep the active endpoint first and remain bounded", () => {
  const activeRpcUrl = "https://active-rpc.example/";
  const savedRpcUrls = [
    "https://old-rpc.example",
    "https://active-rpc.example",
    "https://user:secret@unsafe.example",
    ...Array.from(
      { length: MAX_SAVED_RPC_URLS },
      (_, index) => `https://rpc-${index}.example`,
    ),
  ];

  assert.deepEqual(normalizeSavedRpcUrls(activeRpcUrl, savedRpcUrls), [
    "https://active-rpc.example",
    "https://old-rpc.example",
    ...Array.from(
      { length: MAX_SAVED_RPC_URLS - 2 },
      (_, index) => `https://rpc-${index}.example`,
    ),
  ]);

  assert.deepEqual(
    normalizeSavedRpcUrls(undefined, [
      "javascript:alert(1)",
      "https://user:secret@unsafe.example",
    ]),
    [],
  );
});

test("registered testnets reuse their mainnet chain identity", () => {
  const mainnetIds = new Set(CHAIN_REGISTRY.map((chain) => chain.chainId));
  const seenTestnetIds = new Set<number>();

  for (const chain of CHAIN_REGISTRY) {
    for (const testnetChainId of chain.testnetChainIds) {
      assert.equal(
        mainnetIds.has(testnetChainId),
        false,
        `${testnetChainId} must not collide with a built-in mainnet`,
      );
      assert.equal(
        seenTestnetIds.has(testnetChainId),
        false,
        `${testnetChainId} must belong to only one mainnet chain`,
      );
      seenTestnetIds.add(testnetChainId);

      const icon = resolveChainIconMeta(testnetChainId, `${chain.name} Testnet`);
      assert.equal(icon.iconSrc, chain.icon);
      assert.equal(icon.bg, chain.bg);
      assert.equal(icon.border, chain.border);
      assert.equal(icon.text, chain.text);
      assert.deepEqual(icon.logoStyle, chain.logoStyle);
      assert.ok(icon.overlayLabel, `${testnetChainId} should show a testnet overlay`);
      assert.equal(
        getChainEnvironmentLabel(testnetChainId, `${chain.name} Testnet`),
        "TESTNET",
      );
    }
  }
});

test("HyperEVM mainnet and testnet share the contrast-safe logo style", () => {
  const expectedLogoStyle = {
    light: {
      surface: "rgba(255, 255, 255, 0.94)",
      border: "rgba(255, 255, 255, 0.28)",
      insetOutline: "rgba(0, 0, 0, 0.08)",
    },
    dark: {
      surface: "rgba(9, 9, 11, 0.94)",
      border: "rgba(151, 252, 228, 0.28)",
      insetOutline: "rgba(255, 255, 255, 0.06)",
    },
  };

  assert.deepEqual(resolveChainIconMeta(999, "HyperEVM").logoStyle, expectedLogoStyle);
  assert.deepEqual(
    resolveChainIconMeta(998, "HyperEVM Testnet").logoStyle,
    expectedLogoStyle,
  );
});

test("swap support matches the official 0x Swap API table", () => {
  const expected = [
    1, 10, 56, 130, 137, 143, 146, 480, 999, 2741, 4217, 4663, 5000,
    8453, 9745, 42161, 43114, 57073, 59144, 80094, 534352,
  ];
  const registrySwapIds = CHAIN_REGISTRY.filter((chain) => chain.isSwapSupported)
    .map((chain) => chain.chainId)
    .sort((a, b) => a - b);

  assert.deepEqual(registrySwapIds, [...expected].sort((a, b) => a - b));
  assert.deepEqual(
    [...ZEROX_SUPPORTED_CHAIN_IDS].sort((a, b) => a - b),
    registrySwapIds,
  );
  assert.equal(
    ZEROX_SUPPORTED_CHAIN_IDS.has(81457),
    false,
    "Blast is not in the Swap API table",
  );
  assert.equal(
    ZEROX_SUPPORTED_CHAIN_IDS.has(34443),
    false,
    "Mode is cross-chain-only in 0x docs",
  );
});
