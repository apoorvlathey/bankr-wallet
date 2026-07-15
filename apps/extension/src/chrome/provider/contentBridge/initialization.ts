import type { NetworksInfo } from "@/types";
import {
  bridgeState,
  UNCONNECTED_ADDRESS,
} from "./bridgeState";

export async function initializeInpageProvider(): Promise<void> {
  try {
    const script = document.createElement("script");
    script.setAttribute("type", "text/javascript");
    script.src = chrome.runtime.getURL("/static/js/inpage.js");
    script.onload = async function () {
      script.remove();
      const [account, syncState, dappAccounts] = await Promise.all([
        chrome.runtime.sendMessage({ type: "getActiveAccount" }).catch(() => null),
        chrome.storage.sync.get([
          "address",
          "displayAddress",
          "chainName",
          "networksInfo",
        ]),
        chrome.runtime
          .sendMessage({ type: "getDappAccounts" })
          .catch(() => ({ accounts: [] })),
      ]);
      const address = account?.address || syncState.address;
      const displayAddress =
        account?.displayName ||
        account?.address ||
        syncState.displayAddress ||
        address;
      const chainName = syncState.chainName as string | undefined;
      const networksInfo = syncState.networksInfo as NetworksInfo | undefined;

      if (!networksInfo || !chainName || !networksInfo[chainName] || !address || !displayAddress) {
        return;
      }
      Object.assign(bridgeState, {
        address,
        displayAddress,
        chainName,
        chainId: networksInfo[chainName].chainId,
        dappConnected:
          Array.isArray(dappAccounts?.accounts) &&
          typeof dappAccounts.accounts[0] === "string",
        accountId: account?.id || "",
        accountType: account?.type || "",
      });
      window.postMessage(
        {
          type: "init",
          msg: {
            address:
              Array.isArray(dappAccounts?.accounts) &&
              typeof dappAccounts.accounts[0] === "string"
                ? dappAccounts.accounts[0]
                : UNCONNECTED_ADDRESS,
            chainId: networksInfo[chainName].chainId,
          },
        },
        "*",
      );
    };
    (document.head ?? document.documentElement).prepend(script);
  } catch (error) {
    console.log(error);
  }
}
