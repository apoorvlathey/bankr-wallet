// Typed wrapper around the single `ensBrowsing` chrome.storage.local key.
//
// Schema:
//   {
//     enabled?: boolean;
//     useLocalGateway?: boolean;
//     pinOnchainHtml?: boolean;
//     gatewayHost?: string;   // e.g. "localhost" (default) or "mytld"
//     gatewayPort?: number;   // e.g. 8080 (default)
//   }
//
// Absence of the key OR absence of `enabled` is interpreted as ON, so existing
// users get the feature enabled on update without a fresh opt-in. The
// local-gateway and pin-onchain options default OFF. Gateway host/port default
// to Kubo's standard `localhost:8080` subdomain gateway.
//
// Legacy shape (`tier1` / `tier2aLocalIpfs` / `tier2bKubo`) is migrated on read
// so user settings persist across the rename.

const KEY = "ensBrowsing";

export const DEFAULT_GATEWAY_HOST = "localhost";
export const DEFAULT_GATEWAY_PORT = 8080;

export type EnsBrowsingSettings = {
  enabled: boolean;
  useLocalGateway: boolean;
  pinOnchainHtml: boolean;
  gatewayHost: string;
  gatewayPort: number;
};

type LegacyShape = {
  tier1?: boolean;
  tier2aLocalIpfs?: boolean;
  tier2bKubo?: boolean;
};

type StoredShape = Partial<EnsBrowsingSettings> & LegacyShape;

export const DEFAULT_ENS_BROWSING_SETTINGS: EnsBrowsingSettings = {
  enabled: true,
  useLocalGateway: false,
  pinOnchainHtml: false,
  gatewayHost: DEFAULT_GATEWAY_HOST,
  gatewayPort: DEFAULT_GATEWAY_PORT,
};

function normalize(raw: StoredShape | undefined): EnsBrowsingSettings {
  const enabledNew = raw?.enabled;
  const enabledLegacy = raw?.tier1;
  const host =
    typeof raw?.gatewayHost === "string" && raw.gatewayHost.trim()
      ? raw.gatewayHost.trim().toLowerCase()
      : DEFAULT_GATEWAY_HOST;
  const portRaw = raw?.gatewayPort;
  const port =
    typeof portRaw === "number" && Number.isInteger(portRaw) && portRaw > 0 && portRaw <= 65535
      ? portRaw
      : DEFAULT_GATEWAY_PORT;
  return {
    enabled:
      enabledNew !== undefined
        ? enabledNew !== false
        : enabledLegacy !== false,
    useLocalGateway:
      raw?.useLocalGateway === true || raw?.tier2aLocalIpfs === true,
    pinOnchainHtml:
      raw?.pinOnchainHtml === true || raw?.tier2bKubo === true,
    gatewayHost: host,
    gatewayPort: port,
  };
}

export function isDefaultGatewayHost(host: string): boolean {
  return host.toLowerCase() === DEFAULT_GATEWAY_HOST;
}

export async function getEnsBrowsingSettings(): Promise<EnsBrowsingSettings> {
  const raw = await chrome.storage.local.get(KEY);
  return normalize(raw[KEY] as StoredShape | undefined);
}

export async function setEnsBrowsingSetting<K extends keyof EnsBrowsingSettings>(
  key: K,
  value: EnsBrowsingSettings[K],
): Promise<EnsBrowsingSettings> {
  const current = await getEnsBrowsingSettings();
  const next: EnsBrowsingSettings = { ...current, [key]: value };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function onEnsBrowsingSettingsChanged(
  cb: (next: EnsBrowsingSettings) => void,
): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[KEY]) return;
    cb(normalize(changes[KEY].newValue as StoredShape | undefined));
  });
}
