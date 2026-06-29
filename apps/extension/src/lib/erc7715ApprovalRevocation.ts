export const ERC7715_APPROVAL_REVOCATION_METHODS = [
  {
    field: "erc20Approve",
    bit: 0x01,
    label: "ERC-20 approvals",
    description: "Revoke ERC-20 approve(spender, 0) allowances.",
    permit2: false,
  },
  {
    field: "erc721Approve",
    bit: 0x02,
    label: "Single NFT approvals",
    description: "Clear ERC-721 per-token approvals.",
    permit2: false,
  },
  {
    field: "erc721SetApprovalForAll",
    bit: 0x04,
    label: "Collection operator approvals",
    description: "Revoke ERC-721 and ERC-1155 setApprovalForAll access.",
    permit2: false,
  },
  {
    field: "permit2Approve",
    bit: 0x08,
    label: "Permit2 approvals",
    description: "Zero Permit2 token allowances for any token/spender pair.",
    permit2: true,
  },
  {
    field: "permit2Lockdown",
    bit: 0x10,
    label: "Permit2 lockdown",
    description: "Batch zero Permit2 allowances for any token/spender pair.",
    permit2: true,
  },
  {
    field: "permit2InvalidateNonces",
    bit: 0x20,
    label: "Permit2 nonce invalidation",
    description: "Invalidate pending Permit2 signatures for any token/spender pair.",
    permit2: true,
  },
] as const;

export type Erc7715ApprovalRevocationField =
  (typeof ERC7715_APPROVAL_REVOCATION_METHODS)[number]["field"];

export function isErc7715TokenApprovalRevocationPermissionType(
  type: string,
): boolean {
  return type === "token-approval-revocation";
}

export function approvalRevocationFieldNames(): Erc7715ApprovalRevocationField[] {
  return ERC7715_APPROVAL_REVOCATION_METHODS.map((method) => method.field);
}

export function enabledApprovalRevocationMethods(
  data: Record<string, unknown>,
) {
  return ERC7715_APPROVAL_REVOCATION_METHODS.filter(
    (method) => data[method.field] === true,
  );
}

export function approvalRevocationMethodLabelsFromFields(
  fields: readonly string[],
): string[] {
  const enabled = new Set(fields);
  return ERC7715_APPROVAL_REVOCATION_METHODS.filter((method) =>
    enabled.has(method.field),
  ).map((method) => method.label);
}

export function approvalRevocationMask(data: Record<string, unknown>): number {
  let mask = 0;
  for (const method of ERC7715_APPROVAL_REVOCATION_METHODS) {
    if (data[method.field] === true) {
      mask |= method.bit;
    }
  }
  return mask;
}

export function approvalRevocationMethodsMatch(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  return ERC7715_APPROVAL_REVOCATION_METHODS.every(
    (method) => a[method.field] === b[method.field],
  );
}

export function hasPermit2ApprovalRevocationMethod(
  data: Record<string, unknown>,
): boolean {
  return ERC7715_APPROVAL_REVOCATION_METHODS.some(
    (method) => method.permit2 && data[method.field] === true,
  );
}
