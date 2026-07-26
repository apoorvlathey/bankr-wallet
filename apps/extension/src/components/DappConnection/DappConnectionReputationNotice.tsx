import {
  Alert,
  AlertDescription,
  AlertIcon,
  AlertTitle,
  Checkbox,
  HStack,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { DappConnectionReputationState } from "./useDappConnectionReputation";
import { buildDappReputationPresentation } from "./reputationPresentation";

export function DappConnectionReputationNotice({
  state,
  acknowledged,
  onAcknowledgedChange,
}: {
  state: DappConnectionReputationState;
  acknowledged: boolean;
  onAcknowledgedChange: (acknowledged: boolean) => void;
}) {
  if (state.status === "loading") {
    return (
      <HStack
        role="status"
        spacing={2.5}
        px={3}
        py={2.5}
        bg="surface.raisedHover"
        borderWidth="1px"
        borderColor="border.subtle"
        borderRadius="md"
      >
        <Spinner size="sm" color="accent.secondary" />
        <Text color="fg.secondary" fontSize="sm" fontWeight="600">
          Checking site reputation…
        </Text>
      </HStack>
    );
  }

  const presentation = buildDappReputationPresentation(state.reputation);
  return (
    <VStack align="stretch" spacing={2.5}>
      <Alert status={presentation.tone} alignItems="start" borderRadius="md">
        <AlertIcon mt={0.5} />
        <VStack align="start" spacing={0.5}>
          <AlertTitle fontSize="sm">{presentation.title}</AlertTitle>
          {presentation.description && (
            <AlertDescription fontSize="xs" lineHeight="1.45">
              {presentation.description}
            </AlertDescription>
          )}
        </VStack>
      </Alert>
      {presentation.requiresAcknowledgement && (
        <Checkbox
          isChecked={acknowledged}
          onChange={(event) => onAcknowledgedChange(event.target.checked)}
          alignItems="start"
        >
          <Text color="fg.primary" fontSize="xs" lineHeight="1.45">
            I understand this site may be malicious and want to continue.
          </Text>
        </Checkbox>
      )}
    </VStack>
  );
}
