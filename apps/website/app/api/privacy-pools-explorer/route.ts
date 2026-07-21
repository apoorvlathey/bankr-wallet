import { NextResponse } from "next/server";
import {
  createPublicClient,
  decodeEventLog,
  formatEther,
  http,
  type Address,
} from "viem";

import type { PrivacyPoolsExplorerResult } from "../../privacy-pools-explorer/types";
import {
  complianceStatus,
  DEPOSIT_EVENT,
  DEPLOYMENTS,
  ENTRYPOINT_ABI,
  FETCH_TIMEOUT_MS,
  fetchBoundedJson,
  findRootPublication,
  parseAspDeposits,
  parseAspLeaves,
  parseAspRoots,
  parseNetwork,
  parseTransactionHash,
} from "./verification";

export const dynamic = "force-dynamic";

function error(message: string, status = 400) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error("Request body must be valid JSON");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return error("Invalid request");
  }

  const input = body as { transaction?: unknown; network?: unknown };
  const network = parseNetwork(input.network);
  const txHash = parseTransactionHash(input.transaction);
  if (!network) return error("Select Ethereum mainnet or Sepolia");
  if (!txHash) return error("Enter a valid transaction hash or Etherscan transaction URL");

  const deployment = DEPLOYMENTS[network];
  const client = createPublicClient({
    transport: http(deployment.rpcUrl, {
      timeout: FETCH_TIMEOUT_MS,
      retryCount: 1,
    }),
  });

  try {
    const receipt = await client.getTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      return error("The transaction reverted and is not a confirmed Shield deposit", 422);
    }
    if (receipt.to?.toLowerCase() !== deployment.entrypoint.toLowerCase()) {
      return error(`This transaction was not sent to the ${deployment.chainName} Privacy Pools Entrypoint`, 422);
    }

    const depositLog = receipt.logs.find((log) => {
      if (log.address.toLowerCase() !== deployment.ethPool.toLowerCase()) return false;
      try {
        const decoded = decodeEventLog({
          abi: [DEPOSIT_EVENT],
          data: log.data,
          topics: log.topics,
        });
        return decoded.eventName === "Deposited";
      } catch {
        return false;
      }
    });
    if (!depositLog) {
      return error("The transaction succeeded but contains no ETH-pool Deposited event", 422);
    }

    const decoded = decodeEventLog({
      abi: [DEPOSIT_EVENT],
      data: depositLog.data,
      topics: depositLog.topics,
    });
    const args = decoded.args as {
      _depositor: Address;
      _commitment: bigint;
      _label: bigint;
      _value: bigint;
      _precommitmentHash: bigint;
    };
    const label = args._label.toString();
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    const depositConfirmedAt = new Date(Number(block.timestamp) * 1_000).toISOString();

    const aspHeaders = {
      Accept: "application/json",
      "X-Pool-Scope": deployment.scope,
    };
    const [rawDeposits, rawRoots, rawLeaves] = await Promise.all([
      fetchBoundedJson(
        `${deployment.aspBaseUrl}/${deployment.chainId}/public/deposits-by-label`,
        { ...aspHeaders, "X-Labels": label },
      ),
      fetchBoundedJson(
        `${deployment.aspBaseUrl}/${deployment.chainId}/public/mt-roots`,
        aspHeaders,
      ),
      fetchBoundedJson(
        `${deployment.aspBaseUrl}/${deployment.chainId}/public/mt-leaves`,
        aspHeaders,
      ),
    ]);
    const deposits = parseAspDeposits(rawDeposits);
    const roots = parseAspRoots(rawRoots);
    const leaves = parseAspLeaves(rawLeaves);
    const aspDeposit = deposits.find(
      (deposit) =>
        deposit.txHash.toLowerCase() === txHash &&
        BigInt(deposit.label) === args._label,
    );
    const exactDepositMatch = Boolean(
      aspDeposit &&
      BigInt(aspDeposit.amount) === args._value &&
      aspDeposit.address.toLowerCase() === args._depositor.toLowerCase() &&
      BigInt(aspDeposit.precommitmentHash) === args._precommitmentHash,
    );
    const reviewStatus = aspDeposit?.reviewStatus ?? "not_seen";
    const labelIncluded = leaves.aspLeaves.some(
      (leaf) => BigInt(leaf) === args._label,
    );
    const latestRoot = await client.readContract({
      address: deployment.entrypoint,
      abi: ENTRYPOINT_ABI,
      functionName: "latestRoot",
    });
    const aspRoot = BigInt(roots.mtRoot);
    const rootMatches = latestRoot === aspRoot;
    const publication = rootMatches
      ? await findRootPublication(client, deployment, aspRoot, roots.createdAt)
      : null;
    const publishedAt = publication
      ? new Date(Number(publication.timestamp) * 1_000).toISOString()
      : null;
    const verificationLatencySeconds = publication
      ? Number(publication.timestamp - block.timestamp)
      : null;
    const status = complianceStatus({
      reviewStatus,
      exactDepositMatch,
      labelIncluded,
      rootMatches,
    });

    const result: PrivacyPoolsExplorerResult = {
      network,
      chainId: deployment.chainId,
      chainName: deployment.chainName,
      checkedAt: new Date().toISOString(),
      txHash,
      explorerUrl: `${deployment.explorerBaseUrl}/tx/${txHash}`,
      status,
      deposit: {
        blockNumber: receipt.blockNumber.toString(),
        confirmedAt: depositConfirmedAt,
        depositor: args._depositor,
        amountWei: args._value.toString(),
        amountEth: formatEther(args._value),
        commitment: args._commitment.toString(),
        label,
        precommitmentHash: args._precommitmentHash.toString(),
      },
      asp: {
        reviewStatus,
        exactDepositMatch,
        labelIncluded,
        root: roots.mtRoot,
        rootCreatedAt: new Date(roots.createdAt).toISOString(),
      },
      onchain: {
        latestRoot: latestRoot.toString(),
        rootMatches,
        publishedAt,
        publisherTransactionHash: publication?.transactionHash ?? null,
        publisherTransactionUrl: publication
          ? `${deployment.explorerBaseUrl}/tx/${publication.transactionHash}`
          : null,
        verificationLatencySeconds,
      },
    };

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Verification failed";
    if (/could not be found|not found/i.test(message)) {
      return error(`Transaction not found on ${deployment.chainName}`, 404);
    }
    console.error("Privacy Pools explorer verification failed", caught);
    return error("Privacy Pools verification is temporarily unavailable", 502);
  }
}
