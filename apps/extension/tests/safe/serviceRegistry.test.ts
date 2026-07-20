import assert from "node:assert/strict";
import test from "node:test";
import { parseSafeServiceChains } from "../../src/chrome/safe/serviceRegistry";

function chain(overrides: Record<string, unknown> = {}) {
  return {
    chainId: "5042",
    chainName: "Arc",
    shortName: "arc",
    transactionService: "https://api.safe.global/tx-service/arc",
    publicRpcUri: {
      authentication: "NO_AUTHENTICATION",
      value: "https://rpc.arc.example",
    },
    isTestnet: false,
    ...overrides,
  };
}

test("Safe config accepts arbitrary official EVM chains without a WalletChan allowlist", () => {
  assert.deepEqual(parseSafeServiceChains({ results: [chain()] }), [{
    chainId: 5042,
    chainName: "Arc",
    shortName: "arc",
    transactionService: "https://api.safe.global/tx-service/arc",
    publicRpcUrl: "https://rpc.arc.example",
    isTestnet: false,
  }]);
});

test("Safe config pins transaction services and rejects duplicates", () => {
  assert.throws(
    () => parseSafeServiceChains({ results: [chain({ transactionService: "https://attacker.example/tx-service/arc" })] }),
    /transaction service/i,
  );
  assert.throws(
    () => parseSafeServiceChains({ results: [chain(), chain()] }),
    /duplicate/i,
  );
});

test("non-EVM Safe networks and unsafe public RPC fallbacks are excluded", () => {
  const result = parseSafeServiceChains({ results: [
    chain({ chainId: "324", chainName: "zkSync Era", shortName: "zksync" }),
    chain({ publicRpcUri: { authentication: "NO_AUTHENTICATION", value: "https://127.0.0.1/rpc" } }),
  ] });
  assert.equal(result.length, 1);
  assert.equal(result[0]?.chainId, 5042);
  assert.equal(result[0]?.publicRpcUrl, undefined);
});
