import { useCallback, useEffect, useRef, useState } from "react";
import type { BrowserConnectedDapp } from "@/chrome/ensBrowsing/connectedDapps";

interface ConnectedDappsResponse {
  ok?: boolean;
  dapps?: BrowserConnectedDapp[];
}

export function useConnectedDapps(): BrowserConnectedDapp[] {
  const [dapps, setDapps] = useState<BrowserConnectedDapp[]>([]);
  const loadVersionRef = useRef(0);

  const load = useCallback(async () => {
    const loadVersion = ++loadVersionRef.current;
    const response = (await chrome.runtime
      .sendMessage({ type: "ens-list-connected-dapps" })
      .catch(() => null)) as ConnectedDappsResponse | null;
    if (loadVersion !== loadVersionRef.current) return;
    setDapps(response?.ok && Array.isArray(response.dapps) ? response.dapps : []);
  }, []);

  useEffect(() => {
    void load();
    const handlePermissionsChanged = (message: { type?: string }) => {
      if (message.type === "dappPermissionsChanged") void load();
    };
    const handleStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      if (areaName === "local" && "dappPermissions" in changes) void load();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void load();
    };
    chrome.runtime.onMessage.addListener(handlePermissionsChanged);
    chrome.storage.onChanged.addListener(handleStorageChanged);
    window.addEventListener("focus", load);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      loadVersionRef.current += 1;
      chrome.runtime.onMessage.removeListener(handlePermissionsChanged);
      chrome.storage.onChanged.removeListener(handleStorageChanged);
      window.removeEventListener("focus", load);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [load]);

  return dapps;
}
