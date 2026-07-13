export interface EIP712ValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: string;
}
