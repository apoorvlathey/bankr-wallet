import { WarningTwoIcon } from "@chakra-ui/icons";
import { Box, Checkbox, HStack, Text, VStack } from "@chakra-ui/react";

import { ScreenSection } from "@/components/ui";

interface Props {
  backupConfirmed: boolean;
  lossConfirmed: boolean;
  onBackupConfirmed: (checked: boolean) => void;
  onLossConfirmed: (checked: boolean) => void;
}

export function RecoveryReplacementConfirm(props: Props) {
  return (
    <VStack spacing={5} align="stretch">
      <ScreenSection
        title="Replace current Shield phrase?"
        description="Restoring another phrase removes the current Shield identity from this WalletChan installation."
      >
        <VStack spacing={4} align="stretch">
          <Box
            p={3}
            bg="status.error.bg"
            border="1px solid"
            borderColor="status.error.border"
            borderRadius="md"
          >
            <HStack align="start" spacing={2}>
              <WarningTwoIcon mt={0.5} color="status.error.fg" />
              <Text color="status.error.fg" fontSize="sm" fontWeight="600">
                Without the current phrase, funds belonging to that Shield identity may be permanently unrecoverable.
              </Text>
            </HStack>
          </Box>

          <Checkbox
            variant="commitment"
            isChecked={props.backupConfirmed}
            onChange={(event) => props.onBackupConfirmed(event.target.checked)}
          >
            <Text fontSize="sm" color="fg.primary">
              I saved the current Shield phrase in the correct order.
            </Text>
          </Checkbox>
          <Checkbox
            variant="commitment"
            isChecked={props.lossConfirmed}
            onChange={(event) => props.onLossConfirmed(event.target.checked)}
          >
            <Text fontSize="sm" color="fg.primary">
              I understand replacing it can remove access to its Shield funds.
            </Text>
          </Checkbox>
        </VStack>
      </ScreenSection>
    </VStack>
  );
}
