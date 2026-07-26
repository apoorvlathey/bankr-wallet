import {
  decodeFunctionResult,
  encodeFunctionData,
  getAddress,
  parseEther,
  type Address,
  type PublicClient,
} from "viem";

import { extractCalldataAddressCandidates } from "../calldataAddressCandidates";
import { preflightAssetCandidates } from "../erc20CandidatePreflight";
import { normalizeRawNftsReceived } from "./assetChangeNormalization";
import { getSimulationClient } from "./client";
import {
  MAX_SIMULATION_ASSET_CHANGES,
  MULTICALL3_ADDRESS,
  SIMULATION_GAS_LIMIT,
} from "./constants";
import {
  buildErc7715RedeemDecodedResult,
  isErc7715RedeemDelegationsTx,
} from "./erc7715Preview";
import {
  attachApprovalProjection,
  createApprovalProjectionPromise,
} from "./approvalAttachment";
import { buildSimulationResult } from "./resultBuilder";
import { buildRetryOverrides } from "./stateOverrides";
import {
  SIMULATOR_ABI,
} from "./simulatorContract";
import { buildIsolatedSimulatorOverride } from "./simulatorOverride";
import type {
  RawSimulationResult as RawSimResult,
  SimulationResult,
} from "./types";

export async function simulateAssetChanges(
  tx: {
    from: string;
    to?: string;
    data?: string;
    value?: string;
    chainId: number;
  },
  accountAddress: string,
  options: { includeApprovals?: boolean } = {},
): Promise<SimulationResult> {
  console.log("[TxSim] simulateAssetChanges called", {
    from: tx.from,
    to: tx.to,
    data: tx.data?.slice(0, 10),
    value: tx.value,
    chainId: tx.chainId,
    accountAddress,
  });

  const EMPTY: SimulationResult = {
    txSuccess: true,
    nativeChange: null,
    tokenChanges: [],
    approvalChanges: [],
    approvalDetectionIncomplete: false,
    simulationFailed: false,
    metadataComplete: true,
  };

  // Skip contract deployments (no `to` address)
  if (!tx.to) {
    console.log("[TxSim] Skipping: no 'to' address (contract deployment)");
    return EMPTY;
  }

  const approvalPromise = createApprovalProjectionPromise(
    [{ to: tx.to, data: tx.data, value: tx.value }],
    accountAddress,
    tx.chainId,
    options.includeApprovals !== false,
  );
  const attachApprovals = (result: SimulationResult) =>
    attachApprovalProjection(result, approvalPromise);

  const client = await getSimulationClient(tx.chainId);
  if (!client) {
    console.log("[TxSim] Failed: no RPC URL for chainId", tx.chainId);
    return attachApprovals({
      ...EMPTY,
      simulationFailed: true,
      simulationError: "No RPC URL",
    });
  }

  // Checksum addresses. viem's `formatStateOverride` runs `getAddress` on
  // override keys, while `formatTransactionRequest` leaves the `from` field
  // as-is. If we pass a lowercase address (common for impersonated accounts
  // pasted by the user), the request ends up with mismatched casing between
  // the tx `from` and the override key, which some RPCs reject as "invalid
  // params". Checksumming both sides up-front keeps them in lockstep.
  const from = getAddress(accountAddress);
  const to = getAddress(tx.to);
  const value = tx.value && tx.value !== "0x0" ? BigInt(tx.value) : 0n;
  const data = (tx.data && tx.data !== "0x" ? tx.data : "0x") as `0x${string}`;

  if (isErc7715RedeemDelegationsTx(to, data)) {
    const decodedResult = await buildErc7715RedeemDecodedResult(
      client,
      tx.chainId,
      accountAddress,
      data,
      value,
    );
    if (decodedResult) {
      console.log(
        "[TxSim] Decoded ERC-7715 redeemDelegations asset preview",
        {
          nativeChange: decodedResult.nativeChange
            ? `${decodedResult.nativeChange.direction} ${decodedResult.nativeChange.formattedAmount} ${decodedResult.nativeChange.symbol}`
            : null,
          tokenChanges: decodedResult.tokenChanges.map(
            (change) =>
              `${change.direction} ${change.formattedAmount} ${change.symbol} (${change.address})`,
          ),
        },
      );
      return attachApprovals(decodedResult);
    }

    console.log(
      "[TxSim] Skipping bytecode-injection simulation for ERC-7715 redeemDelegations; unsupported execution shape or EIP-7702 account code dependency.",
    );
    return attachApprovals({
      ...EMPTY,
      simulationFailed: true,
      simulationError:
        "ERC-7715 redemption asset-change simulation is unavailable",
    });
  }

  try {
    // Step 1: Get access list to discover touched contracts. Some RPCs
    // (e.g. Alchemy) reject createAccessList when `from` has no ETH balance
    // — common for impersonator accounts and freshly-created EOAs. Fall back
    // to ABI-padded addresses found anywhere in calldata (including nested
    // Uniswap multicall bytes), plus `to`. The simulator's balanceOf probes
    // safely filter non-token addresses from this bounded candidate set.
    console.log("[TxSim] Step 1: Creating access list...");
    let candidates: Address[];
    try {
      const { accessList } = await client.createAccessList({
        account: from,
        to,
        value,
        data,
        gas: SIMULATION_GAS_LIMIT,
      });
      console.log("[TxSim] Access list entries:", accessList.length, accessList.map(e => e.address));

      // Collect unique candidate addresses (include `to` — it could be a token)
      const seen = new Set<string>();
      seen.add(from.toLowerCase()); // exclude user's own address
      candidates = [];
      for (const entry of accessList) {
        const addr = entry.address.toLowerCase();
        if (!seen.has(addr)) {
          seen.add(addr);
          candidates.push(entry.address as Address);
        }
      }
      // Also include `to` if not already present
      if (!seen.has(to.toLowerCase())) {
        candidates.push(to);
      }
    } catch (alErr: any) {
      const calldataCandidates = extractCalldataAddressCandidates(data, [from, to]);
      console.warn(
        "[TxSim] createAccessList failed, falling back to calldata addresses:",
        alErr.shortMessage || alErr.message || alErr,
      );
      candidates = [to, ...calldataCandidates];
    }
    candidates = await preflightAssetCandidates(
      client,
      tx.chainId,
      from,
      candidates.slice(0, MAX_SIMULATION_ASSET_CHANGES),
      MULTICALL3_ADDRESS,
    );
    console.log("[TxSim] Candidates after asset preflight:", candidates.length);
    console.log("[TxSim] Candidate tokens:", candidates.length, candidates);

    // Step 2: Simulate via eth_call with state override
    const simResult = await runSimulation(client, from, to, value, data, candidates, []);

    // Step 2b: If inner tx reverted, retry with balance + approval + Permit2 overrides.
    // Common reasons: user lacks onchain token balance (impersonator account),
    // missing ERC-20 approval to Permit2, or missing Permit2 allowance to router.
    if (!simResult.txSuccess && simResult.tokens.length === 0) {
      console.log("[TxSim] Inner tx reverted with no changes — retrying with balance + approval overrides...");
      const retryOverrides = await buildRetryOverrides(client, from, to, candidates);
      console.log("[TxSim] Built retry overrides:", retryOverrides.length, "addresses");
      const retryResult = await runSimulation(client, from, to, value, data, candidates, retryOverrides);
      if (retryResult.tokens.length > 0 || retryResult.ethDelta !== 0n) {
        console.log("[TxSim] Retry succeeded! tokens:", retryResult.tokens.length, "ethDelta:", retryResult.ethDelta.toString());
        return attachApprovals(
          await buildSimulationResult(
            client,
            tx.chainId,
            accountAddress,
            retryResult,
          ),
        );
      }
      console.log("[TxSim] Retry also produced no changes");
    }

    return attachApprovals(
      await buildSimulationResult(
        client,
        tx.chainId,
        accountAddress,
        simResult,
      ),
    );
  } catch (err: any) {
    console.warn("[TxSim] Simulation error:", err.shortMessage || err.message || err);
    return attachApprovals({
      ...EMPTY,
      metadataComplete: true,
      simulationFailed: true,
      simulationError: err.shortMessage || err.message || "Simulation failed",
    });
  }
}

// ---------------------------------------------------------------------------
// Simulation core — runs the eth_call with state overrides and decodes result
// ---------------------------------------------------------------------------

async function runSimulation(
  client: PublicClient,
  from: Address,
  to: Address,
  value: bigint,
  data: `0x${string}`,
  candidates: Address[],
  extraOverrides: { address: Address; stateDiff: { slot: `0x${string}`; value: `0x${string}` }[] }[],
): Promise<RawSimResult> {
  const callData = encodeFunctionData({
    abi: SIMULATOR_ABI,
    functionName: "simulate",
    args: [to, value, data, candidates],
  });

  const label = extraOverrides.length > 0 ? "[TxSim retry]" : "[TxSim]";
  console.log(`${label} Running eth_call simulation (extraOverrides: ${extraOverrides.length})...`);

  const result = await client.call({
    account: from,
    to: from,
    data: callData,
    gas: SIMULATION_GAS_LIMIT,
    stateOverride: [
      buildIsolatedSimulatorOverride(from, parseEther("100000")),
      ...extraOverrides,
    ],
  });

  if (!result.data) {
    console.log(`${label} Empty response from eth_call`);
    return { txSuccess: false, ethDelta: 0n, tokens: [], deltas: [], nftsReceived: [] };
  }
  console.log(`${label} eth_call response length:`, result.data.length);

  const [txSuccess, ethDelta, tokens, deltas, nftsReceived] = decodeFunctionResult({
    abi: SIMULATOR_ABI,
    functionName: "simulate",
    data: result.data,
  });
  const normalizedNftsReceived = normalizeRawNftsReceived(nftsReceived);
  console.log(`${label} Decoded:`, {
    txSuccess,
    ethDelta: ethDelta.toString(),
    tokensCount: (tokens as Address[]).length,
    nftsReceivedCount: normalizedNftsReceived.length,
  });

  return {
    txSuccess: txSuccess as boolean,
    ethDelta: ethDelta as bigint,
    tokens: tokens as Address[],
    deltas: deltas as bigint[],
    nftsReceived: normalizedNftsReceived,
  };
}


// ---------------------------------------------------------------------------
// Batch simulation — executes all calls sequentially in a single eth_call
// ---------------------------------------------------------------------------
