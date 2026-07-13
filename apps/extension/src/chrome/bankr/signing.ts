import {
  recoverMessageAddress,
  recoverTypedDataAddress,
  type Hex,
} from "viem";
import {
  BankrApiError,
  extractBankrErrorMessage,
  isEvmAddress,
  normalizeSignMessageResponse,
  type SignMessageResponse,
} from "./response";
import { bankrFetchText } from "./transport";

/** Sign a personal message or typed-data payload through Bankr's remote signer. */
export async function signMessageViaApi(
  apiKey: string,
  method: string,
  params: any[],
  signal?: AbortSignal,
): Promise<SignMessageResponse> {
  let body: Record<string, any>;
  let expectedSigner: unknown;

  if (method === "personal_sign") {
    const hexMsg = params[0];
    let message = hexMsg;
    if (typeof hexMsg === "string" && hexMsg.startsWith("0x")) {
      try {
        const hex = hexMsg.slice(2);
        const bytes = new Uint8Array(
          hex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || [],
        );
        message = new TextDecoder().decode(bytes);
      } catch {
        message = hexMsg;
      }
    }
    body = { signatureType: "personal_sign", message };
    expectedSigner = params[1];
  } else if (method === "eth_sign") {
    // SECURITY: eth_sign signs an untyped raw digest and must stay rejected at
    // intake. Never map it onto personal_sign.
    throw new BankrApiError(
      "eth_sign is deprecated and unsafe; use personal_sign or eth_signTypedData_v4",
    );
  } else if (method.startsWith("eth_signTypedData")) {
    let typedData = params[1];
    if (typeof typedData === "string") {
      typedData = JSON.parse(typedData);
    }
    body = { signatureType: "eth_signTypedData_v4", typedData };
    expectedSigner = params[0];
  } else {
    throw new BankrApiError(`Unsupported signing method: ${method}`);
  }

  if (!isEvmAddress(expectedSigner)) {
    throw new BankrApiError("Signing request is missing a valid signer address");
  }

  const { response, text } = await bankrFetchText(
    "/wallet/sign",
    {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    },
    { action: "signature" },
  );

  if (!response.ok) {
    throw new BankrApiError(extractBankrErrorMessage(text), response.status);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new BankrApiError("Bankr returned invalid JSON for signature");
  }
  const result = normalizeSignMessageResponse(
    payload,
    expectedSigner,
    body.signatureType,
  );
  let recoveredSigner: string;
  try {
    recoveredSigner =
      body.signatureType === "personal_sign"
        ? await recoverMessageAddress({
            message: body.message,
            signature: result.signature as Hex,
          })
        : await recoverTypedDataAddress({
            ...(body.typedData as Parameters<
              typeof recoverTypedDataAddress
            >[0]),
            signature: result.signature as Hex,
          });
  } catch {
    throw new BankrApiError(
      "Bankr returned a signature that could not be verified",
    );
  }
  if (recoveredSigner.toLowerCase() !== expectedSigner.toLowerCase()) {
    throw new BankrApiError(
      "Bankr signature does not belong to the reviewed account",
    );
  }
  return result;
}

/** Verify a Bankr API key/account pair without creating an onchain effect. */
export async function verifyBankrCredentialAddress(
  apiKey: string,
  address: string,
  signal?: AbortSignal,
): Promise<void> {
  if (!isEvmAddress(address)) {
    throw new BankrApiError("Invalid Bankr account address");
  }
  const challenge = `WalletChan Bankr account verification:${address.toLowerCase()}`;
  const challengeHex = `0x${Array.from(
    new TextEncoder().encode(challenge),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("")}`;
  await signMessageViaApi(
    apiKey,
    "personal_sign",
    [challengeHex, address],
    signal,
  );
}
