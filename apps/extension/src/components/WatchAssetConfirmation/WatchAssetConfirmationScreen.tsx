import {
  Box,
  HStack,
  IconButton,
  Image,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import type { ReactNode } from "react";

import ChainIcon from "@/components/ChainIcon";
import { CopyButton } from "@/components/CopyButton";
import {
  ConfirmationScreen,
  InlineDisclosure,
  ListItem,
  ListItemActions,
  ListSurface,
  OutcomeCard,
} from "@/components/ui";

interface WatchAssetConfirmationScreenProps {
  symbol: string;
  address: string;
  decimals: number;
  imageUrl?: string;
  chainId: number;
  chainName: string;
  explorerUrl?: string;
  originHostname: string;
  origin: string;
  originFavicon: string;
  fallbackFavicon: string;
  requestId: string;
  confirmAction: ReactNode;
  rejectAction: ReactNode;
}

function TokenIcon({ symbol, imageUrl }: { symbol: string; imageUrl?: string }) {
  const fallback = (
    <Box
      boxSize="48px"
      borderRadius="full"
      bg="surface.raisedHover"
      display="flex"
      alignItems="center"
      justifyContent="center"
    >
      <Text color="fg.secondary" fontSize="sm" fontWeight="700">
        {symbol.slice(0, 3)}
      </Text>
    </Box>
  );

  if (!imageUrl) return fallback;

  return (
    <Image
      src={imageUrl}
      alt={`${symbol} token`}
      boxSize="48px"
      borderRadius="full"
      objectFit="cover"
      fallback={fallback}
    />
  );
}

function ContextRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ListItem density="compact">
      <Text flex="0 0 72px" color="fg.secondary" fontSize="sm" fontWeight="500">
        {label}
      </Text>
      <ListItemActions flex="1 1 auto" minW={0} maxW="calc(100% - 84px)">
        {children}
      </ListItemActions>
    </ListItem>
  );
}

function OriginIdentity({
  hostname,
  favicon,
  fallbackFavicon,
}: {
  hostname: string;
  favicon: string;
  fallbackFavicon: string;
}) {
  return (
    <HStack spacing={2} minW={0} justify="flex-end">
      <Image
        src={favicon}
        alt=""
        boxSize="20px"
        borderRadius="sm"
        objectFit="contain"
        onError={(event) => {
          if (event.currentTarget.src !== fallbackFavicon) {
            event.currentTarget.src = fallbackFavicon;
          }
        }}
        fallback={<Box boxSize="20px" bg="surface.raisedHover" borderRadius="sm" />}
      />
      <Text color="fg.primary" fontSize="sm" fontWeight="600" overflowWrap="anywhere">
        {hostname}
      </Text>
    </HStack>
  );
}

export function WatchAssetConfirmationScreen({
  symbol,
  address,
  decimals,
  imageUrl,
  chainId,
  chainName,
  explorerUrl,
  originHostname,
  origin,
  originFavicon,
  fallbackFavicon,
  requestId,
  confirmAction,
  rejectAction,
}: WatchAssetConfirmationScreenProps) {
  return (
    <ConfirmationScreen
      title="Add token"
      outcome={
        <OutcomeCard
          label="Requested action"
          outcome={`Add ${symbol} to your wallet`}
          context={
            <Text color="fg.secondary" fontSize="sm" lineHeight="1.45">
              This makes the token visible in WalletChan. It does not verify
              that the token is legitimate.
            </Text>
          }
          media={
            <Box position="relative">
              <TokenIcon symbol={symbol} imageUrl={imageUrl} />
              <Box
                position="absolute"
                right="-5px"
                bottom="-4px"
                p="1px"
                bg="surface.accentTint"
                borderRadius="full"
              >
                <ChainIcon chainId={chainId} chainName={chainName} size="20px" withChip />
              </Box>
            </Box>
          }
        />
      }
      context={
        <VStack align="stretch" spacing={3}>
          <ListSurface>
            <ContextRow label="Requested by">
              <OriginIdentity
                hostname={originHostname}
                favicon={originFavicon}
                fallbackFavicon={fallbackFavicon}
              />
            </ContextRow>
            <ContextRow label="Network">
              <HStack spacing={1.5} justify="flex-end">
                <ChainIcon chainId={chainId} chainName={chainName} size="18px" withChip />
                <Text color="fg.primary" fontSize="sm" fontWeight="600">
                  {chainName}
                </Text>
              </HStack>
            </ContextRow>
            <ContextRow label="Token">
              <Text color="fg.primary" fontSize="sm" fontWeight="700">
                {symbol}
              </Text>
            </ContextRow>
            <ContextRow label="Decimals">
              <Text color="fg.primary" fontFamily="mono" fontSize="sm">
                {decimals}
              </Text>
            </ContextRow>
          </ListSurface>

          <Box>
            <Text mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
              Contract address
            </Text>
            <HStack
              align="flex-start"
              justify="space-between"
              gap={2}
              p={3}
              bg="surface.sunken"
              borderWidth="1px"
              borderColor="border.subtle"
              borderRadius="md"
            >
              <Text
                minW={0}
                color="fg.primary"
                fontFamily="mono"
                fontSize="xs"
                lineHeight="1.5"
                overflowWrap="anywhere"
              >
                {address}
              </Text>
              <HStack spacing={0} flexShrink={0}>
                <CopyButton value={address} />
                {explorerUrl && (
                  <IconButton
                    aria-label="View token contract on explorer"
                    icon={<ExternalLinkIcon />}
                    variant="ghost"
                    size="xs"
                    onClick={() => window.open(`${explorerUrl}/address/${address}`, "_blank")}
                  />
                )}
              </HStack>
            </HStack>
          </Box>
        </VStack>
      }
      contextTitle="Token identity"
      advancedDetails={
        <InlineDisclosure
          label="Advanced token data"
          description="Exact values supplied by the requesting site."
        >
          <VStack align="stretch" spacing={2} pt={2}>
            <Text color="fg.secondary" fontFamily="mono" fontSize="xs" overflowWrap="anywhere">
              chainId: {chainId}
            </Text>
            <Text color="fg.secondary" fontFamily="mono" fontSize="xs" overflowWrap="anywhere">
              origin: {origin}
            </Text>
            <Text color="fg.secondary" fontFamily="mono" fontSize="xs" overflowWrap="anywhere">
              decimals: {decimals}
            </Text>
            {imageUrl && (
              <Text color="fg.secondary" fontFamily="mono" fontSize="xs" overflowWrap="anywhere">
                image: {imageUrl}
              </Text>
            )}
            <Text color="fg.secondary" fontFamily="mono" fontSize="xs" overflowWrap="anywhere">
              requestId: {requestId}
            </Text>
          </VStack>
        </InlineDisclosure>
      }
      confirmAction={confirmAction}
      rejectAction={rejectAction}
    />
  );
}
