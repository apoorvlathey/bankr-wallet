import { Box, Button, Icon, Text, type ButtonProps } from "@chakra-ui/react";
import type { ReactNode } from "react";

import { playInteractionSound } from "@/sounds/soundManager";
import { isDarkThemeId, useTheme } from "@/theme";

interface HomeQuickActionButtonProps {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  emphasized?: boolean;
  accentIcon?: boolean;
  mutedIcon?: boolean;
  indicator?: boolean;
  ariaLabel?: string;
  justifySelf?: ButtonProps["justifySelf"];
}

export const HomeSendIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="20px" aria-hidden="true">
    <path
      d="M7 17 17 7M10 7h7v7"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
);

export const HomeUnshieldIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="20px" aria-hidden="true">
    <path
      d="M12 4v16m-6-6 6 6 6-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Icon>
);

/** Shared root-wallet action anatomy used by both public and private modes. */
export function HomeQuickActionButton({
  label,
  icon,
  onClick,
  emphasized = false,
  accentIcon = true,
  mutedIcon = false,
  indicator = false,
  ariaLabel,
  justifySelf = "center",
}: HomeQuickActionButtonProps) {
  const { themeId } = useTheme();
  const isWarmMidnight = isDarkThemeId(themeId);

  return (
    <Button
      type="button"
      variant="ghost"
      w="100%"
      maxW="88px"
      justifySelf={justifySelf}
      minW={0}
      h="auto"
      minH="78px"
      px={2}
      py={1.5}
      borderRadius="md"
      flexDirection="column"
      gap={2}
      color="fg.primary"
      aria-label={ariaLabel ?? label}
      onClick={onClick}
      onMouseEnter={() => void playInteractionSound("quickActionHover")}
      _hover={{ bg: "surface.raisedHover" }}
      _active={{ bg: "surface.sunken" }}
    >
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        boxSize="40px"
        borderRadius={isWarmMidnight ? "md" : "full"}
        bg={
          emphasized
            ? isWarmMidnight
              ? "accent.highlight"
              : "accent.primary"
            : "surface.raised"
        }
        color={
          emphasized
            ? isWarmMidnight
              ? "accentFg.highlight"
              : "accentFg.primary"
            : isWarmMidnight && accentIcon
              ? "accent.highlight"
              : isWarmMidnight && mutedIcon
                ? "fg.secondary"
              : "fg.primary"
        }
        borderWidth={emphasized ? "0" : "1px"}
        borderColor="border.subtle"
        position="relative"
      >
        {icon}
        {indicator && (
          <Box
            position="absolute"
            top="-4px"
            right="-4px"
            boxSize="10px"
            borderRadius="full"
            bg="accent.highlight"
            border="2px solid"
            borderColor="surface.base"
            aria-hidden="true"
          />
        )}
      </Box>
      <Text as="span" fontSize="sm" fontWeight="600" lineHeight="1.2">
        {label}
      </Text>
    </Button>
  );
}
