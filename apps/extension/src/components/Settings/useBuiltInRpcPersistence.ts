import { useCallback, useRef, useState } from "react";
import { probeRpcChainId } from "@/chrome/network/rpcClient";
import type { SavedRpcEndpoint } from "@/lib/chains";

export type BuiltInRpcChange = {
  rpcUrl: string;
  endpoints: SavedRpcEndpoint[];
};

type UseBuiltInRpcPersistenceOptions = {
  enabled: boolean;
  chainName: string;
  chainId: number | undefined;
  activeRpcUrl: string;
  onSaved: (change: BuiltInRpcChange) => void;
};

type NetworkUpdateResponse = {
  success?: boolean;
  error?: string;
};

export function useBuiltInRpcPersistence({
  enabled,
  chainName,
  chainId,
  activeRpcUrl,
  onSaved,
}: UseBuiltInRpcPersistenceOptions) {
  const [isSaving, setIsSaving] = useState(false);
  const [warning, setWarning] = useState("");
  const [pendingChange, setPendingChange] =
    useState<BuiltInRpcChange | null>(null);
  const inFlight = useRef(false);

  const persist = useCallback(
    async (change: BuiltInRpcChange, skipProbe = false): Promise<boolean> => {
      if (!enabled || !chainId || inFlight.current) return false;

      inFlight.current = true;
      setIsSaving(true);
      setWarning("");
      setPendingChange(null);

      try {
        if (!skipProbe && change.rpcUrl !== activeRpcUrl) {
          const detectedId = await probeRpcChainId(change.rpcUrl, {
            allowPrivateWithoutOrigin: true,
          });

          if (detectedId === null) {
            setWarning(
              "Could not reach this RPC endpoint. Use it anyway?",
            );
            setPendingChange(change);
            return false;
          }
          if (detectedId !== chainId) {
            setWarning(
              `RPC returned chain ID ${detectedId}, expected ${chainId}. Use it anyway?`,
            );
            setPendingChange(change);
            return false;
          }
        }

        const response = (await chrome.runtime.sendMessage({
          type: "updateNetwork",
          chainName,
          nextChainName: chainName,
          rpcEndpoints: change.endpoints,
          entry: {
            chainId,
            rpcUrl: change.rpcUrl,
          },
        })) as NetworkUpdateResponse | undefined;

        if (!response?.success) {
          setWarning(response?.error || "Failed to save RPC endpoints.");
          return false;
        }

        onSaved(change);
        return true;
      } catch (error) {
        setWarning(
          error instanceof Error
            ? error.message
            : "Failed to save RPC endpoints.",
        );
        return false;
      } finally {
        inFlight.current = false;
        setIsSaving(false);
      }
    },
    [activeRpcUrl, chainId, chainName, enabled, onSaved],
  );

  const forceSave = useCallback(async (): Promise<boolean> => {
    if (!pendingChange) return false;
    return persist(pendingChange, true);
  }, [pendingChange, persist]);

  return {
    isSaving,
    warning,
    requiresConfirmation: pendingChange !== null,
    persist,
    forceSave,
  };
}
