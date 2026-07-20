const MAX_INDEX = 0x7fffffff;
const PATH_RE = /^m(?:\/(?:0|[1-9]\d*)'?)+$/;

export function isValidBip32Path(path: string): boolean {
  if (!PATH_RE.test(path)) return false;
  return path.slice(2).split("/").every((part) => {
    const value = Number(part.replace("'", ""));
    return Number.isSafeInteger(value) && value >= 0 && value <= MAX_INDEX;
  });
}

export function resolveTemplate(template: string, index: number): string {
  if (!Number.isSafeInteger(index) || index < 0 || index > MAX_INDEX) {
    throw new Error("Ledger derivation index is out of range.");
  }
  const resolved = template.replace(/\{index\}/g, String(index));
  if (!isValidBip32Path(resolved)) throw new Error("Invalid Ledger derivation path.");
  return resolved;
}

export function withoutMasterPrefix(path: string): string {
  if (!isValidBip32Path(path)) throw new Error("Invalid Ledger derivation path.");
  return path.slice(2);
}
