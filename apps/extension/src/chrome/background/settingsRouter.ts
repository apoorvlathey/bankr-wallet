/**
 * Focused transport for network configuration and extension display
 * mode. Provider-facing add-chain prompts remain in the main provider router.
 * Network locking and sidepanel browser policy remain in their domain modules.
 */

import { getActiveAccount } from "../accountStorage";
import {
  addNetworkIfMissing,
  deleteNetworkEntry,
  ensureNetworksInfo,
  setNetworkHiddenState,
  updateNetworkEntry,
} from "../networkStorage";
import {
  getSidePanelMode,
  isSidePanelSupportedAsync,
  setSidePanelMode,
  transitionSidePanelToPopup,
} from "../sidepanelManager";

export const BACKGROUND_SETTINGS_MESSAGE_TYPES = [
  "ensureNetworksInfo",
  "addNetwork",
  "updateNetwork",
  "setNetworkHidden",
  "deleteNetwork",
  "setArcBrowser",
  "isSidePanelSupported",
  "getSidePanelMode",
  "setSidePanelMode",
  "switchSidePanelToPopup",
  "openPopupWindow",
] as const;

export type BackgroundSettingsRouteResult =
  | { handled: false }
  | { handled: true; keepChannelOpen: boolean };

type Dependencies = {
  getActiveAccount: typeof getActiveAccount;
  addNetworkIfMissing: typeof addNetworkIfMissing;
  deleteNetworkEntry: typeof deleteNetworkEntry;
  ensureNetworksInfo: typeof ensureNetworksInfo;
  setNetworkHiddenState: typeof setNetworkHiddenState;
  updateNetworkEntry: typeof updateNetworkEntry;
  getSidePanelMode: typeof getSidePanelMode;
  isSidePanelSupportedAsync: typeof isSidePanelSupportedAsync;
  setSidePanelMode: typeof setSidePanelMode;
  transitionSidePanelToPopup: typeof transitionSidePanelToPopup;
  openPopupWindow: () => Promise<void>;
  setSyncStorage: (values: Record<string, unknown>) => Promise<void>;
  setActionPopup: (popup: string) => Promise<void>;
  popupPath: string;
};

type EnvironmentDependencies = Pick<
  Dependencies,
  "openPopupWindow" | "setSyncStorage" | "setActionPopup" | "popupPath"
>;

const productionDomainDependencies: Omit<
  Dependencies,
  keyof EnvironmentDependencies
> = {
  getActiveAccount,
  addNetworkIfMissing,
  deleteNetworkEntry,
  ensureNetworksInfo,
  setNetworkHiddenState,
  updateNetworkEntry,
  getSidePanelMode,
  isSidePanelSupportedAsync,
  setSidePanelMode,
  transitionSidePanelToPopup,
};

const HANDLED_ASYNC: BackgroundSettingsRouteResult = {
  handled: true,
  keepChannelOpen: true,
};
const HANDLED_SYNC: BackgroundSettingsRouteResult = {
  handled: true,
  keepChannelOpen: false,
};

export function createBackgroundSettingsMessageRouter(
  environment: EnvironmentDependencies,
  overrides: Partial<Dependencies> = {},
): (
  message: any,
  sendResponse: (response?: any) => void,
) => BackgroundSettingsRouteResult {
  const dependencies: Dependencies = {
    ...productionDomainDependencies,
    ...environment,
    ...overrides,
  };

  return (message, sendResponse) => {
    switch (message?.type) {
      case "ensureNetworksInfo": {
        dependencies.ensureNetworksInfo().then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "addNetwork": {
        dependencies
          .addNetworkIfMissing({
            chainName: message.chainName,
            entry: message.entry,
          })
          .then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "updateNetwork": {
        dependencies
          .updateNetworkEntry({
            chainName: message.chainName,
            nextChainName: message.nextChainName,
            entry: message.entry,
          })
          .then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "setNetworkHidden": {
        void (async () => {
          const activeAccount = await dependencies.getActiveAccount();
          const result = await dependencies.setNetworkHiddenState({
            chainName: message.chainName,
            hidden: message.hidden,
            activeAccountType: activeAccount?.type,
          });
          sendResponse(result);
        })();
        return HANDLED_ASYNC;
      }

      case "deleteNetwork": {
        void (async () => {
          const activeAccount = await dependencies.getActiveAccount();
          const result = await dependencies.deleteNetworkEntry({
            chainName: message.chainName,
            activeAccountType: activeAccount?.type,
          });
          sendResponse(result);
        })();
        return HANDLED_ASYNC;
      }

      case "setArcBrowser": {
        if (message.isArc) {
          void dependencies.setSyncStorage({
            sidePanelMode: false,
            isArcBrowser: true,
          });
          dependencies.setActionPopup(dependencies.popupPath).catch(() => {});
        }
        sendResponse({ success: true });
        return HANDLED_SYNC;
      }

      case "isSidePanelSupported": {
        dependencies.isSidePanelSupportedAsync().then((supported) => {
          sendResponse({ supported });
        });
        return HANDLED_ASYNC;
      }

      case "getSidePanelMode": {
        dependencies.getSidePanelMode().then((enabled) => {
          sendResponse({ enabled });
        });
        return HANDLED_ASYNC;
      }

      case "setSidePanelMode": {
        dependencies.setSidePanelMode(message.enabled).then((success) => {
          sendResponse({
            success,
            sidePanelWorks: success || !message.enabled,
          });
        });
        return HANDLED_ASYNC;
      }

      case "switchSidePanelToPopup": {
        const windowId =
          typeof message.windowId === "number" ? message.windowId : undefined;
        dependencies
          .transitionSidePanelToPopup(windowId, dependencies.openPopupWindow)
          .then(sendResponse);
        return HANDLED_ASYNC;
      }

      case "openPopupWindow": {
        dependencies.openPopupWindow().then(() => {
          sendResponse({ success: true });
        });
        return HANDLED_ASYNC;
      }

      default:
        return { handled: false };
    }
  };
}
