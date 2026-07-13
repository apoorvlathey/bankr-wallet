/** Stable avatar-image cache compatibility facade. */

export { readAvatarBlobBounded } from "./avatar/bodyReader";
export {
  fetchAndCacheAvatarImage,
  getCachedAvatarImage,
} from "./avatar/coordinator";
export { isAllowedAvatarUrl } from "./avatar/policy";
export { invalidateAvatarImageCacheForWalletReset } from "./avatar/scheduler";
export type { AvatarCacheEntry } from "./avatar/types";
