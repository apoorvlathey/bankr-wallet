import { useEffect, useState } from "react";
import type { Account, SeedGroup } from "@/chrome/types";

export function useSeedGroupMap(accounts: Account[]): Map<string, string> {
  const [seedGroupMap, setSeedGroupMap] = useState<Map<string, string>>(
    new Map(),
  );

  useEffect(() => {
    if (!accounts.some((account) => account.type === "seedPhrase")) return;

    chrome.runtime.sendMessage(
      { type: "getSeedGroups" },
      (groups: SeedGroup[] | null) => {
        if (groups) {
          setSeedGroupMap(new Map(groups.map((group) => [group.id, group.name])));
        }
      },
    );
  }, [accounts]);

  return seedGroupMap;
}
