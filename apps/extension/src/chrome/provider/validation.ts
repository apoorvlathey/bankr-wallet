export interface ProviderValidationResult {
  valid: boolean;
  error?: string;
}

export function failProviderValidation(
  error: string,
): ProviderValidationResult {
  return { valid: false, error };
}
