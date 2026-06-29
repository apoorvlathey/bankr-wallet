export interface Erc7710SignedCaveat {
  enforcer: string;
  terms: string;
}

export interface Erc7710Caveat extends Erc7710SignedCaveat {
  args: string;
}

export interface Erc7710Delegation {
  delegate: string;
  delegator: string;
  authority: string;
  caveats: Erc7710Caveat[];
  salt: string;
}

export interface Erc7710DelegationTypedData {
  domain?: Record<string, unknown>;
  primaryType: "Delegation";
  types: Record<string, Array<{ name: string; type: string }>>;
  message: Omit<Erc7710Delegation, "caveats" | "salt"> & {
    caveats: Erc7710SignedCaveat[];
    salt: string | number;
  };
}

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const HEX_RE = /^0x(?:[a-fA-F0-9]{2})*$/;

export const ERC7710_ROOT_AUTHORITY =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";

function hasTypeField(
  fields: Array<{ name?: unknown; type?: unknown }> | undefined,
  name: string,
  type: string,
): boolean {
  return !!fields?.some((field) => field.name === name && field.type === type);
}

export function isErc7710DelegationTypedData(
  typedData: unknown,
): typedData is Erc7710DelegationTypedData {
  if (!typedData || typeof typedData !== "object") return false;
  const data = typedData as {
    primaryType?: unknown;
    types?: Record<string, Array<{ name?: unknown; type?: unknown }>>;
    message?: Record<string, unknown>;
  };

  if (data.primaryType !== "Delegation") return false;
  if (!data.types || typeof data.types !== "object") return false;

  const delegationFields = data.types.Delegation;
  const caveatFields = data.types.Caveat;
  if (!Array.isArray(delegationFields) || !Array.isArray(caveatFields)) {
    return false;
  }

  const delegationShape =
    hasTypeField(delegationFields, "delegate", "address") &&
    hasTypeField(delegationFields, "delegator", "address") &&
    hasTypeField(delegationFields, "authority", "bytes32") &&
    hasTypeField(delegationFields, "caveats", "Caveat[]") &&
    hasTypeField(delegationFields, "salt", "uint256");

  const caveatShape =
    hasTypeField(caveatFields, "enforcer", "address") &&
    hasTypeField(caveatFields, "terms", "bytes");

  if (!delegationShape || !caveatShape) return false;

  const message = data.message;
  if (!message || typeof message !== "object") return false;
  if (typeof message.delegate !== "string" || !ADDRESS_RE.test(message.delegate)) {
    return false;
  }
  if (typeof message.delegator !== "string" || !ADDRESS_RE.test(message.delegator)) {
    return false;
  }
  if (typeof message.authority !== "string" || !HEX_RE.test(message.authority)) {
    return false;
  }
  if (typeof message.salt !== "string" && typeof message.salt !== "number") {
    return false;
  }
  if (!Array.isArray(message.caveats)) return false;

  return message.caveats.every((caveat) => {
    if (!caveat || typeof caveat !== "object") return false;
    const entry = caveat as Record<string, unknown>;
    return (
      typeof entry.enforcer === "string" &&
      ADDRESS_RE.test(entry.enforcer) &&
      typeof entry.terms === "string" &&
      HEX_RE.test(entry.terms) &&
      (entry.args === undefined ||
        (typeof entry.args === "string" && HEX_RE.test(entry.args)))
    );
  });
}

export function normalizeErc7710Delegation(
  typedData: Erc7710DelegationTypedData,
): Erc7710Delegation {
  return {
    delegate: typedData.message.delegate,
    delegator: typedData.message.delegator,
    authority: typedData.message.authority,
    caveats: typedData.message.caveats.map((caveat) => ({
      enforcer: caveat.enforcer,
      terms: caveat.terms,
      args:
        "args" in caveat && typeof caveat.args === "string"
          ? caveat.args
          : "0x",
    })),
    salt: String(typedData.message.salt),
  };
}

export function isRootAuthority(authority: string): boolean {
  return authority.toLowerCase() === ERC7710_ROOT_AUTHORITY;
}

export function formatHexByteLength(hex: string): string {
  if (!HEX_RE.test(hex)) return "Invalid bytes";
  const bytes = Math.max(0, (hex.length - 2) / 2);
  return `${bytes} byte${bytes === 1 ? "" : "s"}`;
}
