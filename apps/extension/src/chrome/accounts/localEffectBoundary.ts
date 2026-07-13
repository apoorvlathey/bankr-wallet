import { getAccountById } from "./repository";

export interface ExpectedLocalAccountEffectBinding {
  id: string;
  address: string;
  type: string;
}

/** Re-read the exact signer identity immediately before a local effect. */
export async function assertLocalAccountEffectBinding(
  expected: ExpectedLocalAccountEffectBinding,
): Promise<void> {
  const current = await getAccountById(expected.id);
  if (
    !current ||
    current.type !== expected.type ||
    current.address.toLowerCase() !== expected.address.toLowerCase()
  ) {
    throw new Error("Signing account is no longer available");
  }
}
