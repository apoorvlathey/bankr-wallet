import { Box } from "@chakra-ui/react";
import { useEffect, useState } from "react";

import type { PrivacyShieldLifecycleState } from "@/lib/privacyShieldLifecycle";
import {
  getShieldComplianceProgressPercent,
  isPrivacyShieldCompliancePending,
} from "@/lib/privacyShieldLifecycle";

interface ShieldComplianceProgressProps {
  state: PrivacyShieldLifecycleState;
  confirmedAt?: number;
  compact?: boolean;
}

function elapsedDescription(confirmedAt: number | undefined, now: number): string {
  if (!Number.isFinite(confirmedAt)) return "Starting after onchain confirmation";
  const elapsedMinutes = Math.max(
    0,
    Math.floor((now - (confirmedAt as number)) / 60_000),
  );
  if (elapsedMinutes < 1) return "Less than one minute since onchain confirmation";
  if (elapsedMinutes === 1) return "One minute since onchain confirmation";
  return `${elapsedMinutes} minutes since onchain confirmation`;
}

/** One-hour elapsed-time indicator that remains honest when review takes longer. */
export default function ShieldComplianceProgress({
  state,
  confirmedAt,
  compact = false,
}: ShieldComplianceProgressProps) {
  const pending = isPrivacyShieldCompliancePending(state);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!pending) return;
    const interval = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(interval);
  }, [pending, confirmedAt]);

  const percent = getShieldComplianceProgressPercent(state, confirmedAt, now);
  if (!pending || percent === null) return null;

  return (
    <Box
      role="progressbar"
      aria-label="Compliance check progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      aria-valuetext={`${elapsedDescription(confirmedAt, now)}. The one-hour estimate is capped at 90 percent until confirmed.`}
      h={compact ? "3px" : "5px"}
      w="full"
      overflow="hidden"
      bg="surface.raisedHover"
      borderRadius="full"
    >
      <Box
        h="full"
        w={`${percent}%`}
        minW={percent > 0 ? "3px" : 0}
        bg="accent.highlight"
        borderRadius="full"
        transitionProperty="width"
        transitionDuration="normal"
        transitionTimingFunction="ease-out"
      />
    </Box>
  );
}
