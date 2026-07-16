import { Button } from "@chakra-ui/react";
import { isDarkThemeId, useTheme } from "@/theme";

export function ParamTabButton({
  label,
  isActive,
  onClick,
  isLast = false,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  isLast?: boolean;
}) {
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);

  return (
    <Button
      type="button"
      size="xs"
      h={isDarkTheme ? "28px" : "18px"}
      minH={isDarkTheme ? "28px" : "18px"}
      px={isDarkTheme ? 2.5 : 2}
      fontSize={isDarkTheme ? "2xs" : "9px"}
      fontWeight={isDarkTheme ? "600" : "800"}
      textTransform={isDarkTheme ? "none" : "uppercase"}
      letterSpacing={isDarkTheme ? "normal" : "wide"}
      bg={isDarkTheme ? "transparent" : isActive ? "fg.primary" : "transparent"}
      color={
        isDarkTheme
          ? isActive
            ? "fg.primary"
            : "fg.secondary"
          : isActive
            ? "fg.inverse"
            : "text.tertiary"
      }
      border={isDarkTheme ? 0 : "1.5px solid"}
      borderColor="border.default"
      borderBottomWidth={isDarkTheme ? "2px" : undefined}
      borderBottomStyle={isDarkTheme ? "solid" : undefined}
      borderBottomColor={
        isDarkTheme
          ? isActive
            ? "accent.highlight"
            : "transparent"
          : undefined
      }
      borderRadius={0}
      borderRight={!isDarkTheme && !isLast ? "none" : undefined}
      aria-pressed={isActive}
      onClick={onClick}
      _hover={
        isDarkTheme
          ? { bg: "surface.raisedHover", color: "fg.primary" }
          : { bg: "fg.primary", color: "fg.inverse" }
      }
      _active={{ transform: isDarkTheme ? "none" : "translate(1px, 1px)" }}
      _focusVisible={{ boxShadow: "focus" }}
    >
      {label}
    </Button>
  );
}
