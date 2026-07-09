import {
  HStack,
  VStack,
  Text,
  IconButton,
  Spacer,
} from "@chakra-ui/react";
import { ArrowBackIcon } from "@chakra-ui/icons";
import { LEAF_ENTRIES, renderLeafRow, type RowContext } from "./settingsRegistry";

interface Props {
  onBack: () => void;
  ctx: RowContext;
}

function SecuritySettings({ onBack, ctx }: Props) {
  const entries = LEAF_ENTRIES.filter((e) => e.group === "security");
  return (
    <VStack spacing={4} align="stretch" flex="1">
      <HStack>
        <IconButton
          aria-label="Back"
          icon={<ArrowBackIcon />}
          variant="ghost"
          size="sm"
          onClick={onBack}
        />
        <Text
          fontSize="lg"
          fontWeight="900"
          color="text.primary"
          textTransform="uppercase"
          letterSpacing="tight"
        >
          Security
        </Text>
        <Spacer />
      </HStack>

      <Text fontSize="sm" color="text.secondary" fontWeight="500">
        Password, biometric unlock, agent access, and auto-lock timeout.
      </Text>

      {entries.map((e) => renderLeafRow(e.id, ctx))}
    </VStack>
  );
}

export default SecuritySettings;
