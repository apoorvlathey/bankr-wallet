import type { GasOverrides } from "../transactions/localExecution";

const MAX_UINT256 = (1n << 256n) - 1n;

function parseGasQuantity(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(value)) {
    throw new Error(`Invalid Safe execution ${label}`);
  }
  const parsed = BigInt(value);
  if (parsed > MAX_UINT256) {
    throw new Error(`Safe execution ${label} exceeds uint256`);
  }
  return parsed;
}

export function validateSafeGasOverrides(overrides: GasOverrides | undefined) {
  if (!overrides) return undefined;
  const gas = parseGasQuantity(overrides.gasLimit, "gas limit");
  const maxFeePerGas = parseGasQuantity(overrides.maxFeePerGas, "max fee");
  const maxPriorityFeePerGas = parseGasQuantity(
    overrides.maxPriorityFeePerGas,
    "priority fee",
  );
  if (gas <= 0n || maxFeePerGas <= 0n || maxPriorityFeePerGas < 0n) {
    throw new Error("Invalid Safe execution gas settings");
  }
  if (maxFeePerGas < maxPriorityFeePerGas) {
    throw new Error("Safe execution max fee cannot be below its priority fee");
  }
  return {
    gas: gas.toString() as `${bigint}`,
    maxFeePerGas: maxFeePerGas.toString() as `${bigint}`,
    maxPriorityFeePerGas: maxPriorityFeePerGas.toString() as `${bigint}`,
  };
}
