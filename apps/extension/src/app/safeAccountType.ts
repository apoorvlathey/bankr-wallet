import type { Account } from "@/chrome/types";

type LegacyAccountType = Exclude<Account["type"], "safe">;

export function toLegacyAccountType(type: Account["type"] | undefined): LegacyAccountType | undefined {
  return type === "safe" ? undefined : type;
}
