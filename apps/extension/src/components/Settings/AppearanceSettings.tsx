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
  IconButton,
  Spacer,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ArrowBackIcon, CheckIcon } from "@chakra-ui/icons";
import { themeList, useTheme } from "@/theme";
import { ThemedCard, Decorator } from "@/theme";
import type { ThemeTokens } from "@/theme";
import { useThemedToast } from "@/hooks/useThemedToast";

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
    <VStack spacing={4} align="stretch">
      {/* Header */}
      <HStack>
        <IconButton
          aria-label="Back"
          icon={<ArrowBackIcon />}
          variant="ghost"
          size="sm"
          onClick={onCancel}
        />
        <Text
          fontSize="lg"
          fontWeight="900"
          color="text.primary"
          textTransform="uppercase"
          letterSpacing="tight"
        >
          Appearance
        </Text>
        <Spacer />
      </HStack>

      <Text fontSize="sm" color="text.secondary" fontWeight="500">
        Choose how the wallet looks. Your selection persists across browser sessions.
      </Text>

      {/* Theme picker grid */}
      <VStack spacing={3} align="stretch">
        {themeList.map((theme) => {
          const isActive = theme.id === themeId;
          return (
            <ThemedCard
              key={theme.id}
              weight="medium"
              interactive
              p={4}
              position="relative"
              onClick={() => handleSelect(theme)}
              borderColor={isActive ? "accent.secondary" : "border.default"}
            >
              <Decorator
                corner="top-right"
                accent={isActive ? "secondary" : "highlight"}
              />

              <HStack spacing={3} align="center">
                {/* Mini swatch preview — uses raw theme.preview values so each
                    card always shows its own theme colors regardless of the
                    currently active theme. */}
                <Box
                  w="56px"
                  h="56px"
                  bg={theme.preview.bg}
                  border="2px solid"
                  borderColor="border.default"
                  flexShrink={0}
                  display="flex"
                  flexDirection="column"
                  justifyContent="space-between"
                  p={1.5}
                >
                  <Text
                    fontSize="2xs"
                    fontWeight="900"
                    color={theme.preview.fg}
                    lineHeight="1"
                  >
                    Aa
                  </Text>
                  <HStack spacing={0.5}>
                    {theme.preview.accents.map((swatch, i) => (
                      <Box
                        key={i}
                        w="10px"
                        h="10px"
                        bg={swatch}
                        border="1px solid"
                        borderColor="border.default"
                      />
                    ))}
                  </HStack>
                </Box>

                <VStack spacing={0.5} align="flex-start" flex={1} minW={0}>
                  <HStack spacing={2}>
                    <Text
                      fontWeight="900"
                      color="text.primary"
                      fontSize="md"
                      textTransform="uppercase"
                    >
                      {theme.name}
                    </Text>
                    {isActive && (
                      <HStack
                        spacing={1}
                        bg="accent.secondary"
                        color="accentFg.secondary"
                        border="2px solid"
                        borderColor="border.default"
                        px={1.5}
                        py={0}
                        fontSize="2xs"
                        fontWeight="900"
                      >
                        <CheckIcon boxSize={2.5} />
                        <Text>ACTIVE</Text>
                      </HStack>
                    )}
                  </HStack>
                  <Text
                    fontSize="xs"
                    color="text.secondary"
                    fontWeight="500"
                    noOfLines={2}
                  >
                    {theme.description}
                  </Text>
                </VStack>
              </HStack>
            </ThemedCard>
          );
        })}
      </VStack>
    </VStack>
  );
}

export default AppearanceSettings;
