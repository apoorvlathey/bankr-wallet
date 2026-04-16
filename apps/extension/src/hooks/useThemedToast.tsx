import {
  useToast,
  UseToastOptions,
  Box,
  HStack,
  Text,
  CloseButton,
} from "@chakra-ui/react";
import { CheckIcon, WarningIcon, InfoIcon } from "@chakra-ui/icons";
import { useTheme } from "@/theme";
import type { ThemeTokens } from "@/theme";

type ToastStatus = "info" | "warning" | "success" | "error";

interface ThemedToastOptions extends Omit<UseToastOptions, "render"> {
  title?: string;
  description?: string;
  status?: ToastStatus;
  /**
   * Render the toast against a specific theme instead of the currently active
   * one. Used by the theme picker so the "Switched to X" confirmation toast
   * is styled in the theme being selected, not the theme we're leaving.
   */
  themeOverride?: ThemeTokens;
}

type AccentIntent = "primary" | "secondary" | "highlight";

// Each status maps to an accent intent. The accent tokens (and their paired
// `accentFg` contrast colors) come from the active theme — Bauhaus paints them
// as saturated red/blue/yellow, Midnight paints them as iridescent indigo /
// cyan / amber.
const statusToAccent: Record<ToastStatus, AccentIntent> = {
  info: "secondary",
  success: "highlight",
  warning: "highlight",
  error: "primary",
};

// Geometric corner decoration cycles to a different accent so it always pops
// against the toast body — same intent rotation Bauhaus already used.
const statusToCorner: Record<ToastStatus, AccentIntent> = {
  info: "primary",
  success: "secondary",
  warning: "secondary",
  error: "highlight",
};

const StatusIcon = ({ status }: { status: ToastStatus }) => {
  switch (status) {
    case "success":
      return <CheckIcon boxSize={3} />;
    case "error":
      return <WarningIcon boxSize={3} />;
    case "warning":
      return <WarningIcon boxSize={3} />;
    case "info":
    default:
      return <InfoIcon boxSize={3} />;
  }
};

export function useThemedToast() {
  const toast = useToast();
  // Resolve tokens via context rather than Chakra props — Chakra portals the
  // toast outside the ChakraProvider tree, so prop strings like
  // `bg="accent.primary"` fall back to the default theme (Bauhaus) regardless
  // of the active selection. Reading from `useTheme()` and passing raw hex /
  // border / shadow strings gives us a toast that actually matches the active
  // theme.
  const { tokens: activeTokens } = useTheme();

  return (options: ThemedToastOptions) => {
    const status = options.status || "info";
    const accent = statusToAccent[status];
    const corner = statusToCorner[status];
    const tokens = options.themeOverride ?? activeTokens;

    const bgColor = tokens.colors.accent[accent];
    const fgColor = tokens.colors.accentFg[accent];
    const cornerColor = tokens.colors.accent[corner];
    const borderColor = tokens.colors.border.default;
    const borderStyle = tokens.borders.medium;
    const innerBorderStyle = tokens.borders.thin;
    const shadow = tokens.shadows.card;
    const radius = tokens.radii.card;
    // Bauhaus shows the hard-edge corner decorator; Midnight's soft aesthetic
    // omits it (same rule ThemedCard follows).
    const showCorner = tokens.id === "bauhaus";

    return toast({
      position: options.position || "bottom",
      duration: options.duration ?? 4000,
      isClosable: options.isClosable ?? true,
      ...options,
      render: ({ onClose }) => (
        <Box
          bg={bgColor}
          color={fgColor}
          border={borderStyle}
          borderRadius={radius}
          boxShadow={shadow}
          px={4}
          py={3}
          position="relative"
        >
          {showCorner && (
            <Box
              position="absolute"
              top="-3px"
              right="-3px"
              w="8px"
              h="8px"
              bg={cornerColor}
              border="2px solid"
              borderColor={borderColor}
            />
          )}

          <HStack spacing={3} align="flex-start">
            <Box
              bg={fgColor}
              color={bgColor}
              p={1.5}
              border={innerBorderStyle}
              borderRadius={radius}
              display="flex"
              alignItems="center"
              justifyContent="center"
              flexShrink={0}
            >
              <StatusIcon status={status} />
            </Box>

            <Box flex={1}>
              {options.title && (
                <Text
                  fontWeight={tokens.headingStyle.weight}
                  fontSize="sm"
                  textTransform={tokens.headingStyle.transform}
                  letterSpacing={tokens.headingStyle.transform === "uppercase" ? "wider" : "normal"}
                  mb={options.description ? 0.5 : 0}
                >
                  {options.title}
                </Text>
              )}
              {options.description && (
                <Text fontWeight="500" fontSize="sm" opacity={0.9}>
                  {options.description}
                </Text>
              )}
            </Box>

            {options.isClosable !== false && (
              <CloseButton
                size="sm"
                color={fgColor}
                onClick={onClose}
                _hover={{ bg: "whiteAlpha.200" }}
              />
            )}
          </HStack>
        </Box>
      ),
    });
  };
}
