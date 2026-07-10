/**
 * AppearanceSettings — first user-facing screen of the theming rollout.
 *
 * Renders one preview card per registered theme. Each card shows the theme's
 * background, foreground, and three accent swatches (read from `tokens.preview`)
 * so the user can compare the two visual languages side-by-side without
 * actually switching. Clicking a card persists the selection via
 * `useThemeSelection`, which writes to chrome.storage.local + localStorage and
 * triggers an immediate re-render across the popup.
 *
 * Phase 4 of _docs/THEMING_PRD.md. As of P4a, only Settings (root) has been
 * migrated, so the picker is wrapped in a yellow warning banner that mentions
 * the rollout. Once Phases 5–12 land, the banner gets removed.
 */

import {
  Box,
  HStack,
  Text,
  VisuallyHidden,
  VStack,
} from "@chakra-ui/react";
import { CheckIcon } from "@chakra-ui/icons";
import { themeList, useTheme } from "@/theme";
import type { ThemeTokens } from "@/theme";
import { useThemedToast } from "@/hooks/useThemedToast";
import {
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemMeta,
  ListItemTitle,
  ListSurface,
} from "@/components/ui";
import { SettingsScreenFrame } from "./SettingsScreenFrame";

interface AppearanceSettingsProps {
  onCancel: () => void;
}

function AppearanceSettings({ onCancel }: AppearanceSettingsProps) {
  const { themeId, setThemeId } = useTheme();
  const toast = useThemedToast();

  const handleSelect = async (next: ThemeTokens) => {
    if (next.id === themeId) return;
    await setThemeId(next.id);
    toast({
      title: `Switched to ${next.name}`,
      status: "success",
      duration: 1500,
      isClosable: true,
      // Force the toast to render in the theme we just switched TO — the
      // closure captured pre-switch tokens and would otherwise flash the
      // previous theme's styling.
      themeOverride: next,
    });
  };

  return (
    <SettingsScreenFrame title="Appearance" onBack={onCancel}>
      <VStack spacing={6} align="stretch">
        <Text fontSize="sm" color="fg.secondary" lineHeight="1.5">
          Choose the visual style for WalletChan. Your selection is saved in
          this browser and applies immediately.
        </Text>

        <ListSurface aria-label="Wallet themes">
          {themeList.map((theme) => {
            const isActive = theme.id === themeId;
            return (
              <ListItem
                key={theme.id}
                interactive
                isSelected={isActive}
                onClick={() => handleSelect(theme)}
                aria-pressed={isActive}
                py={3}
              >
                <ListItemMedia>
                  <Box
                    aria-hidden="true"
                    w="52px"
                    h="52px"
                    bg={theme.preview.bg}
                    border="1px solid"
                    borderColor="border.default"
                    borderRadius="md"
                    display="flex"
                    flexDirection="column"
                    justifyContent="space-between"
                    p={2}
                  >
                    <Text
                      fontSize="xs"
                      fontWeight="700"
                      color={theme.preview.fg}
                      lineHeight="1"
                    >
                      Aa
                    </Text>
                    <HStack spacing={1}>
                      {theme.preview.accents.map((swatch, index) => (
                        <Box
                          key={index}
                          w="8px"
                          h="8px"
                          bg={swatch}
                          borderRadius="full"
                        />
                      ))}
                    </HStack>
                  </Box>
                </ListItemMedia>
                <ListItemContent>
                  <ListItemTitle>{theme.name}</ListItemTitle>
                  <ListItemDescription noOfLines={2}>
                    {theme.description}
                  </ListItemDescription>
                </ListItemContent>
                {isActive && (
                  <ListItemMeta color="accent.secondary" flex="0 0 auto">
                    <CheckIcon boxSize={4} aria-hidden="true" />
                    <VisuallyHidden>Active theme</VisuallyHidden>
                  </ListItemMeta>
                )}
              </ListItem>
            );
          })}
        </ListSurface>
      </VStack>
    </SettingsScreenFrame>
  );
}

export default AppearanceSettings;
