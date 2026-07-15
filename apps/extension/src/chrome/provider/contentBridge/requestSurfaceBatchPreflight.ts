import {
  ALLOWED_CHAIN_IDS,
  BANKR_SUPPORTED_CHAIN_IDS,
} from "@/constants/chainRegistry";

function addressMatches(value: unknown, activeAddress: string): boolean {
  return (
    typeof value === "string" &&
    value.toLowerCase() === activeAddress.toLowerCase()
  );
}

/** Mirrors every synchronous ERC-5792 rejection that runs before persistence. */
export function batchPassesSurfacePreflight(
  params: Record<string, any>,
  accountType: string,
  activeAddress: string,
): boolean {
  if (
    accountType !== "bankr" &&
    accountType !== "privateKey" &&
    accountType !== "seedPhrase" &&
    accountType !== "impersonator"
  ) {
    return false;
  }

  const chainId = Number(params.chainId);
  const supportedChains =
    accountType === "bankr" ? BANKR_SUPPORTED_CHAIN_IDS : ALLOWED_CHAIN_IDS;
  if (!supportedChains.has(chainId)) return false;
  if (
    params.from !== undefined &&
    !addressMatches(params.from, activeAddress)
  ) {
    return false;
  }

  for (const call of params.calls as Array<Record<string, any>>) {
    if (
      call.from !== undefined &&
      !addressMatches(call.from, activeAddress)
    ) {
      return false;
    }
    if (!addressMatches(call.to, activeAddress)) continue;
    const data = call.data ?? "0x";
    const value = call.value ?? "0x0";
    const hasPayload =
      (data !== "0x" && data !== "0x0" && data.length > 2) ||
      (value !== "0x" && value !== "0x0" && BigInt(value) > 0n);
    if (hasPayload) return false;
  }

  return true;
}
