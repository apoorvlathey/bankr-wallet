import {
  USDC_LOGO_URL,
  WALLETCHAN_PREMIUM_STATUS_API,
  WALLETCHAN_SPONSORED_TRANSFER_API,
} from "@/constants/externalUrls";

export const BASE_USDC_ADDRESS =
  "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
export const SPONSORED_TRANSFER_API = WALLETCHAN_SPONSORED_TRANSFER_API;
export const PREMIUM_STATUS_API = WALLETCHAN_PREMIUM_STATUS_API;
export { USDC_LOGO_URL };

export const RELAYER_TIMEOUT_MS = 45_000;
export const PREMIUM_TIMEOUT_MS = 15_000;
export const RELAYER_RESPONSE_MAX_BYTES = 256 * 1024;
export const PREMIUM_RESPONSE_MAX_BYTES = 64 * 1024;

export const USDC_DOMAIN = {
  name: "USD Coin",
  version: "2",
  chainId: 8453,
  verifyingContract: BASE_USDC_ADDRESS as `0x${string}`,
};

export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
};
