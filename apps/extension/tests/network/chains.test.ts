import assert from "node:assert/strict";
import test from "node:test";

import {
  MAINNET_CHAIN_REGISTRY,
  TESTNET_CHAIN_REGISTRY,
  CHAIN_TOKEN_IDS,
  COINGECKO_PLATFORM_IDS,
  DEFAULT_NETWORKS,
  EIP7702_SUPPORTED_CHAIN_IDS,
  ZEROX_SUPPORTED_CHAIN_IDS,
  chainHasNativeToken,
} from "../../src/constants/chainRegistry";
import { PLATFORM_IDS as WEBSITE_TOKEN_LIST_PLATFORM_IDS } from "../../../website/app/api/swap/token-list/platformIds";
import {
  getVisibleChains,
  getNativeAssetMeta,
  getResolvedChainById,
  MAX_SAVED_RPC_URLS,
  normalizeNetworksInfo,
  normalizeRpcUrl,
  normalizeSavedRpcEndpoints,
  normalizeSavedRpcUrls,
} from "../../src/lib/chains";
import { KNOWN_CHAINS } from "../../src/constants/knownChains.generated";
import { normalizeActiveChainName } from "../../src/chrome/network/networkRepository";
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

test("native testnets ship hidden with complete runtime metadata", () => {
  assert.equal(TESTNET_CHAIN_REGISTRY.length, 26);

  for (const testnet of TESTNET_CHAIN_REGISTRY) {
    assert.equal(testnet.isTestnet, true, `${testnet.name} should be a testnet`);
    assert.equal(testnet.hiddenByDefault, true, `${testnet.name} should default hidden`);
    assert.equal(DEFAULT_NETWORKS[testnet.name]?.hidden, true);
    assert.equal(DEFAULT_NETWORKS[testnet.name]?.rpcUrl, testnet.rpcUrl);
    assert.match(testnet.rpcUrl, /^https:\/\//u);
    assert.match(testnet.explorer, /^https:\/\//u);
    assert.equal(testnet.isBankrSupported, false);
    assert.equal(testnet.isSwapSupported, false);
    assert.equal(getResolvedChainById(testnet.chainId, undefined)?.isCustom, false);
    assert.equal(getVisibleChains(undefined).some(({ chainId }) => chainId === testnet.chainId), false);
  }
});

test("Robinhood mainnet and testnet expose the live-verified default delegate", () => {
  const mainnet = MAINNET_CHAIN_REGISTRY.find(({ chainId }) => chainId === 4663);
  const testnet = TESTNET_CHAIN_REGISTRY.find(({ chainId }) => chainId === 46630);

  assert.equal(mainnet?.isEip7702Supported, true);
  assert.equal(testnet?.isEip7702Supported, true);
  assert.equal(EIP7702_SUPPORTED_CHAIN_IDS.has(4663), true);
  assert.equal(EIP7702_SUPPORTED_CHAIN_IDS.has(46630), true);
  assert.equal(testnet?.isBankrSupported, false);
  assert.equal(testnet?.isSwapSupported, false);
});

test("native testnet default-delegate flags match the live-verified deployment set", () => {
  const expected = [
    97,
    1301,
    5003,
    6343,
    10143,
    14601,
    42431,
    46630,
    59141,
    80002,
    80069,
    84532,
    421614,
    560048,
    763373,
    11155111,
    11155420,
  ];
  const actual = TESTNET_CHAIN_REGISTRY
    .filter(({ isEip7702Supported }) => isEip7702Supported)
    .map(({ chainId }) => chainId)
    .sort((a, b) => a - b);

  assert.deepEqual(actual, expected);
  for (const chainId of expected) {
    assert.equal(EIP7702_SUPPORTED_CHAIN_IDS.has(chainId), true);
  }
});

test("native pricing, token platforms, and viem metadata stay current", () => {
  assert.equal(CHAIN_TOKEN_IDS[137], "polygon-ecosystem-token");
  assert.equal(COINGECKO_PLATFORM_IDS[4326], "megaeth");
  assert.equal(
    MAINNET_CHAIN_REGISTRY.find(({ chainId }) => chainId === 130)?.viemChain?.id,
    130,
  );
  assert.deepEqual(COINGECKO_PLATFORM_IDS, WEBSITE_TOKEN_LIST_PLATFORM_IDS);
});

test("an existing custom testnet is promoted without losing user choices", () => {
  const stored = {
    "My Base testnet": {
      chainId: 84532,
      rpcUrl: "https://base-sepolia-rpc.publicnode.com",
      explorer: "https://example.invalid",
      hidden: undefined,
      isCustom: true,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    },
  };
  const normalized = normalizeNetworksInfo(stored);

  assert.deepEqual(normalized["Base Sepolia"], {
    chainId: 84532,
    rpcUrl: "https://base-sepolia-rpc.publicnode.com",
    hidden: undefined,
  });
  assert.equal(getResolvedChainById(84532, normalized)?.isCustom, false);
  assert.equal(getVisibleChains(normalized).some(({ chainId }) => chainId === 84532), true);
});

test("enabled testnets follow every wallet type's chain policy", () => {
  const enabled = normalizeNetworksInfo({
    "Base Sepolia": {
      chainId: 84532,
      rpcUrl: "https://base-sepolia.drpc.org",
      hidden: undefined,
    },
  });

  assert.equal(getVisibleChains(enabled, "bankr").some(({ chainId }) => chainId === 84532), false);
  for (const accountType of [
    "privateKey",
    "seedPhrase",
    "ledger",
    "impersonator",
  ] as const) {
    assert.equal(
      getVisibleChains(enabled, accountType).some(({ chainId }) => chainId === 84532),
      true,
      `${accountType} should see an enabled testnet`,
    );
  }
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

test("saved RPC endpoints retain the impersonated-transaction opt-in per URL", () => {
  assert.deepEqual(
    normalizeSavedRpcEndpoints("https://rpc.example", [
      {
        url: "https://rpc.example/",
        name: "Development fork",
        allowImpersonatedTransactions: true,
      },
      {
        url: "https://other.example",
        allowImpersonatedTransactions: "yes",
      },
    ]),
    [
      {
        url: "https://rpc.example",
        name: "Development fork",
        allowImpersonatedTransactions: true,
      },
      { url: "https://other.example" },
    ],
  );
});

test("manual RPC normalization accepts local development shorthand only", () => {
  assert.equal(normalizeRpcUrl("localhost:8545"), "http://localhost:8545");
  assert.equal(normalizeRpcUrl("127.0.0.1:8545"), "http://127.0.0.1:8545");
  assert.equal(normalizeRpcUrl("0.0.0.0:8545"), "http://0.0.0.0:8545");
  assert.equal(normalizeRpcUrl("192.168.1.20:8545"), "http://192.168.1.20:8545");
  assert.equal(normalizeRpcUrl("rpc.example:8545"), null);
  assert.equal(normalizeRpcUrl("user:secret@localhost:8545"), null);
});

test("registered testnets reuse their mainnet chain identity", () => {
  const mainnetIds = new Set(MAINNET_CHAIN_REGISTRY.map((chain) => chain.chainId));
  const seenTestnetIds = new Set<number>();

  for (const chain of MAINNET_CHAIN_REGISTRY) {
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

  const nativeTestnetIds = new Set(TESTNET_CHAIN_REGISTRY.map(({ chainId }) => chainId));
  assert.equal(nativeTestnetIds.has(41454), false, "legacy Monad ID stays visual-only");
  assert.equal(nativeTestnetIds.has(57054), false, "legacy Sonic Blaze ID stays visual-only");
  for (const testnet of TESTNET_CHAIN_REGISTRY) {
    assert.equal(seenTestnetIds.has(testnet.chainId), true);
  }
});

test("Tempo mainnet and testnet do not expose a synthetic native balance", () => {
  assert.equal(chainHasNativeToken(4217), false);
  assert.equal(chainHasNativeToken(42431), false);
  assert.equal(getNativeAssetMeta(4217, {})?.symbol, "USD");
  assert.equal(
    getNativeAssetMeta(42431, {
      "Tempo Testnet": {
        chainId: 42431,
        rpcUrl: "https://rpc.moderato.tempo.xyz",
        isCustom: true,
        nativeCurrency: { name: "USD", symbol: "USD", decimals: 6 },
      },
    })?.symbol,
    "USD",
  );
  assert.equal(chainHasNativeToken(8453), true);
  assert.equal(chainHasNativeToken(9_999_999), true);
});

test("v3.19 custom Tempo state upgrades without losing user preferences", () => {
  const storedNetworks = {
    "My Tempo": {
      chainId: 4217,
      rpcUrl: "https://tempo.drpc.org",
      explorer: "https://explorer.tempo.fi",
      hidden: true,
      isCustom: true,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    },
  };
  const normalized = normalizeNetworksInfo(storedNetworks);
  const tempo = getResolvedChainById(4217, normalized);

  assert.deepEqual(normalized.Tempo, {
    chainId: 4217,
    rpcUrl: "https://tempo.drpc.org",
    hidden: true,
  });
  assert.equal(tempo?.name, "Tempo");
  assert.equal(tempo?.rpcUrl, "https://tempo.drpc.org");
  assert.equal(tempo?.hidden, true);
  assert.equal(tempo?.isCustom, false);
  assert.deepEqual(tempo?.nativeCurrency, {
    name: "USD",
    symbol: "USD",
    decimals: 6,
  });
  assert.equal(tempo?.hasNativeToken, false);
  assert.equal(KNOWN_CHAINS[4217], undefined);
  assert.equal(
    normalizeActiveChainName("My Tempo", storedNetworks, normalized),
    "Tempo",
  );
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
  const registrySwapIds = MAINNET_CHAIN_REGISTRY.filter((chain) => chain.isSwapSupported)
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
