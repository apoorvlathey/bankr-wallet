export type TrustedUiPortProtocolDependencies = {
  isValidSurfaceId: (surfaceId: unknown) => surfaceId is string;
  registerUiSurface: (surfaceId: string) => Promise<boolean>;
  heartbeatUiSurface: (surfaceId: string) => Promise<boolean>;
  disconnectUiSurface: (surfaceId: string) => Promise<void>;
};

export function exactPortMessage(
  value: unknown,
  type: string,
  keys: readonly string[],
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null &&
    (value as { type?: unknown }).type === type &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(value, key));
}

export function bindTrustedUiKeepalivePort(
  port: any,
  dependencies: TrustedUiPortProtocolDependencies,
): void {
  let registeredSurfaceId: string | null = null;
  let disconnected = false;
  let messageTail: Promise<void> = Promise.resolve();
  const disconnectInvalidPort = (): void => {
    try { port.disconnect(); } catch { /* Already disconnected. */ }
  };

  port.onMessage.addListener((message: unknown) => {
    messageTail = messageTail.then(async () => {
      if (disconnected) return;
      if (exactPortMessage(message, "wallet-ui-register", ["type", "surfaceId"])) {
        const surfaceId = message.surfaceId;
        if (
          registeredSurfaceId !== null ||
          !dependencies.isValidSurfaceId(surfaceId) ||
          !(await dependencies.registerUiSurface(surfaceId))
        ) {
          disconnectInvalidPort();
          return;
        }
        registeredSurfaceId = surfaceId;
        if (disconnected) {
          await dependencies.disconnectUiSurface(surfaceId);
          return;
        }
        port.postMessage({ type: "wallet-ui-registered", surfaceId });
        return;
      }
      if (exactPortMessage(message, "wallet-ui-keepalive", ["type", "surfaceId"])) {
        if (
          !registeredSurfaceId ||
          message.surfaceId !== registeredSurfaceId ||
          !(await dependencies.heartbeatUiSurface(registeredSurfaceId))
        ) disconnectInvalidPort();
        return;
      }
      disconnectInvalidPort();
    }).catch(() => disconnectInvalidPort());
  });
  port.onDisconnect.addListener(() => {
    disconnected = true;
    const surfaceId = registeredSurfaceId;
    if (surfaceId) void dependencies.disconnectUiSurface(surfaceId);
  });
}
