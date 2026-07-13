/** Personal-message and EIP-712 signing policy for local accounts. */

import { privateKeyToAccount } from "viem/accounts";

export async function signMessage(
  privateKey: `0x${string}`,
  message: string | Uint8Array,
): Promise<string> {
  const account = privateKeyToAccount(privateKey);
  let messageToSign: string | { raw: Uint8Array };
  if (typeof message === "string") {
    if (message.startsWith("0x")) {
      const hex = message.slice(2);
      const bytes = new Uint8Array(
        hex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
      );
      messageToSign = { raw: bytes };
    } else {
      messageToSign = message;
    }
  } else {
    messageToSign = { raw: message };
  }
  return account.signMessage({ message: messageToSign });
}

export async function signTypedData(
  privateKey: `0x${string}`,
  typedData: any,
  chainId: number,
): Promise<string> {
  const account = privateKeyToAccount(privateKey);
  const data = typeof typedData === "string" ? JSON.parse(typedData) : typedData;

  if (
    data?.domain &&
    data.domain.chainId !== undefined &&
    data.domain.chainId !== null
  ) {
    const domainChainId = Number(data.domain.chainId);
    if (Number.isFinite(domainChainId) && domainChainId !== chainId) {
      throw new Error(
        `Provided chainId "${domainChainId}" must match the active chainId "${chainId}"`,
      );
    }
  }

  return account.signTypedData({
    domain: data.domain,
    types: data.types,
    primaryType: data.primaryType,
    message: data.message,
  });
}

export async function handleSignatureRequest(
  privateKey: `0x${string}`,
  method: string,
  params: any[],
  chainId: number,
): Promise<string> {
  const derivedAddress = privateKeyToAccount(privateKey).address.toLowerCase();
  let signerParam: string | undefined;
  if (method === "personal_sign") signerParam = params[1];
  else if (
    method === "eth_sign" ||
    method === "eth_signTypedData" ||
    method === "eth_signTypedData_v3" ||
    method === "eth_signTypedData_v4"
  ) {
    signerParam = params[0];
  }
  if (
    typeof signerParam === "string" &&
    signerParam.toLowerCase() !== derivedAddress
  ) {
    throw new Error("Signer address does not match active account");
  }

  switch (method) {
    case "personal_sign":
      return signMessage(privateKey, params[0]);
    case "eth_sign":
      throw new Error(
        "eth_sign is deprecated and unsafe; use personal_sign or eth_signTypedData_v4",
      );
    case "eth_signTypedData":
    case "eth_signTypedData_v3":
    case "eth_signTypedData_v4":
      return signTypedData(privateKey, params[1], chainId);
    default:
      throw new Error(`Unsupported signature method: ${method}`);
  }
}
