import { ExternalLinkIcon } from "@chakra-ui/icons";
import {
  Box,
  HStack,
  IconButton,
  Text,
  Tooltip,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import ChainIcon from "@/components/ChainIcon";
import { CopyButton } from "@/components/CopyButton";
import type { DiscoveredSafe } from "./useSafeOwnerDiscovery";

interface ChainInfo {
  name: string;
  explorer: string;
}

export function DiscoveredSafeRow({
  candidate,
  chainById,
  onSelect,
}: {
  candidate: DiscoveredSafe;
  chainById: ReadonlyMap<number, ChainInfo>;
  onSelect: () => void;
}) {
  const primarySnapshot = candidate.snapshots[0];
  const primaryChain = primarySnapshot
    ? chainById.get(primarySnapshot.chainId)
    : undefined;

  return (
    <HStack
      spacing={1}
      minH="72px"
      bg="surface.raised"
      border="1px solid"
      borderColor="border.default"
      borderRadius="lg"
      overflow="hidden"
    >
      <Box
        as="button"
        type="button"
        minW={0}
        minH="72px"
        flex={1}
        px={3}
        py={3}
        textAlign="left"
        _hover={{ bg: "surface.raisedHover" }}
        _active={{ bg: "surface.sunken" }}
        _focus={{ outline: "none" }}
        _focusVisible={{
          boxShadow: "inset 0 0 0 2px var(--chakra-colors-border-focus)",
        }}
        onClick={onSelect}
      >
        <Text fontFamily="mono" fontSize="sm" noOfLines={1}>
          {candidate.address.slice(0, 8)}…{candidate.address.slice(-6)}
        </Text>
      </Box>

      <HStack flexShrink={0} spacing={1} pr={3}>
        <CopyButton value={candidate.address} label="Copy Safe address" />
        {primaryChain && (
          <Tooltip
            label={`View on ${primaryChain.name}`}
            hasArrow
            openDelay={250}
          >
            <IconButton
              as="a"
              href={`${primaryChain.explorer}/address/${candidate.address}`}
              target="_blank"
              rel="noreferrer"
              aria-label={`View Safe on ${primaryChain.name}`}
              icon={<ExternalLinkIcon />}
              size="xs"
              minW="24px"
              w="24px"
              h="24px"
              variant="ghost"
            />
          </Tooltip>
        )}
        <Wrap spacing={1.5} justify="flex-end">
          {candidate.snapshots.map((snapshot) => {
            const chain = chainById.get(snapshot.chainId);
            const chainName = chain?.name || `Chain ${snapshot.chainId}`;
            return (
              <WrapItem key={snapshot.chainId}>
                <Tooltip label={chainName} hasArrow openDelay={250}>
                  <Box aria-label={chainName}>
                    <ChainIcon
                      chainId={snapshot.chainId}
                      chainName={chainName}
                      size="22px"
                      withChip
                    />
                  </Box>
                </Tooltip>
              </WrapItem>
            );
          })}
        </Wrap>
      </HStack>
    </HStack>
  );
}
