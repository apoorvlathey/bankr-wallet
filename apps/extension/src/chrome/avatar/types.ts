export interface AvatarCacheEntry {
  dataUrl: string;
  sizeBytes: number;
  cachedAt: number;
  lastAccessedAt: number;
}

export type AvatarCache = Record<string, AvatarCacheEntry>;
