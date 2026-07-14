import { useCallback } from "react";

import {
  normalizeSavedRpcEndpoints,
  type SavedRpcEndpoint,
} from "@/lib/chains";
import { useBuiltInRpcPersistence } from "./useBuiltInRpcPersistence";
import { useNetworkRpcEndpoints } from "./useNetworkRpcEndpoints";

type UseEditChainRpcEndpointsParams = {
  isCustom: boolean;
  chainName: string;
  chainId?: number;
  currentRpcUrl?: string;
  selectedRpcUrl: string;
  onSelectedRpcChange: (rpcUrl: string) => void;
  onSelectionReset: () => void;
};

export function useEditChainRpcEndpoints({
  isCustom,
  chainName,
  chainId,
  currentRpcUrl,
  selectedRpcUrl,
  onSelectedRpcChange,
  onSelectionReset,
}: UseEditChainRpcEndpointsParams) {
  const {
    rpcEndpoints,
    setRpcEndpoints,
    isLoading: isHistoryLoading,
  } = useNetworkRpcEndpoints(chainId, currentRpcUrl);

  const handleBuiltInRpcSaved = useCallback(
    ({ rpcUrl, endpoints }: { rpcUrl: string; endpoints: SavedRpcEndpoint[] }) => {
      setRpcEndpoints(endpoints);
      onSelectedRpcChange(rpcUrl);
    },
    [onSelectedRpcChange, setRpcEndpoints],
  );

  const persistence = useBuiltInRpcPersistence({
    enabled: !isCustom,
    chainName,
    chainId,
    activeRpcUrl: selectedRpcUrl,
    onSaved: handleBuiltInRpcSaved,
  });

  const selectLocally = useCallback(
    (rpcUrl: string) => {
      onSelectedRpcChange(rpcUrl);
      onSelectionReset();
    },
    [onSelectedRpcChange, onSelectionReset],
  );

  const persist = useCallback(
    (rpcUrl: string, endpoints: SavedRpcEndpoint[]) => {
      if (isCustom) {
        setRpcEndpoints(endpoints);
        selectLocally(rpcUrl);
        return;
      }
      void persistence.persist({ rpcUrl, endpoints });
    },
    [isCustom, persistence, selectLocally, setRpcEndpoints],
  );

  const select = useCallback(
    (rpcUrl: string) => {
      persist(rpcUrl, normalizeSavedRpcEndpoints(rpcUrl, rpcEndpoints));
    },
    [persist, rpcEndpoints],
  );

  const add = useCallback(
    (endpoint: SavedRpcEndpoint) => {
      persist(
        endpoint.url,
        normalizeSavedRpcEndpoints(endpoint.url, [...rpcEndpoints, endpoint]),
      );
    },
    [persist, rpcEndpoints],
  );

  const update = useCallback(
    (previousUrl: string, endpoint: SavedRpcEndpoint) => {
      const isSelectedEndpoint = selectedRpcUrl === previousUrl;
      const nextSelectedUrl = isSelectedEndpoint
        ? endpoint.url
        : selectedRpcUrl;
      const endpoints = normalizeSavedRpcEndpoints(
        nextSelectedUrl,
        rpcEndpoints.map((saved) =>
          saved.url === previousUrl ? endpoint : saved,
        ),
      );

      if (isCustom) {
        setRpcEndpoints(endpoints);
        if (isSelectedEndpoint) selectLocally(endpoint.url);
        return;
      }
      void persistence.persist({ rpcUrl: nextSelectedUrl, endpoints });
    },
    [
      isCustom,
      persistence,
      rpcEndpoints,
      selectedRpcUrl,
      selectLocally,
      setRpcEndpoints,
    ],
  );

  const remove = useCallback(
    (rpcUrl: string, nextSelectedUrl: string) => {
      persist(
        nextSelectedUrl,
        normalizeSavedRpcEndpoints(
          nextSelectedUrl,
          rpcEndpoints.filter((candidate) => candidate.url !== rpcUrl),
        ),
      );
    },
    [persist, rpcEndpoints],
  );

  return {
    rpcEndpoints,
    isHistoryLoading,
    persistence,
    select,
    add,
    update,
    remove,
  };
}
