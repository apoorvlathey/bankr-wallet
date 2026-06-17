import { type ReactNode } from "react";
import { Box, HStack, Text } from "@chakra-ui/react";
import { ChevronRightIcon } from "@chakra-ui/icons";
import { isDarkThemeId, ThemedCard, Decorator, useStripTokens, useTheme } from "@/theme";
import type { DecoratorAccent } from "@/theme";

/**
 * Settings row — wraps ThemedCard with the consistent layout used by every
 * entry on the Settings menu (icon swatch + title + subtitle + chevron).
 *
 * `iconBg` and `iconColor` accept any Chakra color token so callers can mix
 * intent tokens (`accent.highlight`, `accent.primary`) with status colors as
 * needed. The corner ornament is rendered via `<Decorator>` so it's
 * automatically suppressed in themes without `decorators.cardCorner`.
 */
export interface SettingsRowProps {
  title: string;
  subtitle: string;
  icon: ReactNode;
  iconBg: string;
  iconColor?: string;
  cornerAccent?: DecoratorAccent;
  cornerBg?: string;
  showChevron?: boolean;
  onClick?: () => void;
  disabled?: boolean;
  badge?: ReactNode;
  borderRadiusFull?: boolean;
}

export function SettingsRow({
  title,
  subtitle,
  icon,
  iconBg,
  iconColor = "fg.inverse",
  cornerAccent = "highlight",
  cornerBg,
  showChevron = false,
  onClick,
  disabled = false,
  badge,
  borderRadiusFull = false,
}: SettingsRowProps) {
  // Strip tokens give us the proper inverted bar in each theme: BLACK box +
  // WHITE chevron in Bauhaus, recessed surface.sunken + light chevron in
  // Midnight. The previous `bg="fg.primary"` rendered as a stark off-white
  // square in Midnight (because fg.primary is near-white there).
  const chevronStrip = useStripTokens();
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  return (
    <ThemedCard
      weight="medium"
      interactive={!disabled}
      p={4}
      position="relative"
      cursor={disabled ? "not-allowed" : "pointer"}
      onClick={disabled ? undefined : onClick}
      opacity={disabled ? 0.55 : 1}
    >
      <Decorator
        corner="top-right"
        accent={cornerAccent}
        {...(cornerBg ? { bg: cornerBg } : {})}
        {...(borderRadiusFull ? { borderRadius: "full" } : {})}
      />

      <HStack justify="space-between">
        <HStack spacing={3}>
          <Box
            p={2}
            bg={iconBg}
            color={iconColor}
            borderRadius={isDarkTheme ? "md" : undefined}
          >
            {icon}
          </Box>
          <Box>
            <HStack spacing={2}>
              <Text fontWeight="700" color="text.primary">
                {title}
              </Text>
              {badge}
            </HStack>
            <Text fontSize="xs" color="text.secondary" fontWeight="500">
              {subtitle}
            </Text>
          </Box>
        </HStack>
        {showChevron && (
          <Box
            bg={chevronStrip.bg}
            p={1}
            borderRadius={isDarkTheme ? "md" : undefined}
          >
            <ChevronRightIcon color={chevronStrip.fg} />
          </Box>
        )}
      </HStack>
    </ThemedCard>
  );
}
