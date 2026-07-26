import { useEffect, useState } from "react";
import type { DappConnectionReputation } from "@/chrome/dapp/reputationModel";

export type DappConnectionReputationState =
  | { status: "loading"; reputation: null }
  | { status: "ready"; reputation: DappConnectionReputation };

interface ReputationResponse {
  success?: boolean;
  reputation?: DappConnectionReputation;
}

const unavailable: DappConnectionReputation = {
  status: "unverified",
  reason: "check-unavailable",
};

export function useDappConnectionReputation(
  requestId: string,
): DappConnectionReputationState {
  const [state, setState] = useState<{
    requestId: string;
    value: DappConnectionReputationState;
  }>({
    requestId: "",
    value: { status: "loading", reputation: null },
  });

  useEffect(() => {
    let active = true;
    setState({
      requestId,
      value: { status: "loading", reputation: null },
    });
    chrome.runtime
      .sendMessage({ type: "getDappConnectionReputation", requestId })
      .then((response: ReputationResponse | undefined) => {
        if (!active) return;
        setState({
          requestId,
          value: {
            status: "ready",
            reputation:
              response?.success && response.reputation
                ? response.reputation
                : unavailable,
          },
        });
      })
      .catch(() => {
        if (active) {
          setState({
            requestId,
            value: { status: "ready", reputation: unavailable },
          });
        }
      });
    return () => {
      active = false;
    };
  }, [requestId]);

  return state.requestId === requestId
    ? state.value
    : { status: "loading", reputation: null };
}
