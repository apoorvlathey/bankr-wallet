const MAX_UINT256 = (1n << 256n) - 1n;
const TIMESTAMP_UPPER_BOUND_SECONDS = 253402300799;
const MAX_PERIOD_DURATION_SECONDS = 10 * 365 * 24 * 60 * 60;

export function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function assertOnlyKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string,
) {
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw new Error(`${label} contains unsupported field '${key}'`);
    }
  }
}

export function assertPositiveBoundedHexAmount(
  value: unknown,
  label: string,
): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/iu.test(value)) {
    throw new Error(`${label} must be a hex quantity`);
  }

  const parsed = BigInt(value);
  if (parsed <= 0n) {
    throw new Error(`${label} must be greater than zero`);
  }
  if (parsed >= MAX_UINT256) {
    throw new Error(`${label} must be finite and bounded`);
  }
  return parsed;
}

export function assertNonNegativeBoundedHexAmount(
  value: unknown,
  label: string,
): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/iu.test(value)) {
    throw new Error(`${label} must be a hex quantity`);
  }

  const parsed = BigInt(value);
  if (parsed >= MAX_UINT256) {
    throw new Error(`${label} must be finite and bounded`);
  }
  return parsed;
}

export function assertPositiveStreamCap(
  value: unknown,
  label: string,
): bigint {
  if (typeof value !== "string" || !/^0x[0-9a-f]+$/iu.test(value)) {
    throw new Error(`${label} must be a hex quantity`);
  }

  const parsed = BigInt(value);
  if (parsed <= 0n) {
    throw new Error(`${label} must be greater than zero`);
  }
  if (parsed > MAX_UINT256) {
    throw new Error(`${label} is too large`);
  }
  return parsed;
}

export function assertSafeTimestamp(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a Unix timestamp`);
  }
  if (value > TIMESTAMP_UPPER_BOUND_SECONDS) {
    throw new Error(`${label} is too far in the future`);
  }
  return value;
}

export function assertPositiveDuration(value: unknown, label: string) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value <= 0
  ) {
    throw new Error(`${label} must be a positive duration in seconds`);
  }
  if (value > MAX_PERIOD_DURATION_SECONDS) {
    throw new Error(`${label} must be 10 years or less`);
  }
}

export function optionalInitialAmount(
  data: Record<string, unknown>,
  permissionType: string,
): bigint {
  if (data.initialAmount === undefined || data.initialAmount === null) return 0n;
  return assertNonNegativeBoundedHexAmount(
    data.initialAmount,
    `${permissionType}.data.initialAmount`,
  );
}

export function optionalMaxAmount(
  data: Record<string, unknown>,
  permissionType: string,
): bigint {
  if (data.maxAmount === undefined || data.maxAmount === null) {
    return MAX_UINT256;
  }
  return assertPositiveStreamCap(
    data.maxAmount,
    `${permissionType}.data.maxAmount`,
  );
}

export { MAX_UINT256 };
