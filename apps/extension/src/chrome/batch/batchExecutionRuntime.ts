/** Shared in-worker exclusion and expiry policy for every batch signer path. */
export const processingBundleIds = new Set<string>();
export const BATCH_TX_EXPIRY_MS = 30 * 60 * 1000;
