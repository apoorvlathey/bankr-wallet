export const AVATAR_CACHE_STORAGE_KEY = "ensAvatarImageCache";
export const AVATAR_CACHE_DURATION_MS = 14 * 24 * 60 * 60 * 1000;
export const AVATAR_CACHE_MAX_ENTRIES = 200;
export const AVATAR_CACHE_MAX_TOTAL_BYTES = 5 * 1024 * 1024;

export const AVATAR_MAX_DOWNLOAD_BYTES = 2 * 1024 * 1024;
export const AVATAR_MAX_ENCODED_BYTES = 512 * 1024;
export const AVATAR_TARGET_DIMENSION = 128;

export const AVATAR_FETCH_TIMEOUT_MS = 10_000;
export const AVATAR_MAX_REDIRECTS = 3;
export const AVATAR_MAX_CONCURRENT_FETCHES = 2;

export const AVATAR_CACHE_LOCK_KEY = "local:ens-avatar-image-cache";
