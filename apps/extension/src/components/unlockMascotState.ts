export type UnlockMascotState =
  | "sleeping"
  | "attentive"
  | "invalid"
  | "success";

interface UnlockMascotStateInput {
  password: string;
  error: string;
  isUnlocking: boolean;
  isPasskeyUnlocking: boolean;
  showSuccess: boolean;
}

export function getUnlockMascotState({
  password,
  error,
  isUnlocking,
  isPasskeyUnlocking,
  showSuccess,
}: UnlockMascotStateInput): UnlockMascotState {
  if (showSuccess) return "success";

  const normalizedError = error.trim().toLowerCase();
  const isBiometricCancellation =
    normalizedError.includes("biometric") &&
    (normalizedError.includes("cancelled") || normalizedError.includes("canceled"));

  if (error && !isBiometricCancellation) {
    return "invalid";
  }

  if (isPasskeyUnlocking || isUnlocking || password.length > 0) {
    return "attentive";
  }

  return "sleeping";
}
