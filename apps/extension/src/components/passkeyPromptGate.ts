export interface PasskeyPromptGate {
  autoPromptConsumed: boolean;
  promptActive: boolean;
}

export function createPasskeyPromptGate(): PasskeyPromptGate {
  return {
    autoPromptConsumed: false,
    promptActive: false,
  };
}

export function canAutoPromptPasskey(
  gate: PasskeyPromptGate,
  unlockSucceeded = false,
): boolean {
  return !unlockSucceeded && !gate.autoPromptConsumed && !gate.promptActive;
}

/**
 * Starts one WebAuthn ceremony and consumes this screen's automatic prompt.
 * Manual ceremonies consume it too, preventing a trailing auto-prompt while
 * the unlock screen remains mounted for its exit transition.
 */
export function beginPasskeyPrompt(gate: PasskeyPromptGate): boolean {
  if (gate.promptActive) return false;
  gate.promptActive = true;
  gate.autoPromptConsumed = true;
  return true;
}

export function finishPasskeyPrompt(gate: PasskeyPromptGate): void {
  gate.promptActive = false;
}
