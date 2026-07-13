/** All-or-nothing in-memory and persisted authentication teardown. */

import * as memoryCache from "./inMemoryCache";
import { clearPersistedSessionStorage } from "./persistence";

export async function clearSessionStorage(): Promise<void> {
  memoryCache.setCurrentSessionId(null);
  await clearPersistedSessionStorage();
}

export async function clearAllAuthState(): Promise<void> {
  memoryCache.clearInMemoryAuthCache();
  await clearSessionStorage();
}
