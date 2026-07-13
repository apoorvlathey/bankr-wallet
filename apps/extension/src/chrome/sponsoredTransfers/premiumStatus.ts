import { fetchTextBounded } from "../network/boundedHttp";
import {
  PREMIUM_RESPONSE_MAX_BYTES,
  PREMIUM_STATUS_API,
  PREMIUM_TIMEOUT_MS,
} from "./constants";
import { parsePremiumStatusResponse } from "./response";

export async function handleCheckPremiumStatus(address: string): Promise<{
  isPremium: boolean;
  balance: string;
  sponsoredTransfersEnabled: boolean;
}> {
  try {
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      return {
        isPremium: false,
        balance: "0",
        sponsoredTransfersEnabled: false,
      };
    }
    const { response, text } = await fetchTextBounded(
      `${PREMIUM_STATUS_API}?address=${encodeURIComponent(address)}`,
      { method: "GET" },
      { timeoutMs: PREMIUM_TIMEOUT_MS, maxBytes: PREMIUM_RESPONSE_MAX_BYTES },
    );
    if (!response.ok) {
      return {
        isPremium: false,
        balance: "0",
        sponsoredTransfersEnabled: false,
      };
    }
    return parsePremiumStatusResponse(text);
  } catch {
    return {
      isPremium: false,
      balance: "0",
      sponsoredTransfersEnabled: false,
    };
  }
}
