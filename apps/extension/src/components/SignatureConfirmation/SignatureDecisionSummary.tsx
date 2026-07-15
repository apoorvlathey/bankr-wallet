import { ChevronDownIcon, WarningTwoIcon } from "@chakra-ui/icons";
import {
  Button,
  Checkbox,
  HStack,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Portal,
  Text,
  VStack,
} from "@chakra-ui/react";

import { FromAccountDisplay } from "@/components/FromAccountDisplay";

export interface UnsafeSiweDecisionProps {
  isOpen: boolean;
  isAcknowledged: boolean;
  blockingError: string;
  isDisabled: boolean;
  onOpenChange: (open: boolean) => void;
  onAcknowledgedChange: (acknowledged: boolean) => void;
}

function UnsafeSiweDecisionPopover({
  isOpen,
  isAcknowledged,
  blockingError,
  isDisabled,
  onOpenChange,
  onAcknowledgedChange,
}: UnsafeSiweDecisionProps) {
  return (
    <Popover
      isOpen={isOpen}
      onClose={() => onOpenChange(false)}
      placement="top-end"
      gutter={8}
      closeOnBlur
    >
      <PopoverTrigger>
        <Button
          type="button"
          variant="unstyled"
          display="flex"
          w="full"
          minH="44px"
          h="auto"
          px={3}
          py={1}
          onClick={() => {
            if (!isDisabled) onOpenChange(!isOpen);
          }}
          isDisabled={isDisabled}
          aria-expanded={isOpen}
          borderWidth="1px"
          borderColor="status.error.border"
          borderRadius="lg"
          bg="status.error.bg"
          fontWeight="inherit"
          textTransform="none"
          _hover={{
            bg: "status.error.bg",
            borderColor: "status.error.emphasis",
          }}
          _focus={{ outline: "none" }}
          _focusVisible={{ boxShadow: "focus" }}
          justifyContent="space-between"
        >
          <HStack spacing={2} minW={0}>
            <WarningTwoIcon
              color="status.error.emphasis"
              boxSize="14px"
              flexShrink={0}
            />
            <Text color="status.error.fg" fontSize="xs" fontWeight="600">
              Validation warning
            </Text>
          </HStack>
          <HStack spacing={1.5} minW={0} justify="flex-end">
            {isAcknowledged && (
              <Text
                color="status.success.fg"
                fontSize="xs"
                fontWeight="700"
                noOfLines={1}
              >
                Acknowledged
              </Text>
            )}
            <ChevronDownIcon
              boxSize={4}
              color="fg.muted"
              transform={isOpen ? "rotate(180deg)" : "rotate(0deg)"}
              transitionProperty="transform"
              transitionDuration="fast"
              aria-hidden
            />
          </HStack>
        </Button>
      </PopoverTrigger>
      <Portal>
        <PopoverContent
          w="300px"
          maxW="calc(100vw - 32px)"
          maxH="calc(100vh - 96px)"
        >
          <PopoverBody p={3} overflowY="auto" overflowX="hidden">
            <VStack align="stretch" spacing={3}>
              <VStack align="stretch" spacing={1}>
                <HStack align="center" spacing={2}>
                  <WarningTwoIcon
                    color="status.error.emphasis"
                    boxSize="14px"
                    flexShrink={0}
                  />
                  <Text color="fg.primary" fontSize="sm" fontWeight="700">
                    Sign despite warning
                  </Text>
                </HStack>
                <Text
                  pl="22px"
                  color="fg.secondary"
                  fontSize="xs"
                  lineHeight="1.45"
                >
                  {blockingError}
                </Text>
              </VStack>
              <Checkbox
                isChecked={isAcknowledged}
                isDisabled={isDisabled}
                onChange={(event) =>
                  onAcknowledgedChange(event.target.checked)
                }
                alignItems="flex-start"
                sx={{
                  "& .chakra-checkbox__control[data-checked]": {
                    bg: "accent.highlight",
                    borderColor: "accent.highlight",
                    color: "accentFg.highlight",
                  },
                  "& .chakra-checkbox__control[data-checked]:hover": {
                    bg: "accent.highlight",
                    borderColor: "accent.highlight",
                  },
                }}
              >
                <Text color="fg.primary" fontSize="sm" lineHeight="1.4">
                  I understand the warning and want to sign anyway.
                </Text>
              </Checkbox>
            </VStack>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
}

export function SignatureDecisionSummary({
  address,
  unsafeSiweDecision,
}: {
  address: string;
  unsafeSiweDecision?: UnsafeSiweDecisionProps;
}) {
  return (
    <VStack align="stretch" spacing={2}>
      <HStack minW={0} justify="space-between" spacing={3}>
        <Text
          color="fg.secondary"
          fontSize="xs"
          fontWeight="600"
          flexShrink={0}
        >
          Signing with
        </Text>
        <HStack minW={0} justify="flex-end">
          <FromAccountDisplay address={address} />
        </HStack>
      </HStack>
      {unsafeSiweDecision && (
        <UnsafeSiweDecisionPopover {...unsafeSiweDecision} />
      )}
    </VStack>
  );
}
