import NumberFlow, { NumberFlowGroup } from "@number-flow/react";
import { Text } from "@chakra-ui/react";

const QUOTE_EXPIRY_TIMING = {
  duration: 220,
  easing: "cubic-bezier(0.23, 1, 0.32, 1)",
};

function formatExpiry(milliseconds: number): string {
  if (milliseconds <= 0) return "Expired";
  const seconds = Math.ceil(milliseconds / 1_000);
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Restrained m:ss countdown shared with the Shield compliance motion language. */
export default function AnimatedQuoteExpiry({
  milliseconds,
}: {
  milliseconds: number;
}) {
  const label = formatExpiry(milliseconds);
  if (milliseconds <= 0) return <>{label}</>;

  const totalSeconds = Math.ceil(milliseconds / 1_000);
  const flowProps = {
    locales: "en-US",
    transformTiming: QUOTE_EXPIRY_TIMING,
    spinTiming: QUOTE_EXPIRY_TIMING,
    opacityTiming: { duration: 120, easing: "ease-out" },
    trend: -1 as const,
    willChange: true,
  };

  return (
    <Text as="span" role="timer" aria-label={label} aria-live="off">
      <NumberFlowGroup>
        <NumberFlow {...flowProps} value={Math.floor(totalSeconds / 60)} />
        :
        <NumberFlow
          {...flowProps}
          value={totalSeconds % 60}
          format={{ minimumIntegerDigits: 2, useGrouping: false }}
        />
      </NumberFlowGroup>
    </Text>
  );
}
