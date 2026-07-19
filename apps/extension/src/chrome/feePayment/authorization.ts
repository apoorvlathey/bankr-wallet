import { numberToHex, type SignedAuthorization } from "viem";

import { assertAutomaticEip7702AuthorizationAllowed } from "../delegatedAuthorityPolicy";
import { signEip7702Authorization } from "../localSigner";
import type { CustomChainMeta } from "../localSigning/types";
import { WALLETCHAN_OFFICIAL_DELEGATE } from "./constants";
import type { Eip7702Authorization, Hex } from "./pimlicoTypes";

const DUMMY_AUTHORIZATION_WORD = `0x${"00".repeat(31)}01` as Hex;

/** Pimlico explicitly permits a well-formed dummy 7702 auth for estimation. */
export function createDummyFeePaymentAuthorization(params: {
  chainId: number;
  currentEoaNonce: number;
}): Eip7702Authorization {
  return {
    address: WALLETCHAN_OFFICIAL_DELEGATE,
    chainId: numberToHex(params.chainId),
    nonce: numberToHex(params.currentEoaNonce),
    r: DUMMY_AUTHORIZATION_WORD,
    s: DUMMY_AUTHORIZATION_WORD,
    v: "0x0",
    yParity: "0x0",
  };
}

export function toPimlicoEip7702Authorization(
  authorization: SignedAuthorization,
): Eip7702Authorization {
  const v = "v" in authorization ? authorization.v : undefined;
  const yParity =
    authorization.yParity ??
    (v === undefined ? undefined : Number(v >= 27n ? v - 27n : v));
  if (yParity !== 0 && yParity !== 1) {
    throw new Error("EIP-7702 authorization has invalid yParity");
  }
  return {
    address: authorization.address,
    chainId: numberToHex(authorization.chainId),
    nonce: numberToHex(authorization.nonce),
    r: authorization.r,
    s: authorization.s,
    yParity: numberToHex(yParity),
    ...(v === undefined ? {} : { v: numberToHex(v) }),
  };
}

/**
 * Sign a third-party-submitted 7702 authorization. Unlike WalletChan's direct
 * type-4 path, the nonce is the EOA's current nonce because the bundler is the
 * outer transaction sender and does not increment the EOA nonce first.
 */
export async function signFeePaymentEip7702Authorization(
  privateKey: Hex,
  params: {
    chainId: number;
    currentEoaNonce: number;
    rpcUrl?: string;
    customChainMeta?: CustomChainMeta;
  },
): Promise<Eip7702Authorization> {
  if (!Number.isSafeInteger(params.currentEoaNonce) || params.currentEoaNonce < 0) {
    throw new Error("EIP-7702 authorization nonce must be a safe integer");
  }
  assertAutomaticEip7702AuthorizationAllowed(WALLETCHAN_OFFICIAL_DELEGATE);
  const authorization = await signEip7702Authorization(privateKey, {
    contractAddress: WALLETCHAN_OFFICIAL_DELEGATE,
    chainId: params.chainId,
    nonce: params.currentEoaNonce,
    rpcUrl: params.rpcUrl,
    customChainMeta: params.customChainMeta,
  });
  return toPimlicoEip7702Authorization(authorization);
}
