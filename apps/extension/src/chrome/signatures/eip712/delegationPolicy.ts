/** Raw ERC-7710 signatures bypass WalletChan's permission grant policy. */

export const RAW_ERC7710_DELEGATION_SIGNATURE_ERROR =
  "Use wallet_requestExecutionPermissions for delegated permissions. Raw delegation signatures are not supported.";

export function isRawErc7710DelegationSignatureRequest(
  method: string,
  typedData: unknown,
): boolean {
  if (method !== "eth_signTypedData_v3" && method !== "eth_signTypedData_v4") {
    return false;
  }

  let data: any;
  try {
    data = typeof typedData === "string" ? JSON.parse(typedData) : typedData;
  } catch {
    return false;
  }
  if (!data || typeof data !== "object" || data.primaryType !== "Delegation") {
    return false;
  }

  const message = data.message;
  const fields = Array.isArray(data.types?.Delegation)
    ? data.types.Delegation
    : [];
  const hasField = (name: string, type: string) =>
    fields.some(
      (field: { name?: unknown; type?: unknown }) =>
        field.name === name && field.type === type,
    );
  const declaredShape =
    hasField("delegate", "address") &&
    hasField("delegator", "address") &&
    hasField("authority", "bytes32") &&
    hasField("caveats", "Caveat[]");

  if (!message || typeof message !== "object") return declaredShape;
  const messageShape =
    typeof message.delegate === "string" &&
    typeof message.delegator === "string" &&
    typeof message.authority === "string" &&
    Array.isArray(message.caveats);
  return declaredShape || messageShape;
}
