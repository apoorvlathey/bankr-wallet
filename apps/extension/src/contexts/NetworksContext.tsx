import React, { createContext, useState, useEffect, useContext } from "react";
import { NetworksInfo } from "@/types";
import { DEFAULT_NETWORKS } from "@/constants/networks";
import { normalizeNetworksInfo } from "@/lib/chains";

type NetworkContextType = {
  networksInfo: NetworksInfo | undefined;
  reloadRequired: boolean;
  setReloadRequired: React.Dispatch<React.SetStateAction<boolean>>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const NetworksContext = createContext<NetworkContextType>({
  networksInfo: undefined,
  reloadRequired: false,
  setReloadRequired: () => {},
});

export const NetworksProvider: React.FunctionComponent<{
  children: React.ReactNode;
}> = ({ children }) => {
  const [networksInfo, setNetworksInfo] = useState<NetworksInfo>();
  const [reloadRequired, setReloadRequired] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetch = async () => {
      try {
        const response = (await chrome.runtime.sendMessage({
          type: "ensureNetworksInfo",
        })) as { success?: boolean; networksInfo?: NetworksInfo } | undefined;
        if (!cancelled && response?.success && response.networksInfo) {
          setNetworksInfo(normalizeNetworksInfo(response.networksInfo));
          return;
        }
      } catch {
        // Fall back to direct read below; this keeps rendering resilient if the
        // service worker is restarting while the popup opens.
      }

      const { networksInfo: storedNetworksInfo } =
        (await chrome.storage.sync.get("networksInfo")) as {
          networksInfo: NetworksInfo | undefined;
        };

      if (!cancelled) {
        setNetworksInfo(
          normalizeNetworksInfo(storedNetworksInfo ?? DEFAULT_NETWORKS),
        );
      }
    };

    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string,
    ) => {
      if (areaName !== "sync" || !changes.networksInfo) return;
      setNetworksInfo(
        normalizeNetworksInfo(
          (changes.networksInfo.newValue as NetworksInfo | undefined) ??
            DEFAULT_NETWORKS,
        ),
      );
    };

    fetch();
    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      cancelled = true;
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  return (
    <NetworksContext.Provider
      value={{
        networksInfo,
        reloadRequired,
        setReloadRequired,
      }}
    >
      {children}
    </NetworksContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useNetworks = () => useContext(NetworksContext);
