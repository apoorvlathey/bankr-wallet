import { Badge } from "@chakra-ui/react";
import type { SafeCapability } from "@/chrome/safe/types";

const LABELS: Record<SafeCapability, string> = {
  observe: "Observe only",
  approve: "Can approve",
  quorumAvailable: "Ready to use",
  readyToExecute: "Ready to execute",
  blocked: "Observe only",
};

export function SafeCapabilityBadge({ capability }: { capability: SafeCapability }) {
  return (
    <Badge
      colorScheme={
        capability === "blocked"
          ? "red"
          : capability === "observe"
            ? "gray"
            : capability === "readyToExecute"
              ? "green"
              : "yellow"
      }
    >
      {LABELS[capability]}
    </Badge>
  );
}
