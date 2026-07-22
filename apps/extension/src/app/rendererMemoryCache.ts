const rendererMemoryCache = new Map<string, unknown>();

export function readRendererMemoryCache<T>(key: string): T | null {
  return (rendererMemoryCache.get(key) as T | undefined) ?? null;
}

export function writeRendererMemoryCache<T>(key: string, value: T): void {
  rendererMemoryCache.set(key, value);
}

export function clearRendererMemoryCache(): void {
  rendererMemoryCache.clear();
}
