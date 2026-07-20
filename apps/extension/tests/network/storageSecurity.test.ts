import assert from "node:assert/strict";
import test from "node:test";

test("custom network storage rejects unsafe or malformed metadata", async () => {
  const originalChrome = Object.getOwnPropertyDescriptor(globalThis, "chrome");
  const sync: Record<string, unknown> = {
    networksInfo: {},
  };
  const local: Record<string, unknown> = {};
  Object.defineProperty(globalThis, "chrome", {
    configurable: true,
    value: {
      storage: {
        sync: {
          async get(keys: string | string[]) {
            const list = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(list.map((key) => [key, sync[key]]));
          },
          async set(values: Record<string, unknown>) {
            Object.assign(sync, structuredClone(values));
          },
        },
        local: {
          async get(keys: string | string[]) {
            const list = Array.isArray(keys) ? keys : [keys];
            return Object.fromEntries(list.map((key) => [key, local[key]]));
          },
          async set(values: Record<string, unknown>) {
            Object.assign(local, structuredClone(values));
          },
        },
      },
    },
  });

  try {
    const { addNetworkIfMissing, updateNetworkEntry } = await import(
      "../../src/chrome/network/networkMutations"
    );
    const { approveDappNetworkRequest } = await import(
      "../../src/chrome/network/dappNetworkApproval"
    );
    const { allowsImpersonatedTransactions } = await import(
      "../../src/chrome/network/impersonatedRpcPolicy"
    );
    const base = {
      chainId: 12345,
      rpcUrl: "https://rpc.example/",
      explorer: "https://explorer.example/",
      isCustom: true,
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    };

    for (const [name, entry, error] of [
      ["Unsafe RPC", { ...base, rpcUrl: "javascript:alert(1)" }, /RPC URL/],
      ["Unsafe explorer", { ...base, explorer: "data:text/html,boom" }, /Explorer URL/],
      ["Credential RPC", { ...base, rpcUrl: "https://user:secret@rpc.example" }, /RPC URL/],
      ["Plaintext public RPC", { ...base, rpcUrl: "http://rpc.example" }, /must use HTTPS/],
      ["Credential explorer", { ...base, explorer: "https://user:secret@explorer.example" }, /Explorer URL/],
      ["Bad decimals", { ...base, nativeCurrency: { ...base.nativeCurrency, decimals: 999 } }, /currency metadata/],
      ["Bad chain", { ...base, chainId: Number.MAX_SAFE_INTEGER + 1 }, /chain ID/],
    ] as const) {
      const result = await addNetworkIfMissing({ chainName: name, entry });
      assert.equal(result.success, false);
      assert.match(result.error, error);
    }

    const valid = await addNetworkIfMissing({
      chainName: "Safe custom chain",
      entry: base,
      rpcEndpoints: [
        { url: base.rpcUrl, allowImpersonatedTransactions: true },
      ],
    });
    assert.equal(valid.success, true);
    if (valid.success) {
      assert.equal(valid.networksInfo[valid.chainName].rpcUrl, "https://rpc.example");
      assert.equal(valid.networksInfo[valid.chainName].explorer, "https://explorer.example");
    }

    for (const [name, rpcUrls, error] of [
      ["Unsafe saved RPC", [base.rpcUrl, "javascript:alert(1)"], /RPC URL/],
      [
        "Too many saved RPCs",
        Array.from({ length: 11 }, (_, index) => `https://rpc-${index}.example`),
        /at most 10 RPC URLs/,
      ],
    ] as const) {
      const result = await updateNetworkEntry({
        chainName: "Safe custom chain",
        nextChainName: "Safe custom chain",
        entry: base,
        rpcUrls,
      });
      assert.equal(result.success, false, name);
      assert.match(result.error, error);
    }

    const switched = await updateNetworkEntry({
      chainName: "Safe custom chain",
      nextChainName: "Safe custom chain",
      entry: {
        ...base,
        rpcUrl: "https://backup-rpc.example",
      },
      rpcEndpoints: [
        {
          url: "https://rpc.example",
          allowImpersonatedTransactions: true,
        },
        { url: "https://backup-rpc.example" },
      ],
    });
    assert.equal(switched.success, true);
    if (switched.success) {
      assert.equal(
        switched.networksInfo[switched.chainName].rpcUrl,
        "https://backup-rpc.example",
      );
      assert.equal("rpcUrls" in switched.networksInfo[switched.chainName], false);
    }
    assert.deepEqual(
      (
        local.networkRpcUrls as Record<
          string,
          Array<{
            url: string;
            name?: string;
            allowImpersonatedTransactions?: true;
          }>
        >
      )["12345"],
      [
        { url: "https://backup-rpc.example" },
        {
          url: "https://rpc.example",
          allowImpersonatedTransactions: true,
        },
      ],
    );
    assert.equal(
      await allowsImpersonatedTransactions(
        12345,
        "https://backup-rpc.example",
      ),
      false,
      "an inactive endpoint flag cannot authorize the selected RPC",
    );

    const selectedDevelopmentRpc = await updateNetworkEntry({
      chainName: "Safe custom chain",
      nextChainName: "Safe custom chain",
      entry: base,
      rpcEndpoints: [
        {
          url: "https://rpc.example",
          allowImpersonatedTransactions: true,
        },
        { url: "https://backup-rpc.example" },
      ],
    });
    assert.equal(selectedDevelopmentRpc.success, true);
    assert.equal(
      await allowsImpersonatedTransactions(12345, "https://rpc.example"),
      true,
    );

    const remotePrivate = await addNetworkIfMissing({
      chainName: "Remote private pivot",
      entry: { ...base, chainId: 12346, rpcUrl: "http://127.0.0.1:8545" },
      requestOrigin: "https://dapp.example",
    });
    assert.equal(remotePrivate.success, false);
    assert.match(remotePrivate.error, /Private-network RPC access/i);

    const localDevelopment = await addNetworkIfMissing({
      chainName: "Local development",
      entry: { ...base, chainId: 12347, rpcUrl: "http://127.0.0.1:8545" },
      requestOrigin: "http://localhost:3000",
    });
    assert.equal(localDevelopment.success, true);

    const remoteLocalExplorer = await addNetworkIfMissing({
      chainName: "Remote local explorer",
      entry: {
        ...base,
        chainId: 12349,
        explorer: "http://localhost:4000",
      },
      requestOrigin: "https://dapp.example",
    });
    assert.equal(remoteLocalExplorer.success, false);
    assert.match(remoteLocalExplorer.error, /public HTTPS/i);

    const lanCrossHost = await addNetworkIfMissing({
      chainName: "LAN cross host",
      entry: { ...base, chainId: 12348, rpcUrl: "http://192.168.1.20:8545" },
      requestOrigin: "http://192.168.1.10:3000",
    });
    assert.equal(lanCrossHost.success, false);
    assert.match(lanCrossHost.error, /Private-network RPC access/i);

    const walletTypes = [
      "privateKey",
      "seedPhrase",
      "ledger",
      "impersonator",
    ] as const;
    const hiddenTestnets = [84532, 421614, 43113, 168587773] as const;
    const canonicalNames = [
      "Base Sepolia",
      "Arbitrum Sepolia",
      "Avalanche Fuji",
      "Blast Sepolia",
    ] as const;
    for (const [index, accountType] of walletTypes.entries()) {
      const chainId = hiddenTestnets[index];
      const requestedRpc = `https://${accountType.toLowerCase()}-rpc.example`;
      const result = await approveDappNetworkRequest({
        chainName: `Dapp name ${accountType}`,
        entry: {
          chainId,
          rpcUrl: requestedRpc,
          isCustom: true,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        },
        requestChainId: chainId,
        switchIfSupportedForAccountType: accountType,
        requestOrigin: "https://app.example",
      });
      assert.equal(result.success, true, accountType);
      if (!result.success) continue;
      const saved = result.networksInfo[result.chainName];
      assert.equal(saved.hidden, undefined, accountType);
      assert.equal(saved.rpcUrl, requestedRpc, accountType);
      assert.equal(saved.isCustom, undefined, accountType);
      assert.equal(result.chainName, canonicalNames[index], accountType);
      assert.equal(result.existed, true, accountType);
      assert.equal(result.shouldSwitch, true, accountType);
      assert.equal(sync.chainName, result.chainName, accountType);
    }

    assert.deepEqual(
      (local.networkRpcUrls as Record<string, Array<{ url: string }>>)["84532"],
      [
        { url: "https://privatekey-rpc.example" },
        { url: "https://base-sepolia.drpc.org" },
      ],
      "the approved RPC becomes active while WalletChan's RPC remains selectable",
    );

    const bankrResult = await approveDappNetworkRequest({
      chainName: "Ethereum Sepolia",
      entry: {
        chainId: 11155111,
        rpcUrl: "https://bankr-requested-rpc.example",
        isCustom: true,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      },
      requestChainId: 11155111,
      switchIfSupportedForAccountType: "bankr",
      requestOrigin: "https://app.example",
    });
    assert.equal(bankrResult.success, true);
    if (bankrResult.success) {
      assert.equal(bankrResult.shouldSwitch, false);
      assert.equal(
        bankrResult.networksInfo[bankrResult.chainName].hidden,
        undefined,
      );
      assert.notEqual(sync.chainName, bankrResult.chainName);
    }

    const blockedPrivatePromotion = await approveDappNetworkRequest({
      chainName: "Linea Sepolia",
      entry: {
        chainId: 59141,
        rpcUrl: "http://127.0.0.1:8545",
        isCustom: true,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      },
      requestChainId: 59141,
      switchIfSupportedForAccountType: "privateKey",
      requestOrigin: "https://app.example",
    });
    assert.equal(blockedPrivatePromotion.success, false);
    assert.match(blockedPrivatePromotion.error, /Private-network RPC access/i);

    const repurposedPrompt = await approveDappNetworkRequest({
      chainName: "Ethereum",
      entry: {
        chainId: 1,
        rpcUrl: "https://replacement-ethereum-rpc.example",
        isCustom: true,
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
      },
      requestChainId: 7654321,
      switchIfSupportedForAccountType: "privateKey",
      requestOrigin: "https://app.example",
    });
    assert.equal(repurposedPrompt.success, false);
    assert.match(repurposedPrompt.error, /already exists/i);

    const dappAdded = await approveDappNetworkRequest({
      chainName: "Fresh dapp chain",
      entry: {
        chainId: 7654321,
        rpcUrl: "https://fresh-rpc.example",
        isCustom: true,
        explorer: "https://fresh-explorer.example",
        nativeCurrency: { name: "Fresh", symbol: "FRH", decimals: 18 },
      },
      requestChainId: 7654321,
      switchIfSupportedForAccountType: "privateKey",
      requestOrigin: "https://app.example",
    });
    assert.equal(dappAdded.success, true);
    if (dappAdded.success) {
      assert.equal(dappAdded.existed, undefined);
      assert.equal(dappAdded.networksInfo[dappAdded.chainName].isCustom, true);
      assert.equal(dappAdded.shouldSwitch, true);
    }
  } finally {
    if (originalChrome) {
      Object.defineProperty(globalThis, "chrome", originalChrome);
    } else {
      Reflect.deleteProperty(globalThis, "chrome");
    }
  }
});
