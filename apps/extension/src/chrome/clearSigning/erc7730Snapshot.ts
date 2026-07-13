import { getBuiltinCalldataDescriptor } from "@/lib/clearSigning/builtinDescriptors";
import {
  matchCalldataFormat,
  type MatchedFormat,
} from "@/lib/clearSigning/matchDescriptor";
import type { Erc7730Descriptor } from "@/lib/clearSigning/types";
import type { ClearSignedMeta } from "../history/types";
import { handleGetClearSigningDescriptor } from "./handlers";
import { resolveCounterpartyLabels } from "./counterparty";
import type { GetDescriptorResponse } from "./types";

export interface CalldataDescriptorDependencies {
  getDescriptor: (message: {
    type: "GET_CLEAR_SIGNING_DESCRIPTOR";
    chainId: number;
    address: string;
    kind: "calldata";
    selector?: string;
  }) => Promise<GetDescriptorResponse>;
  getBuiltin: (
    chainId: number,
    address: string,
    data: string,
  ) => Erc7730Descriptor | null;
  match: (
    descriptor: Erc7730Descriptor,
    data: string,
  ) => MatchedFormat | null;
}

const DEFAULT_DEPENDENCIES: CalldataDescriptorDependencies = {
  getDescriptor: handleGetClearSigningDescriptor,
  getBuiltin: getBuiltinCalldataDescriptor,
  match: matchCalldataFormat,
};

export async function resolveMatchedCalldataDescriptorWithDependencies(
  to: string,
  data: string,
  chainId: number,
  dependencies: CalldataDescriptorDependencies,
): Promise<{ descriptor: Erc7730Descriptor; match: MatchedFormat } | null> {
  const selector =
    data?.startsWith("0x") && data.length >= 10
      ? data.slice(0, 10).toLowerCase()
      : undefined;
  const response = await dependencies
    .getDescriptor({
      type: "GET_CLEAR_SIGNING_DESCRIPTOR",
      chainId,
      address: to,
      kind: "calldata",
      selector,
    })
    .catch(() => null);

  if (response?.enabled !== false && response?.descriptor) {
    const match = dependencies.match(response.descriptor, data);
    if (match) return { descriptor: response.descriptor, match };
  }
  if (response?.enabled === false) return null;

  const local = dependencies.getBuiltin(chainId, to, data);
  if (!local) return null;
  const localMatch = dependencies.match(local, data);
  return localMatch ? { descriptor: local, match: localMatch } : null;
}

export async function resolveMatchedCalldataDescriptor(
  to: string,
  data: string,
  chainId: number,
): Promise<{ descriptor: Erc7730Descriptor; match: MatchedFormat } | null> {
  return resolveMatchedCalldataDescriptorWithDependencies(
    to,
    data,
    chainId,
    DEFAULT_DEPENDENCIES,
  );
}

export async function buildErc7730Meta(
  to: string,
  data: string,
  chainId: number,
): Promise<ClearSignedMeta | null> {
  const resolved = await resolveMatchedCalldataDescriptor(to, data, chainId);
  if (!resolved) return null;
  const intent =
    typeof resolved.match.format.intent === "string"
      ? resolved.match.format.intent
      : undefined;
  const contractName = resolved.descriptor.metadata?.contractName;
  if (!intent && !contractName) return null;

  const counterparty = await resolveCounterpartyLabels(to, chainId);
  return {
    kind: "erc7730",
    counterparty: to,
    counterpartyLabel: counterparty.label,
    counterpartyEns: counterparty.ens,
    intent,
    contractName,
  };
}
