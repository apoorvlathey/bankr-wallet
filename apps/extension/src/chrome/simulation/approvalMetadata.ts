import { erc20Abi, type Address, type PublicClient } from "viem";

import { resolveCounterpartyLabels } from "../clearSigning/counterparty";
import { getPreflightTokenMetadata } from "../erc20CandidatePreflight";
import {
  getCachedTokenList,
  getCachedTokenLogo,
} from "../swapApi";
import { KNOWN_TOKEN_LOGOS } from "../tokenLogoConstants";
import { getSimulationClient } from "./client";
import { MULTICALL3_ADDRESS } from "./constants";
import type { ApprovalChange, ResidualApproval } from "./types";

type ApprovalMetadataEntry = ApprovalChange | ResidualApproval;

interface TokenDisplayMetadata {
  name: string;
  symbol: string;
  decimals: number;
  logoUrl?: string;
}

function fallbackSymbol(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function approvalMetadataIsIncomplete(
  change: ApprovalMetadataEntry,
): boolean {
  return change.symbol.includes("...") || !change.logoUrl;
}

export async function enrichApprovalMetadata<T extends ApprovalMetadataEntry>(
  client: PublicClient,
  chainId: number,
  changes: T[],
): Promise<{ changes: T[]; metadataComplete: boolean }> {
  if (changes.length === 0) return { changes, metadataComplete: true };

  const uniqueTokens = Array.from(
    new Map(
      changes.map((change) => [
        change.tokenAddress.toLowerCase(),
        change.tokenAddress as Address,
      ]),
    ).values(),
  );
  const tokenList = await getCachedTokenList(chainId).catch(() => []);
  const tokenListMap = new Map(
    tokenList.map((token) => [token.address.toLowerCase(), token]),
  );
  const metadata = new Map<string, TokenDisplayMetadata>();
  const unknown: Address[] = [];

  for (const token of uniqueTokens) {
    const key = token.toLowerCase();
    const listed = tokenListMap.get(key);
    if (listed) {
      metadata.set(key, {
        name: listed.name,
        symbol: listed.symbol,
        decimals: listed.decimals,
        logoUrl: listed.logoURI || undefined,
      });
      continue;
    }
    const preflight = getPreflightTokenMetadata(chainId, token);
    if (preflight) {
      metadata.set(key, {
        ...preflight,
        logoUrl: KNOWN_TOKEN_LOGOS[key],
      });
      continue;
    }
    unknown.push(token);
  }

  if (unknown.length > 0) {
    const contracts = unknown.flatMap((token) => [
      { address: token, abi: erc20Abi, functionName: "name" as const },
      { address: token, abi: erc20Abi, functionName: "symbol" as const },
      { address: token, abi: erc20Abi, functionName: "decimals" as const },
    ]);
    try {
      const results = await client.multicall({
        contracts,
        allowFailure: true,
        multicallAddress: MULTICALL3_ADDRESS,
      });
      unknown.forEach((token, index) => {
        const nameResult = results[index * 3];
        const symbolResult = results[index * 3 + 1];
        const decimalsResult = results[index * 3 + 2];
        metadata.set(token.toLowerCase(), {
          name:
            nameResult?.status === "success" &&
            typeof nameResult.result === "string"
              ? nameResult.result
              : "",
          symbol:
            symbolResult?.status === "success" &&
            typeof symbolResult.result === "string"
              ? symbolResult.result
              : fallbackSymbol(token),
          decimals:
            decimalsResult?.status === "success" &&
            typeof decimalsResult.result === "number"
              ? decimalsResult.result
              : 18,
        });
      });
    } catch {
      unknown.forEach((token) => {
        metadata.set(token.toLowerCase(), {
          name: "",
          symbol: fallbackSymbol(token),
          decimals: 18,
        });
      });
    }
  }

  await Promise.all(
    uniqueTokens.map(async (token) => {
      const key = token.toLowerCase();
      const current = metadata.get(key) ?? {
        name: "",
        symbol: fallbackSymbol(token),
        decimals: 18,
      };
      if (current.logoUrl) return;
      const logo =
        KNOWN_TOKEN_LOGOS[key] ||
        await getCachedTokenLogo(chainId, token).catch(() => null);
      if (logo) metadata.set(key, { ...current, logoUrl: logo });
    }),
  );

  const uniqueSpenders = Array.from(
    new Map(
      changes
        .filter((change) => !("sourceCallIndex" in change))
        .map((change) => [
          change.spender.toLowerCase(),
          change.spender,
        ]),
    ).values(),
  );
  const labels = new Map<
    string,
    { label?: string; ens?: string }
  >();
  await Promise.all(
    uniqueSpenders.map(async (spender) => {
      const resolved = await resolveCounterpartyLabels(
        spender,
        chainId,
      ).catch(() => ({}));
      labels.set(spender.toLowerCase(), resolved);
    }),
  );

  const enriched = changes.map((change) => {
    const token = metadata.get(change.tokenAddress.toLowerCase());
    if ("sourceCallIndex" in change) {
      return {
        ...change,
        name: token?.name ?? change.name,
        symbol: token?.symbol ?? change.symbol,
        decimals: token?.decimals ?? change.decimals,
        logoUrl: token?.logoUrl ?? change.logoUrl,
      };
    }
    const spender = labels.get(change.spender.toLowerCase());
    return {
      ...change,
      name: token?.name ?? change.name,
      symbol: token?.symbol ?? change.symbol,
      decimals: token?.decimals ?? change.decimals,
      logoUrl: token?.logoUrl ?? change.logoUrl,
      spenderLabel: spender?.label ?? change.spenderLabel,
      spenderEns: spender?.ens ?? change.spenderEns,
    };
  });

  return {
    changes: enriched,
    metadataComplete: enriched.every(
      (change) => !approvalMetadataIsIncomplete(change),
    ),
  };
}

export async function retryApprovalMetadata<T extends ApprovalMetadataEntry>(
  chainId: number,
  changes: T[],
): Promise<T[]> {
  if (
    changes.length === 0 ||
    changes.every((change) => !approvalMetadataIsIncomplete(change))
  ) {
    return changes;
  }
  const client = await getSimulationClient(chainId);
  if (!client) return changes;
  return (await enrichApprovalMetadata(client, chainId, changes)).changes;
}
