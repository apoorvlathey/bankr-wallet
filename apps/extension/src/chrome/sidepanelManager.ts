/** Compatibility facade. Windowing policy and effects live in `windowing/`. */
export {
  POPUP_PATH,
  isSidePanelSupported,
} from "./windowing/browserCapabilities";
export { initSidePanel } from "./windowing/initialization";
export {
  getSidePanelMode,
  isSidePanelSupportedAsync,
  setSidePanelMode,
  transitionSidePanelToPopup,
} from "./windowing/modeTransitions";
export type { PopupTransitionResult } from "./windowing/types";
