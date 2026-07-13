/** Stable clear-signing descriptor/settings compatibility facade. */

export type {
  GetDescriptorMessage,
  GetDescriptorResponse,
} from "./clearSigning/types";
export { handleGetClearSigningDescriptor } from "./clearSigning/handlers";
export { handleInvalidateClearSigningCache } from "./clearSigning/descriptorCache";
export {
  getClearSigningEnabled,
  setClearSigningEnabled,
} from "./clearSigning/settings";
