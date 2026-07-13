export const ERC7715_SUPPORTED_RULE_TYPES = ["expiry"] as const;

export const ERC7715_SUPPORTED_PERMISSION_TYPES = [
  "erc20-token-allowance",
  "erc20-token-periodic",
  "erc20-token-stream",
  "native-token-allowance",
  "native-token-periodic",
  "native-token-stream",
  "token-approval-revocation",
] as const;

export type Erc7715SupportedPermissionType =
  (typeof ERC7715_SUPPORTED_PERMISSION_TYPES)[number];

const SUPPORTED_PERMISSION_TYPES_SET = new Set<string>(
  ERC7715_SUPPORTED_PERMISSION_TYPES,
);

export function isErc7715SupportedPermissionType(
  permissionType: unknown,
): permissionType is Erc7715SupportedPermissionType {
  return (
    typeof permissionType === "string" &&
    SUPPORTED_PERMISSION_TYPES_SET.has(permissionType)
  );
}
