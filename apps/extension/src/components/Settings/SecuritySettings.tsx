import { Box, Text, VStack } from "@chakra-ui/react";
import { AppHeader, AppScreen, ListSurface, ScreenBody } from "@/components/ui";
import { SettingsRowListProvider } from "./SettingsRow";
import { LEAF_ENTRIES, renderLeafRow, type RowContext } from "./settingsRegistry";

interface Props {
  onBack: () => void;
  ctx: RowContext;
}

function SecuritySettings({ onBack, ctx }: Props) {
  const entries = LEAF_ENTRIES.filter((entry) => entry.group === "security");
  return (
    <Box flex="1 1 auto" minH={0} mx={-4} my={-4} w="calc(100% + 2rem)" h="calc(100% + 2rem)">
      <AppScreen>
        <AppHeader title="Security" onBack={onBack} />
        <ScreenBody pb={6}>
          <VStack align="stretch" spacing={4}>
            <Text fontSize="sm" color="fg.secondary">
              Password, biometric unlock, agent access, and automatic locking.
            </Text>
            <ListSurface aria-label="Security settings">
              <SettingsRowListProvider>
                {entries.map((entry) => renderLeafRow(entry.id, ctx))}
              </SettingsRowListProvider>
            </ListSurface>
          </VStack>
        </ScreenBody>
      </AppScreen>
    </Box>
  );
}

export default SecuritySettings;
