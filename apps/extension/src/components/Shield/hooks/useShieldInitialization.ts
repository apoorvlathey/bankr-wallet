import { useCallback, useEffect, useRef, useState } from "react";

export type ShieldInitializationState =
  | { status: "loading"; error: null }
  | { status: "ready"; error: null }
  | { status: "auth-required"; error: null }
  | { status: "action-required"; error: string };

const FALLBACK_ERROR = "Shield setup needs attention before you continue.";

function parseInitializationResponse(
  response: unknown,
): ShieldInitializationState {
  if (
    typeof response === "object" &&
    response !== null &&
    "success" in response &&
    response.success === true &&
    "status" in response &&
    response.status === "ready"
  ) {
    return { status: "ready", error: null };
  }
  if (
    typeof response === "object" &&
    response !== null &&
    "success" in response &&
    response.success === false &&
    "code" in response &&
    response.code === "auth-required"
  ) {
    return { status: "auth-required", error: null };
  }
  const error =
    typeof response === "object" &&
    response !== null &&
    "error" in response &&
    typeof response.error === "string" &&
    response.error.length <= 240
      ? response.error
      : FALLBACK_ERROR;
  return { status: "action-required", error };
}

export function useShieldInitialization(): {
  initialization: ShieldInitializationState;
  retry: () => void;
} {
  const [initialization, setInitialization] =
    useState<ShieldInitializationState>({ status: "loading", error: null });
  const mounted = useRef(true);
  const requestGeneration = useRef(0);

  const initialize = useCallback(() => {
    const generation = ++requestGeneration.current;
    setInitialization({ status: "loading", error: null });
    chrome.runtime
      .sendMessage({ type: "privacyEnsureInitialized" })
      .then((response) => {
        if (mounted.current && requestGeneration.current === generation) {
          setInitialization(parseInitializationResponse(response));
        }
      })
      .catch(() => {
        if (mounted.current && requestGeneration.current === generation) {
          setInitialization({
            status: "action-required",
            error: FALLBACK_ERROR,
          });
        }
      });
  }, []);

  useEffect(() => {
    mounted.current = true;
    initialize();
    return () => {
      mounted.current = false;
      requestGeneration.current += 1;
    };
  }, [initialize]);

  return {
    initialization,
    retry: () => {
      initialize();
    },
  };
}
