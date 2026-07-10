/** Compact theme trigger backed by a mobile-style action sheet. */

import { Box, HStack, IconButton, useDisclosure, type IconButtonProps } from "@chakra-ui/react";
import { useRef } from "react";
import { themeList, useTheme, type ThemeTokens } from "@/theme";
import { ActionSheet } from "@/components/ui";

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

function ThemeSwatch({ theme }: { theme: ThemeTokens }) {
  return (
    <Box
      w="24px"
      h="24px"
      bg={theme.preview.bg}
      border="1px solid"
      borderColor="border.default"
      borderRadius="sm"
      display="flex"
      alignItems="flex-end"
      p="3px"
    >
      <HStack spacing="2px">
        {theme.preview.accents.map((swatch, index) => (
          <Box key={`${swatch}-${index}`} boxSize="4px" bg={swatch} borderRadius="full" />
        ))}
      </HStack>
    </Box>
  );
}

export default function ThemeSwitcher({
  size = "sm",
  ariaLabel = "Switch theme",
}: ThemeSwitcherProps) {
  const { themeId, setThemeId } = useTheme();
  const sheet = useDisclosure();
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <IconButton
        ref={triggerRef}
        aria-label={ariaLabel}
        icon={<PaletteIcon />}
        variant="ghost"
        size={size}
        color="text.secondary"
        onClick={sheet.onOpen}
      />
      <ActionSheet
        isOpen={sheet.isOpen}
        onClose={sheet.onClose}
        finalFocusRef={triggerRef}
        title="Choose appearance"
        description="Change WalletChan's visual style. Your accounts and wallet data are unaffected."
        choices={themeList.map((theme) => ({
          id: theme.id,
          label: theme.name,
          description: theme.description,
          isSelected: theme.id === themeId,
          icon: <ThemeSwatch theme={theme} />,
        }))}
        onSelect={(id) => {
          if (id === themeId) return;
          const selected = themeList.find((theme) => theme.id === id);
          if (selected) void setThemeId(selected.id);
        }}
      />
    </>
  );
}
