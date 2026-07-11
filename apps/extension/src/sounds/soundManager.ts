import { play, setEnabled as setCuelumeEnabled, type SoundName } from "cuelume";
import {
  playCustomChartValueSound,
  playCustomSliderValueSound,
  playCustomTokenHoverSound,
} from "@/sounds/customValueSound";

export const SOUNDS_ENABLED_STORAGE_KEY = "soundsEnabled";
export const DEFAULT_SOUNDS_ENABLED = true;

type SoundDefinition = {
  player: () => void;
  cooldownMs?: number;
  finePointerOnly?: boolean;
};

const cuelume = (recipe: SoundName) => () => play(recipe);

/** Product-level cues keep Cuelume recipes and restraint rules centralized. */
const SOUND_DEFINITIONS = {
  unlockSuccess: { player: cuelume("sparkle") },
  transactionConfirm: { player: cuelume("sparkle"), cooldownMs: 250 },
  dappConnectionConfirm: { player: cuelume("sparkle"), cooldownMs: 250 },
  requestReceived: { player: cuelume("chime"), cooldownMs: 500 },
  actionSheetTransition: { player: cuelume("bloom") },
  chartValueChange: { player: playCustomChartValueSound, cooldownMs: 26 },
  sliderValueChange: { player: playCustomSliderValueSound, cooldownMs: 26 },
  sliderSnap: { player: cuelume("release"), cooldownMs: 60 },
  portfolioTokenHover: {
    player: playCustomTokenHoverSound,
    cooldownMs: 140,
    finePointerOnly: true,
  },
  quickActionHover: {
    player: cuelume("press"),
    cooldownMs: 120,
    finePointerOnly: true,
  },
} as const satisfies Record<string, SoundDefinition>;

export type InteractionSound = keyof typeof SOUND_DEFINITIONS;
type PreferenceListener = (enabled: boolean) => void;

let soundsEnabled = DEFAULT_SOUNDS_ENABLED;
let initialization: Promise<boolean> | null = null;
let storageListenerInstalled = false;
const preferenceListeners = new Set<PreferenceListener>();
const lastPlayedAt = new Map<InteractionSound, number>();

function hasFineHoverPointer(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function applyPreference(enabled: boolean) {
  if (soundsEnabled === enabled) return;
  soundsEnabled = enabled;
  setCuelumeEnabled(enabled);
  preferenceListeners.forEach((listener) => listener(enabled));
}

function installStorageListener() {
  if (
    storageListenerInstalled ||
    typeof chrome === "undefined" ||
    !chrome.storage?.onChanged
  ) {
    return;
  }

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const change = changes[SOUNDS_ENABLED_STORAGE_KEY];
    if (!change) return;
    applyPreference(change.newValue !== false);
  });
  storageListenerInstalled = true;
}

export function initializeSoundManager(): Promise<boolean> {
  if (initialization) return initialization;

  installStorageListener();
  initialization = new Promise((resolve) => {
    if (typeof chrome === "undefined" || !chrome.storage?.local) {
      setCuelumeEnabled(DEFAULT_SOUNDS_ENABLED);
      resolve(DEFAULT_SOUNDS_ENABLED);
      return;
    }

    chrome.storage.local.get(SOUNDS_ENABLED_STORAGE_KEY, (result) => {
      const enabled = result?.[SOUNDS_ENABLED_STORAGE_KEY] !== false;
      applyPreference(enabled);
      // applyPreference intentionally skips equal values, so initialize the
      // audio engine explicitly when the stored/default value is true.
      setCuelumeEnabled(enabled);
      resolve(enabled);
    });
  });

  return initialization;
}

export async function playInteractionSound(cue: InteractionSound): Promise<void> {
  await initializeSoundManager();
  if (!soundsEnabled) return;

  const definition: SoundDefinition = SOUND_DEFINITIONS[cue];
  if (definition.finePointerOnly && !hasFineHoverPointer()) return;

  const now = performance.now();
  const lastPlayed = lastPlayedAt.get(cue) ?? Number.NEGATIVE_INFINITY;
  if (definition.cooldownMs && now - lastPlayed < definition.cooldownMs) return;

  lastPlayedAt.set(cue, now);
  try {
    definition.player();
  } catch {
    // Audio is progressive enhancement and must never interrupt wallet flows.
  }
}

export async function saveSoundsEnabled(enabled: boolean): Promise<void> {
  await initializeSoundManager();
  applyPreference(enabled);

  if (typeof chrome === "undefined" || !chrome.storage?.local) return;
  await chrome.storage.local.set({ [SOUNDS_ENABLED_STORAGE_KEY]: enabled });
}

export function subscribeToSoundsEnabled(listener: PreferenceListener): () => void {
  preferenceListeners.add(listener);
  return () => preferenceListeners.delete(listener);
}
