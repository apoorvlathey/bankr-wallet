import { useEffect, useMemo, useRef, useState } from "react";
import type { SafeCall } from "@/chrome/safe/types";
import { decodeRecursive } from "@/lib/decoder";

/** Resolve the same local calldata names used by transaction details. */
export function useSafeProposalFunctionNames(
  proposalId: string,
  calls: readonly SafeCall[],
): Readonly<Record<number, string>> {
  const decodeKey = useMemo(
    () => `${proposalId}:${calls.map((call) => call.data).join(":")}`,
    [calls, proposalId],
  );
  const callsRef = useRef(calls);
  callsRef.current = calls;
  const [resolved, setResolved] = useState<{
    key: string;
    names: Record<number, string>;
  }>({ key: decodeKey, names: {} });

  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      callsRef.current.map(async (call, index) => {
        if (!call.data || call.data === "0x") return null;
        try {
          const decoded = await decodeRecursive({ calldata: call.data });
          return decoded?.functionName
            ? ([index, decoded.functionName] as const)
            : null;
        } catch {
          return null;
        }
      }),
    ).then((decoded) => {
      if (cancelled) return;
      setResolved({
        key: decodeKey,
        names: Object.fromEntries(decoded.filter((item) => item !== null)),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [decodeKey]);

  return resolved.key === decodeKey ? resolved.names : {};
}
