import type { Account } from "../../types";

export type TabAccountLifecycleDependencies = {
  activatedEvent: {
    addListener: (listener: (info: { tabId: number }) => void) => void;
  };
  updatedEvent: {
    addListener: (
      listener: (
        tabId: number,
        changeInfo: { url?: string; status?: string },
      ) => void,
    ) => void;
  };
  removedEvent: {
    addListener: (listener: (tabId: number) => void) => void;
  };
  replacedEvent: {
    addListener: (
      listener: (addedTabId: number, removedTabId: number) => void,
    ) => void;
  };
  activateBrowserTabAccount: (tabId: number) => Promise<unknown>;
  resolveBrowserTabAccount: (tabId: number) => Promise<unknown>;
  clearTabAccount: (tabId: number) => Promise<unknown>;
  replaceBrowserTabAccountScope: (
    addedTabId: number,
    removedTabId: number,
  ) => Promise<unknown>;
};

export function registerTabAccountLifecycle(
  dependencies: TabAccountLifecycleDependencies,
): void {
  dependencies.activatedEvent.addListener(({ tabId }) => {
    void dependencies.activateBrowserTabAccount(tabId).catch(() => {});
  });
  dependencies.updatedEvent.addListener((tabId, changeInfo) => {
    if (!changeInfo.url && changeInfo.status !== "complete") return;
    void dependencies.resolveBrowserTabAccount(tabId).catch(() => {});
  });
  dependencies.removedEvent.addListener((tabId) => {
    void dependencies.clearTabAccount(tabId).catch(() => {});
  });
  dependencies.replacedEvent.addListener((addedTabId, removedTabId) => {
    void dependencies
      .replaceBrowserTabAccountScope(addedTabId, removedTabId)
      .catch(() => {});
  });
}

export function createSendAccountToTab(
  sendTabMessage: (tabId: number, message: any) => Promise<unknown>,
): (tabId: number, account: Account) => Promise<void> {
  return async (tabId, account) => {
    await sendTabMessage(tabId, {
      type: "setAccount",
      msg: {
        address: account.address,
        displayAddress: account.displayName || account.address,
        accountId: account.id,
        accountType: account.type,
      },
    }).catch(() => {});
  };
}
