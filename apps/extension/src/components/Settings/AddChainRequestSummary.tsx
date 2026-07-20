import { Box, Heading, HStack, Text, VStack } from "@chakra-ui/react";

import ChainIcon from "@/components/ChainIcon";
import { RequestIdentity } from "@/components/RequestConfirmation/RequestIdentity";
import { useIconChipBg } from "@/theme";

interface AddChainRequestSummaryProps {
  chainId: number;
  chainName: string;
  favicon: string | null;
  origin: string;
}

function getOriginInitials(label: string): string {
  const parts = label.split(/[.\s_-]+/u).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase() || "?";
}

/** Standard requesting-app identity followed by the network being proposed. */
export function AddChainRequestSummary({
  chainId,
  chainName,
  favicon,
  origin,
}: AddChainRequestSummaryProps) {
  const iconChipBg = useIconChipBg();
  let originHostname = origin;
  try {
    originHostname = new URL(origin).hostname;
  } catch {
    // Preserve non-URL origins as their literal security identity.
  }

  return (
    <VStack align="stretch" spacing={3}>
      <RequestIdentity
        origin={origin}
        originHostname={originHostname || null}
        favicon={favicon}
        iconChipBg={iconChipBg}
        originInitials={getOriginInitials(originHostname || origin)}
      />

      <HStack
        as="section"
        aria-labelledby="add-chain-request-name"
        spacing={3}
        p={4}
        bg="surface.raised"
        borderWidth="1px"
        borderColor="border.default"
        borderRadius="lg"
      >
        <Box
          boxSize="48px"
          display="flex"
          alignItems="center"
          justifyContent="center"
          bg="surface.sunken"
          borderWidth="1px"
          borderColor="border.subtle"
          borderRadius="md"
          flexShrink={0}
        >
          <ChainIcon
            chainId={chainId}
            chainName={chainName}
            size="32px"
            withChip
          />
        </Box>

        <VStack align="stretch" spacing={0.5} minW={0}>
          <Text color="fg.secondary" fontSize="xs" fontWeight="600">
            Network to add
          </Text>
          <Heading
            as="h2"
            id="add-chain-request-name"
            color="fg.primary"
            fontSize="xl"
            lineHeight="1.3"
            overflowWrap="anywhere"
          >
            {chainName}
          </Heading>
          <Text
            color="fg.secondary"
            fontFamily="mono"
            fontSize="xs"
            sx={{ fontVariantNumeric: "tabular-nums" }}
          >
            Chain ID {chainId}
          </Text>
        </VStack>
      </HStack>
    </VStack>
  );
}
