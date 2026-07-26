import { getAddress, toHex } from "viem";

import { fetchRpcEnvelope } from "../network/rpcClient";
import { getRpcUrl } from "../transactions/rpcConfig";
import { getSimulationClient } from "./client";
import type { EthSimulateCallResult } from "./ethSimulateLogs";

const ethSimulateV1Support = new Map<
  number,
  { supported: boolean; checkedAt: number }
>();
const SIMULATE_V1_CACHE_TTL = 10 * 60 * 1000;

function isEthSimulateV1Supported(chainId: number): boolean | null {
  const cached = ethSimulateV1Support.get(chainId);
  if (
    !cached ||
    Date.now() - cached.checkedAt > SIMULATE_V1_CACHE_TTL
  ) return null;
  return cached.supported;
}

function setEthSimulateV1Support(
  chainId: number,
  supported: boolean,
): void {
  ethSimulateV1Support.set(chainId, { supported, checkedAt: Date.now() });
}

export interface EthSimulateV1Run {
  callResults: EthSimulateCallResult[];
  blockNumber: bigint;
}

/** Run a bounded, block-pinned eth_simulateV1 call sequence. */
export async function runEthSimulateV1Calls(
  calls: { to?: string; data?: string; value?: string }[],
  fromAddress: string,
  chainId: number,
  pinnedBlockNumber?: bigint,
): Promise<EthSimulateV1Run | null> {
  if (isEthSimulateV1Supported(chainId) === false) return null;
  const rpcUrl = await getRpcUrl(chainId);
  if (!rpcUrl) return null;
  const client = await getSimulationClient(chainId);
  if (!client) return null;

  let from: string;
  let blockNumber: bigint;
  try {
    from = getAddress(fromAddress);
    blockNumber =
      pinnedBlockNumber ??
      await client.getBlockNumber({ cacheTime: 0 });
  } catch {
    return null;
  }

  const simulateCalls = calls.map((call) => ({
    from,
    to: call.to || "0x0000000000000000000000000000000000000000",
    data: call.data || "0x",
    value: call.value && call.value !== "0x0" ? call.value : "0x0",
  }));
  const params = [
    {
      blockStateCalls: [{
        stateOverrides: {
          [from]: { balance: "0x56BC75E2D63100000" }, // 100 ETH
        },
        calls: simulateCalls,
      }],
      traceTransfers: true,
      validation: false,
    },
    toHex(blockNumber),
  ];

  try {
    const json = await fetchRpcEnvelope(
      rpcUrl,
      "eth_simulateV1",
      params,
      { timeoutMs: 15_000, allowPrivateWithoutOrigin: true },
    );
    if (json.error) {
      const rpcError = json.error as Record<string, unknown>;
      const errMsg = String(rpcError.message || "").toLowerCase();
      if (
        errMsg.includes("method not found") ||
        errMsg.includes("not supported") ||
        errMsg.includes("does not exist") ||
        errMsg.includes("unknown method") ||
        rpcError.code === -32601
      ) {
        console.log(
          `[ethSimV1] eth_simulateV1 not supported on chain ${chainId}, caching`,
        );
        setEthSimulateV1Support(chainId, false);
        return null;
      }
      console.log("[ethSimV1] RPC error:", rpcError);
      setEthSimulateV1Support(chainId, true);
      return null;
    }

    setEthSimulateV1Support(chainId, true);
    const blockResults = json.result as any;
    if (
      !Array.isArray(blockResults) ||
      blockResults.length === 0 ||
      !Array.isArray(blockResults[0]?.calls)
    ) {
      console.log("[ethSimV1] Empty response");
      return null;
    }
    return {
      callResults: blockResults[0].calls as EthSimulateCallResult[],
      blockNumber,
    };
  } catch (err: any) {
    console.log("[ethSimV1] Error:", err.message);
    return null;
  }
}
