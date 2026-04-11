import {
  useToast,
  UseToastOptions,
  Box,
  HStack,
  Text,
  CloseButton,
} from "@chakra-ui/react";
import { CheckIcon, WarningIcon, InfoIcon } from "@chakra-ui/icons";

type ToastStatus = "info" | "warning" | "success" | "error";

interface ThemedToastOptions extends Omit<UseToastOptions, "render"> {
  title?: string;
  description?: string;
  status?: ToastStatus;
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

  return (options: ThemedToastOptions) => {
    const status = options.status || "info";
    const accent = statusToAccent[status];
    const corner = statusToCorner[status];

    return toast({
      position: options.position || "bottom",
      duration: options.duration ?? 4000,
      isClosable: options.isClosable ?? true,
      ...options,
      render: ({ onClose }) => (
        <Box
          bg={`accent.${accent}`}
          color={`accentFg.${accent}`}
          border="3px solid"
          borderColor="border.default"
          boxShadow="card"
          px={4}
          py={3}
          position="relative"
        >
          {/* Corner geometric decoration */}
          <Box
            position="absolute"
            top="-3px"
            right="-3px"
            w="8px"
            h="8px"
            bg={`accent.${corner}`}
            border="2px solid"
            borderColor="border.default"
          />

          <HStack spacing={3} align="flex-start">
            {/* Status icon in geometric container */}
            <Box
              bg={`accentFg.${accent}`}
              color={`accent.${accent}`}
              p={1.5}
              border="2px solid"
              borderColor="border.default"
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
                  fontWeight="700"
                  fontSize="sm"
                  textTransform="uppercase"
                  letterSpacing="wider"
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
                color={`accentFg.${accent}`}
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
