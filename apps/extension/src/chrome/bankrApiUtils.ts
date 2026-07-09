export class BankrTypedDataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BankrTypedDataValidationError";
  }
}

/**
 * Bankr's signing API requires EIP-712 domain.chainId to be a JSON number,
 * while dapps commonly send decimal or hex strings over JSON-RPC.
 */
export function normalizeBankrTypedDataChainId(typedData: any): any {
  const rawChainId = typedData?.domain?.chainId;
  if (rawChainId === undefined || rawChainId === null) return typedData;

  if (typeof rawChainId === "number") {
    if (!Number.isSafeInteger(rawChainId) || rawChainId <= 0) {
      throw new BankrTypedDataValidationError("Invalid EIP-712 domain chainId");
    }
    return typedData;
  }

  const isSupportedString =
    typeof rawChainId === "string" &&
    (/^\d+$/.test(rawChainId) || /^0x[0-9a-f]+$/i.test(rawChainId));
  if (!isSupportedString && typeof rawChainId !== "bigint") {
    throw new BankrTypedDataValidationError("Invalid EIP-712 domain chainId");
  }

  const parsedChainId = BigInt(rawChainId);
  if (parsedChainId <= 0n || parsedChainId > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new BankrTypedDataValidationError("EIP-712 domain chainId is out of range");
  }

  return {
    ...typedData,
    domain: { ...typedData.domain, chainId: Number(parsedChainId) },
  };
}
