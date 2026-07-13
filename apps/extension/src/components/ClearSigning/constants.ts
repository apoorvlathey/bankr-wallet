/**
 * Maximum nesting for embedded `calldata` fields. 3 covers realistic patterns
 * (Safe → Multicall → ERC-20) without letting a pathological descriptor recurse
 * indefinitely. Anything deeper falls back to the raw-bytes card.
 */
export const MAX_NESTED_DEPTH = 3;
