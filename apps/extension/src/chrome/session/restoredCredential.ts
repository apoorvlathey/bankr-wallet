import type { PasswordType } from "../types";
import type { RestoredSessionCapabilityCredential } from "./restoredCapabilityCredential";
import type { RestoredPasskeySessionCredential } from "./restoredPasskeyCredential";

export {
  createRestoredSessionCapabilityCredential,
  isRestoredSessionCapabilityCredential,
  type RestoredSessionCapabilityCredential,
} from "./restoredCapabilityCredential";
export {
  createRestoredPasskeySessionCredential,
  isRestoredPasskeySessionCredential,
  type RestoredPasskeySessionCredential,
} from "./restoredPasskeyCredential";

export type UnlockFn = (
  credential:
    | string
    | RestoredPasskeySessionCredential
    | RestoredSessionCapabilityCredential,
) => Promise<{ success: boolean; passwordType?: PasswordType }>;
