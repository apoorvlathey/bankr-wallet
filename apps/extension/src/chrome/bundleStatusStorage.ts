/** Stable compatibility facade for ERC-5792 bundle-status persistence. */

export {
  cleanupOldBundleStatuses,
  getBundleStatus,
  getBundleStatuses,
  removeBundleStatus,
  saveBundleStatus,
  updateBundleStatus,
} from "./batch/bundleStatusStorage";
