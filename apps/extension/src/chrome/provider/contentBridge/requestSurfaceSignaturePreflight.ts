import { validateEIP712TypedData } from "../../eip712Validator";

function parsedTypedData(value: unknown): Record<string, any> | null {
  if (typeof value !== "string") {
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, any>)
      : null;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

/** Mirrors every synchronous signature rejection that runs before persistence. */
export function signaturePassesSurfacePreflight(
  method: unknown,
  params: unknown,
  requestChainId: unknown,
): boolean {
  if (
    method !== "eth_signTypedData_v3" &&
    method !== "eth_signTypedData_v4"
  ) {
    return true;
  }
  if (!Array.isArray(params)) return false;

  const validation = validateEIP712TypedData(method, params[1]);
  if (!validation.valid) return false;

  const typedData = parsedTypedData(validation.sanitized ?? params[1]);
  const domainChainId = typedData?.domain?.chainId;
  if (domainChainId === undefined || domainChainId === null) return true;

  const numericDomainChainId = Number(domainChainId);
  return (
    !Number.isFinite(numericDomainChainId) ||
    numericDomainChainId === requestChainId
  );
}
