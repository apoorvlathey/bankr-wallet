import {
  createContext,
  useContext,
  type ReactNode,
} from "react";
import { Box, Flex, HStack, Text } from "@chakra-ui/react";
import { ChevronRightIcon } from "@chakra-ui/icons";
import {
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
} from "@/components/ui";
import {
  Decorator,
  isDarkThemeId,
  ThemedCard,
  useStripTokens,
  useTheme,
} from "@/theme";
import type { DecoratorAccent } from "@/theme";

const SettingsRowListContext = createContext(false);

export function SettingsRowListProvider({ children }: { children: ReactNode }) {
  return (
    <SettingsRowListContext.Provider value>
      {children}
    </SettingsRowListContext.Provider>
  );
}

/**
 * Settings row public API. Decorative props remain for registry compatibility;
 * the list presentation intentionally does not render corner ornaments.
 */
export interface SettingsRowProps {
  title: string;
  subtitle: string;
  icon: ReactNode;
  iconBg: string;
  iconColor?: string;
  /** Midnight-only glyph accent used while the interactive row is hovered. */
  iconHoverColor?: string;
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
  iconHoverColor = iconBg,
  cornerAccent = "highlight",
  cornerBg,
  showChevron = false,
  onClick,
  disabled = false,
  badge,
  borderRadiusFull = false,
}: SettingsRowProps) {
  const useListPresentation = useContext(SettingsRowListContext);
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const chevronStrip = useStripTokens();

  if (!useListPresentation) {
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

  const content = (
    <>
      <ListItemMedia>
        <Box
          as="span"
          boxSize="40px"
          display="inline-flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
          bg={isDarkTheme ? "surface.sunken" : iconBg}
          color={isDarkTheme ? "fg.secondary" : iconColor}
          transitionProperty="color"
          transitionDuration="fast"
          borderWidth={isDarkTheme ? "1px" : "2px"}
          borderStyle="solid"
          borderColor={isDarkTheme ? "border.subtle" : "border.default"}
          borderRadius={isDarkTheme ? "md" : 0}
          data-settings-row-icon=""
        >
          {icon}
        </Box>
      </ListItemMedia>

      <ListItemContent>
        <Flex as="span" minW={0} align="center" gap={2}>
          <ListItemTitle>{title}</ListItemTitle>
          {badge}
        </Flex>
        <ListItemDescription>{subtitle}</ListItemDescription>
      </ListItemContent>

      {showChevron && !disabled && (
        <ListItemActions aria-hidden="true">
          <ChevronRightIcon boxSize={5} color="fg.muted" />
        </ListItemActions>
      )}
    </>
  );

  if (onClick) {
    return (
      <ListItem
        interactive
        isDisabled={disabled}
        onClick={onClick}
        sx={
          isDarkTheme && !disabled
            ? {
                "&:hover [data-settings-row-icon]": {
                  color: iconHoverColor,
                },
              }
            : undefined
        }
      >
        {content}
      </ListItem>
    );
  }

  return <ListItem isDisabled={disabled}>{content}</ListItem>;
}
