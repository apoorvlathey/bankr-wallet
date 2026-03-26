export interface WindowState {
  id: string;
  /** null for special windows like App Store */
  dappId: number | null;
  customUrl?: string;
  customName?: string;
  position: { x: number; y: number };
  size: { w: number; h: number };
  chainId: number;
  isMinimized: boolean;
  isMaximized: boolean;
  zIndex: number;
}

/** A user-installed custom dapp (not in the built-in DAPPS list) */
export interface CustomApp {
  url: string;
  name: string;
  /** Google favicon URL, derived at install time */
  iconUrl: string;
}

/** Widget instance on the desktop */
export interface WidgetState {
  id: string;
  /** Registry key, e.g. "gecko-chart" */
  type: string;
  position: { x: number; y: number };
  size: { w: number; h: number };
  zIndex: number;
  /** Type-specific config. null = unconfigured (show config prompt) */
  config: Record<string, unknown> | null;
  /** Distance from the right edge of the screen — used to maintain relative position on resize */
  rightOffset?: number;
}

export interface DesktopPersistedState {
  installedAppIds: number[];
  customApps?: CustomApp[];
  windows?: WindowState[];
  focusedWindowId?: string | null;
  widgets?: WidgetState[];
}

/** Default pre-installed dapp IDs (first 8 from popularity-sorted dapps.json) */
export const DEFAULT_INSTALLED_IDS = [
  38,         // Uniswap
  1753279954, // DefiLlama Swap
  44,         // Yearn
  151,        // Aerodrome Finance
  74,         // CoW Swap
  88,         // Revoke.cash
  21,         // DeFi Saver
  20,         // Curve Finance
];

/** Special window ID for the App Store */
export const APP_STORE_WINDOW_ID = "__app-store__";

/** Special window IDs for system panels */
export const SWAP_WINDOW_ID = "__system-swap__";
export const STAKE_WINDOW_ID = "__system-stake__";

/** Special window ID for the Widget Store */
export const WIDGET_STORE_WINDOW_ID = "__widget-store__";
