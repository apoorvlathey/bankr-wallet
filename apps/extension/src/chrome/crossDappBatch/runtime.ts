let processing = false;

export function beginCrossDappBatchProcessing(): boolean {
  if (processing) return false;
  processing = true;
  return true;
}

export function finishCrossDappBatchProcessing(): void {
  processing = false;
}
