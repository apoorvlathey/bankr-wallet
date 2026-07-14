import { InfoOutlineIcon } from "@chakra-ui/icons";
import { Box, Flex, HStack, Text, Tooltip } from "@chakra-ui/react";
import ChainIcon from "@/components/ChainIcon";

interface EstimatedChangesHeadingProps {
  chainId: number;
  chainName: string;
}

/** Shared simulation heading and network context for request decisions. */
export function EstimatedChangesHeading({
  chainId,
  chainName,
}: EstimatedChangesHeadingProps) {
  return (
    <Flex as="span" align="center" justify="space-between" gap={2} w="full">
      <HStack as="span" spacing={1} minW={0}>
        <Text as="span" fontSize="xl" fontWeight="700" noOfLines={1}>
          Estimated changes
        </Text>
        <Tooltip
          label="This is a simulation estimate. Actual onchain transfers may differ based on updated contract state."
          fontSize="xs"
          hasArrow
          placement="top"
        >
          <Box
            as="span"
            tabIndex={0}
            aria-label="About estimated changes"
            boxSize="24px"
            display="inline-flex"
            alignItems="center"
            justifyContent="center"
            color="fg.muted"
            borderRadius="sm"
            _focusVisible={{ boxShadow: "outline" }}
          >
            <InfoOutlineIcon boxSize="13px" />
          </Box>
        </Tooltip>
      </HStack>

      <HStack
        as="span"
        spacing={1}
        flexShrink={0}
        minH="28px"
        px={2}
        borderWidth="1px"
        borderStyle="solid"
        borderColor="border.subtle"
        borderRadius="md"
        bg="surface.raised"
      >
        <Text as="span" color="fg.secondary" fontSize="xs" fontWeight="500">
          on
        </Text>
        <ChainIcon chainId={chainId} chainName={chainName} size="14px" withChip />
        <Text as="span" color="fg.primary" fontSize="xs" fontWeight="600">
          {chainName}
        </Text>
      </HStack>
    </Flex>
  );
}
