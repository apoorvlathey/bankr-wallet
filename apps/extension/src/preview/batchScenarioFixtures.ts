import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";

type BatchScenarioAssets = {
  spender: string;
  usdc: string;
  defillamaUsdc: string;
  weth: string;
  approveData: string;
  defillamaFavicon: string;
  defillamaSwapData: `0x${string}`;
};

export function applyPreviewBatchScenario(
  base: PendingBatchTxRequest,
  scenario: string,
  assets: BatchScenarioAssets,
): PendingBatchTxRequest {
  if (scenario === "defillama-swap") {
    const origin = "https://swap.defillama.com";
    return {
      ...base,
      origin,
      senderOrigin: origin,
      favicon: assets.defillamaFavicon,
      params: {
        ...base.params,
        calls: [
          {
            to: assets.defillamaUsdc as `0x${string}`,
            data: assets.approveData as `0x${string}`,
            value: "0x0",
          },
          {
            to: assets.spender as `0x${string}`,
            data: assets.defillamaSwapData,
            value: "0x0",
          },
        ],
      },
    };
  }

  if (scenario === "malformed-disabled") {
    return {
      ...base,
      params: {
        ...base.params,
        calls: [
          ...base.params.calls,
          {
            to: assets.spender as `0x${string}`,
            data: "0x123",
            value: "0x0",
          },
        ],
      },
    };
  }

  if (scenario === "unsafe-self-call") {
    return {
      ...base,
      params: {
        ...base.params,
        calls: [
          { ...base.params.calls[0], to: base.params.from },
          ...base.params.calls.slice(1),
        ],
      },
    };
  }

  if (scenario === "stress") {
    return {
      ...base,
      origin: "https://multi-market-treasury-rebalancer.example",
      senderOrigin: "https://multi-market-treasury-rebalancer.example",
      params: {
        ...base.params,
        calls: Array.from({ length: 9 }, (_, index) => ({
          to: (index % 2 === 0 ? assets.usdc : assets.weth) as `0x${string}`,
          data: (index % 2 === 0
            ? assets.approveData
            : "0xd0e30db0") as `0x${string}`,
          value: index % 2 === 0 ? "0x0" : "0x2386f26fc10000",
        })),
      },
    };
  }

  return base;
}
