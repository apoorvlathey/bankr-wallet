const PREFIX = "WalletChan - ";

export function prefixWalletError(message: string | undefined | null): string {
  if (!message) return `${PREFIX}Unknown error`;
  return message.startsWith(PREFIX) ? message : `${PREFIX}${message}`;
}

/** Construct the EIP-1193 error shape surfaced by the injected provider. */
export function makeProviderError(
  message: string | undefined | null,
  code?: number,
): Error & { code?: number } {
  const error = new Error(prefixWalletError(message)) as Error & { code?: number };
  if (code !== undefined) error.code = code;
  return error;
}
