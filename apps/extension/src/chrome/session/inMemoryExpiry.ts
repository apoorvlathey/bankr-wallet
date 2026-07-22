let authSessionHardExpiresAt: number | null = null;
let activeUIConnections = 0;

export function isCacheEntryValid(
  timestamp: number,
  timeout: number,
): boolean {
  if (activeUIConnections > 0) return timestamp > 0;
  return (
    (authSessionHardExpiresAt === null || Date.now() < authSessionHardExpiresAt) &&
    (timeout === 0 || (timestamp > 0 && Date.now() - timestamp < timeout))
  );
}

export function clearAuthSessionHardExpiry(): void {
  authSessionHardExpiresAt = null;
}

export function setAuthSessionHardExpiry(expiresAt: number | null): void {
  authSessionHardExpiresAt = expiresAt;
}

export function incrementUIConnections(): void {
  activeUIConnections++;
}

export function decrementUiConnectionLease(): boolean {
  activeUIConnections--;
  if (activeUIConnections > 0) return false;
  activeUIConnections = 0;
  return true;
}

export function hasActiveUIConnections(): boolean {
  return activeUIConnections > 0;
}
