import {
  Button,
  HStack,
  IconButton,
  Image,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Portal,
  Text,
  Tooltip,
  VStack,
} from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import ChainIcon from "@/components/ChainIcon";
import {
  getAccountDashboardLinks,
  getDefaultAccountExplorerUrl,
} from "@/components/accountExplorerUtils";
import type { ResolvedChain } from "@/lib/chains";

interface AccountExplorerMenuProps {
  address: string;
  chains: ResolvedChain[];
}

export default function AccountExplorerMenu({
  address,
  chains,
}: AccountExplorerMenuProps) {
  const explorerChains = chains.filter((chain) => Boolean(chain.explorer));
  const dashboardLinks = getAccountDashboardLinks(address);

  return (
    <Popover
      trigger="hover"
      placement="bottom-end"
      openDelay={120}
      closeDelay={220}
      gutter={6}
      isLazy
    >
      <PopoverTrigger>
        <IconButton
          as="a"
          href={getDefaultAccountExplorerUrl(address)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="View active address on Etherscan; hover for other explorers"
          icon={<ExternalLinkIcon />}
          size="xs"
          minW="24px"
          w="24px"
          h="24px"
          variant="ghost"
          pointerEvents="auto"
          color="fg.secondary"
          _hover={{
            color: "accent.highlight",
            bg: "surface.raisedHover",
          }}
        />
      </PopoverTrigger>
      <Portal>
        <PopoverContent
          w="224px"
          maxW="calc(100vw - 24px)"
          maxH="280px"
          overflow="hidden"
          bg="surface.raised"
          borderColor="border.default"
          borderRadius="md"
          boxShadow="overlay"
          _focus={{ outline: "none" }}
        >
          <PopoverBody p={1.5} overflowY="auto">
            <Text
              px={2}
              pt={1}
              pb={1.5}
              color="fg.muted"
              fontSize="xs"
              fontWeight="700"
            >
              View address on
            </Text>
            <HStack
              role="group"
              aria-label="Portfolio dashboards"
              px={2}
              pb={2}
              spacing={1}
            >
              {dashboardLinks.map((dashboard) => (
                <Tooltip
                  key={dashboard.name}
                  label={dashboard.name}
                  placement="bottom"
                  openDelay={160}
                  hasArrow
                >
                  <IconButton
                    as="a"
                    href={dashboard.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`View active address on ${dashboard.name}`}
                    icon={
                      <Image
                        src={dashboard.iconSrc}
                        alt=""
                        boxSize="22px"
                        borderRadius="sm"
                      />
                    }
                    size="sm"
                    minW="36px"
                    w="36px"
                    h="36px"
                    variant="ghost"
                    _hover={{ bg: "surface.raisedHover" }}
                    _focusVisible={{
                      bg: "surface.raisedHover",
                      boxShadow: "outline",
                    }}
                  />
                </Tooltip>
              ))}
            </HStack>
            <VStack
              align="stretch"
              spacing={0.5}
              pt={1.5}
              borderTop="1px solid"
              borderColor="border.subtle"
            >
              {explorerChains.map((chain) => (
                <Button
                  key={chain.chainId}
                  as="a"
                  href={`${chain.explorer.replace(/\/+$/, "")}/address/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  variant="ghost"
                  h="36px"
                  px={2}
                  borderRadius="sm"
                  justifyContent="space-between"
                  fontWeight="600"
                  _hover={{
                    bg: "surface.raisedHover",
                    color: "accent.highlight",
                  }}
                >
                  <HStack minW={0} spacing={2}>
                    <ChainIcon
                      chainId={chain.chainId}
                      chainName={chain.name}
                      size="20px"
                      withChip
                    />
                    <Text noOfLines={1}>{chain.name}</Text>
                  </HStack>
                  <ExternalLinkIcon boxSize={3} color="fg.muted" flexShrink={0} />
                </Button>
              ))}
            </VStack>
          </PopoverBody>
        </PopoverContent>
      </Portal>
    </Popover>
  );
}
