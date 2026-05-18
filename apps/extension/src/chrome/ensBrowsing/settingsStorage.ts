// Typed wrapper around the single `ensBrowsing` chrome.storage.local key.
//
// Schema:
//   { tier1?: boolean; tier2aLocalIpfs?: boolean; tier2bKubo?: boolean }
//
// Absence of the key OR absence of `tier1` is interpreted as Tier 1 ON, so
// existing users get the feature enabled on update without a migration. The
// Tier 2 sub-toggles default OFF.

const KEY = "ensBrowsing";

export type EnsBrowsingSettings = {
  tier1: boolean;
  tier2aLocalIpfs: boolean;
  tier2bKubo: boolean;
};

type StoredShape = Partial<EnsBrowsingSettings>;

export const DEFAULT_ENS_BROWSING_SETTINGS: EnsBrowsingSettings = {
  tier1: true,
  tier2aLocalIpfs: false,
  tier2bKubo: false,
};

function normalize(raw: StoredShape | undefined): EnsBrowsingSettings {
  return {
    tier1: raw?.tier1 !== false,
    tier2aLocalIpfs: raw?.tier2aLocalIpfs === true,
    tier2bKubo: raw?.tier2bKubo === true,
  };
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
