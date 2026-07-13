import type { SignatureParams } from "../pendingSignatureStorage";

/** Extracts the signer address parameter for each supported signature method. */
export function extractSignerParam(
  method: SignatureParams["method"],
  params: any[],
): string | undefined {
  if (method === "personal_sign") return params?.[1];
  return params?.[0];
}
