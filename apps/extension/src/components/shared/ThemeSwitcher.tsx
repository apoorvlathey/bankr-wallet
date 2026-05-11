/**
 * ThemeSwitcher — compact icon button + dropdown for switching themes.
 *
 * Enumerates every registered theme via `themeList`, so adding a new theme
 * file automatically shows up here with no edits. Each menu row shows a
 * mini swatch (rendered with that theme's raw preview colors), the theme
 * name, and a check mark on the active theme. Selecting a row calls
 * `setThemeId` which persists the choice and triggers an immediate
 * re-render across the popup.
 */

import {
  Box,
  HStack,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
  type IconButtonProps,
} from "@chakra-ui/react";
import { CheckIcon } from "@chakra-ui/icons";
import { themeList, useTheme } from "@/theme";
import type { ThemeTokens } from "@/theme";

interface ThemeSwitcherProps {
  size?: IconButtonProps["size"];
  ariaLabel?: string;
}

function PaletteIcon() {
  return (
    <Box
      as="svg"
      viewBox="0 0 24 24"
      w="18px"
      h="18px"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 2a10 10 0 1 0 0 20 2 2 0 0 0 2-2v-1a2 2 0 0 1 2-2h2a4 4 0 0 0 4-4 10 10 0 0 0-10-11z" />
      <circle cx="7.5" cy="10.5" r="1.5" fill="currentColor" />
      <circle cx="12" cy="7.5" r="1.5" fill="currentColor" />
      <circle cx="16.5" cy="10.5" r="1.5" fill="currentColor" />
    </Box>
  );
}

export default function ThemeSwitcher({
  size = "sm",
  ariaLabel = "Switch theme",
}: ThemeSwitcherProps) {
  const { themeId, setThemeId } = useTheme();

  const handleSelect = (theme: ThemeTokens) => {
    if (theme.id === themeId) return;
    void setThemeId(theme.id);
  };

  return (
    <Menu placement="bottom-end" autoSelect={false}>
      <MenuButton
        as={IconButton}
        aria-label={ariaLabel}
        icon={<PaletteIcon />}
        variant="ghost"
        size={size}
        color="text.secondary"
      />
      <MenuList
        bg="surface.raised"
        border="2px solid"
        borderColor="border.default"
        boxShadow="card"
        p={1}
        minW="auto"
        w="auto"
        zIndex={20}
      >
        {themeList.map((theme) => {
          const isActive = theme.id === themeId;
          return (
            <MenuItem
              key={theme.id}
              onClick={() => handleSelect(theme)}
              bg="transparent"
              _hover={{ bg: "surface.raisedHover" }}
              _focus={{ bg: "surface.raisedHover" }}
              px={2}
              py={2}
              borderRadius="md"
            >
              <HStack spacing={2.5}>
                {/* Mini swatch — uses theme's raw preview colors so each row
                    shows its own theme regardless of the active theme. */}
                <Box
                  w="24px"
                  h="24px"
                  bg={theme.preview.bg}
                  border="1px solid"
                  borderColor="border.default"
                  borderRadius="sm"
                  flexShrink={0}
                  display="flex"
                  flexDirection="column"
                  justifyContent="space-between"
                  p="2px"
                >
                  <Text
                    fontSize="7px"
                    fontWeight="900"
                    color={theme.preview.fg}
                    lineHeight="1"
                  >
                    Aa
                  </Text>
                  <HStack spacing="1px">
                    {theme.preview.accents.map((swatch, i) => (
                      <Box
                        key={i}
                        w="4px"
                        h="4px"
                        bg={swatch}
                        borderRadius="sm"
                      />
                    ))}
                  </HStack>
                </Box>

                <Text
                  fontSize="sm"
                  fontWeight="700"
                  color="text.primary"
                  lineHeight="1.2"
                >
                  {theme.name}
                </Text>

                {isActive && (
                  <CheckIcon
                    boxSize={3}
                    color="accent.secondary"
                    flexShrink={0}
                    ml={1}
                  />
                )}
              </HStack>
            </MenuItem>
          );
        })}
      </MenuList>
    </Menu>
  );
}
