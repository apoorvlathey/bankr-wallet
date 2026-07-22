import { Box, HStack, SimpleGrid, Text, Tooltip } from "@chakra-ui/react";

import type { ShieldPendingOperation } from "./model/shieldOperation";
import {
  getShieldOperationProgress,
  SHIELD_PROGRESS_STEPS,
} from "./model/shieldProgress";

interface ShieldOperationProgressProps {
  state: ShieldPendingOperation["state"];
}

export default function ShieldOperationProgress({
  state,
}: ShieldOperationProgressProps) {
  const progress = getShieldOperationProgress(state);
  if (!progress) return null;

  const valueText = progress.complete
    ? "Shield complete"
    : `Step ${progress.step} of ${SHIELD_PROGRESS_STEPS}: ${progress.label}`;

  return (
    <Box mt={3}>
      <HStack justify="space-between" mb={1.5} spacing={3}>
        <Text color="fg.muted" fontSize="xs">
          {progress.label}
        </Text>
        <Text color="fg.secondary" fontSize="xs" fontWeight="600">
          {progress.complete
            ? "Complete"
          : `Step ${progress.step} of ${SHIELD_PROGRESS_STEPS}`}
        </Text>
      </HStack>
      <Tooltip
        label={progress.description}
        fontSize="xs"
        openDelay={150}
        hasArrow
      >
        <Box
          py={1.5}
          my={-1.5}
          cursor="help"
          borderRadius="sm"
          role="progressbar"
          tabIndex={0}
          aria-label="Shield progress"
          aria-valuemin={0}
          aria-valuemax={SHIELD_PROGRESS_STEPS}
          aria-valuenow={progress.step}
          aria-valuetext={`${valueText}. ${progress.description}`}
          _focusVisible={{
            outline: "2px solid",
            outlineColor: "border.focus",
            outlineOffset: "2px",
          }}
        >
          <SimpleGrid columns={SHIELD_PROGRESS_STEPS} spacing={1} aria-hidden="true">
            {Array.from({ length: SHIELD_PROGRESS_STEPS }, (_, index) => {
              const isComplete = index < progress.completedSteps;
              const isCurrent = !progress.complete && index === progress.step - 1;
              return (
                <Box
                  key={index}
                  h="4px"
                  borderRadius="full"
                  bg={
                    isComplete
                      ? "accent.secondary"
                      : isCurrent
                        ? "accent.highlight"
                        : "surface.raisedHover"
                  }
                />
              );
            })}
          </SimpleGrid>
        </Box>
      </Tooltip>
    </Box>
  );
}
