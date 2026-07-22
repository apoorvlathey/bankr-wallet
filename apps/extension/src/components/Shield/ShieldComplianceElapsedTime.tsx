import { HStack, Text } from "@chakra-ui/react";
import NumberFlow, { NumberFlowGroup } from "@number-flow/react";
import { useEffect, useState } from "react";

import {
  formatShieldComplianceElapsedTime,
  getShieldComplianceElapsedSeconds,
} from "@/lib/privacyShieldLifecycle";

interface ShieldComplianceElapsedTimeProps {
  confirmedAt?: number;
}

const ELAPSED_TIME_TIMING = {
  duration: 220,
  easing: "cubic-bezier(0.23, 1, 0.32, 1)",
};

function AnimatedElapsedTime({ elapsedSeconds }: { elapsedSeconds: number }) {
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const flowProps = {
    locales: "en-US",
    transformTiming: ELAPSED_TIME_TIMING,
    spinTiming: ELAPSED_TIME_TIMING,
    opacityTiming: { duration: 120, easing: "ease-out" },
    trend: 1 as const,
    willChange: true,
  };

  if (elapsedSeconds < 60) {
    return <NumberFlow {...flowProps} value={elapsedSeconds} suffix="sec" />;
  }

  if (elapsedMinutes < 60) {
    return (
      <NumberFlowGroup>
        <NumberFlow {...flowProps} value={elapsedMinutes} suffix="m" />{" "}
        <NumberFlow {...flowProps} value={elapsedSeconds % 60} suffix="s" />
      </NumberFlowGroup>
    );
  }

  return (
    <NumberFlowGroup>
      <NumberFlow
        {...flowProps}
        value={Math.floor(elapsedMinutes / 60)}
        suffix="hr"
      />{" "}
      <NumberFlow {...flowProps} value={elapsedMinutes % 60} suffix="min" />
    </NumberFlowGroup>
  );
}

/** Receipt-timed elapsed value for the expanded compliance detail card. */
export default function ShieldComplianceElapsedTime({
  confirmedAt,
}: ShieldComplianceElapsedTimeProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    const interval = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, [confirmedAt]);

  const elapsed = formatShieldComplianceElapsedTime(confirmedAt, now);
  const elapsedSeconds = getShieldComplianceElapsedSeconds(confirmedAt, now);

  return (
    <HStack
      mt={3}
      pt={3}
      borderTopWidth="1px"
      borderTopColor="border.subtle"
      justify="space-between"
      spacing={3}
    >
      <Text color="fg.secondary" fontSize="xs" fontWeight="500">
        Elapsed Time
      </Text>
      <Text
        color="fg.primary"
        fontSize="xs"
        fontWeight="600"
        sx={{ fontVariantNumeric: "tabular-nums" }}
        aria-label={elapsed ?? "Elapsed time unavailable"}
      >
        {elapsedSeconds === null ? (
          "—"
        ) : (
          <AnimatedElapsedTime elapsedSeconds={elapsedSeconds} />
        )}
      </Text>
    </HStack>
  );
}
