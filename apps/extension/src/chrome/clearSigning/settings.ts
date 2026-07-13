import {
  CLEAR_SIGNING_ENABLED_KEY,
  handleInvalidateClearSigningCache,
} from "./descriptorCache";

export async function getClearSigningEnabled(): Promise<boolean> {
  const result = await chrome.storage.local.get([CLEAR_SIGNING_ENABLED_KEY]);
  return result[CLEAR_SIGNING_ENABLED_KEY] !== false;
}

export async function setClearSigningEnabled(value: boolean): Promise<void> {
  await chrome.storage.local.set({ [CLEAR_SIGNING_ENABLED_KEY]: !!value });
  if (!value) await handleInvalidateClearSigningCache();
}
