import { ChevronDownIcon } from "@chakra-ui/icons";
import { Button, HStack, Text } from "@chakra-ui/react";
import ChainIcon from "@/components/ChainIcon";

interface TokenPickerNetworkButtonProps {
  chainId: number;
  chainName: string;
  onClick: () => void;
}

/** Compact network context + nested-picker trigger shared by token pickers. */
export function TokenPickerNetworkButton({
  chainId,
  chainName,
  onClick,
}: TokenPickerNetworkButtonProps) {
  return (
    <Button
      type="button"
      variant="unstyled"
      display="flex"
      alignItems="center"
      h="24px"
      minH="24px"
      minW={0}
      maxW="220px"
      px={2}
      bg="surface.raised"
      border="1px solid"
      borderColor="border.default"
      borderRadius="full"
      overflow="hidden"
      flexShrink={0}
      _hover={{ bg: "surface.raisedHover" }}
      _active={{ bg: "surface.raisedHover", transform: "none" }}
      _focusVisible={{ outline: "none", boxShadow: "focus" }}
      aria-label={`Change network, currently ${chainName}`}
      onClick={onClick}
    >
      <HStack minW={0} spacing={1}>
        <Text as="span" flexShrink={0} fontSize="2xs" fontWeight="400" color="fg.muted">
          on
        </Text>
        <ChainIcon
          chainId={chainId}
          chainName={chainName}
          size="14px"
          withChip
        />
        <Text
          as="span"
          minW={0}
          fontSize="xs"
          fontWeight="600"
          color="fg.secondary"
          noOfLines={1}
        >
          {chainName}
        </Text>
        <ChevronDownIcon
          aria-hidden="true"
          flexShrink={0}
          boxSize={3.5}
          color="fg.muted"
        />
      </HStack>
    </Button>
  );
}
