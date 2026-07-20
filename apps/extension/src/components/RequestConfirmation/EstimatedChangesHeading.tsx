import { InfoOutlineIcon } from "@chakra-ui/icons";
import { Box, Flex, HStack, Text, Tooltip } from "@chakra-ui/react";
import ChainIcon from "@/components/ChainIcon";

interface EstimatedChangesHeadingProps {
  chainId: number;
  chainName: string;
  showPreposition?: boolean;
}

/** Compact destination-chain context shared by request-section headings. */
export function RequestChainContext({
  chainId,
  chainName,
  showPreposition = true,
}: EstimatedChangesHeadingProps) {
  return (
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
      {showPreposition && (
        <Text as="span" color="fg.secondary" fontSize="xs" fontWeight="500">
          on
        </Text>
      )}
      <ChainIcon chainId={chainId} chainName={chainName} size="14px" withChip />
      <Text as="span" color="fg.primary" fontSize="xs" fontWeight="600">
        {chainName}
      </Text>
    </HStack>
  );
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
            as="button"
            type="button"
            aria-label="About estimated changes"
            boxSize="24px"
            p={0}
            bg="transparent"
            border={0}
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

      <RequestChainContext chainId={chainId} chainName={chainName} />
    </Flex>
  );
}
