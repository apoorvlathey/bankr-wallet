import { HStack, Text } from "@chakra-ui/react";
import { WarningIcon } from "@chakra-ui/icons";
import {
  SimulationRevertedBanner,
  SimulationUnavailableBanner,
} from "@/components/AssetChangesDisplay";
import { MalformedCalldataBanner } from "@/components/MalformedCalldataBanner";
import type { ThemeTokens } from "@/theme";

interface MalformedInfo {
  index: number;
  reason?: string;
  functionName?: string;
}

interface RequestWarningsProps {
  borders: ThemeTokens["borders"];
  simulationReverted: boolean;
  simulationUnavailable: boolean;
  anyTxMayRevert: boolean;
  malformedCallInfo: MalformedInfo | null;
  malformedValueInfo: { index: number; reason: string } | null;
  encodingError: string | null;
}

export function RequestWarnings({
  borders,
  simulationReverted,
  simulationUnavailable,
  anyTxMayRevert,
  malformedCallInfo,
  malformedValueInfo,
  encodingError,
}: RequestWarningsProps) {
  return (
    <>
      {simulationReverted && <SimulationRevertedBanner borders={borders} />}
      {simulationUnavailable && !simulationReverted && (
        <SimulationUnavailableBanner borders={borders} />
      )}
      {anyTxMayRevert && !simulationReverted && (
        <HStack
          bg="status.error.bg"
          border={borders.medium}
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="card"
          px={3}
          py={2}
          spacing={2}
        >
          <WarningIcon color="status.error.fg" boxSize={3.5} flexShrink={0} />
          <Text
            fontSize="xs"
            color="status.error.fg"
            fontWeight="700"
            textTransform="uppercase"
          >
            One or more transactions may revert
          </Text>
        </HStack>
      )}
      {malformedCallInfo && (
        <MalformedCalldataBanner
          borders={borders}
          reason={`Call #${malformedCallInfo.index + 1}: ${malformedCallInfo.reason}`}
          functionName={malformedCallInfo.functionName}
        />
      )}
      {malformedValueInfo && (
        <MalformedCalldataBanner
          borders={borders}
          title="Malformed value — signing blocked"
          reason={`Call #${malformedValueInfo.index + 1}: ${malformedValueInfo.reason}`}
        />
      )}
      {encodingError && (
        <MalformedCalldataBanner
          borders={borders}
          title="Unsafe batch — signing blocked"
          reason={encodingError}
        />
      )}
    </>
  );
}
