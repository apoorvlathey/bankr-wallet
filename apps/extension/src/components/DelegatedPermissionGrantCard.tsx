import {
  Badge,
  Box,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { DeleteIcon, ExternalLinkIcon } from "@chakra-ui/icons";

import type { Erc7715PermissionGrant } from "@/chrome/pendingErc7715PermissionStorage";
import ChainIcon from "@/components/ChainIcon";
import { CopyButton } from "@/components/CopyButton";
import {
  ZERO_ADDRESS,
  formatDateTime,
  formatGrantAmount,
  permissionTitle,
  shortAddress,
  tokenAddressFromGrant,
} from "@/lib/erc7715PermissionDisplay";
import type { TokenDisplayMetadata } from "@/lib/tokenMetadataClient";
import { useTheme } from "@/theme";

function AddressActions({
  address,
  explorer,
  label,
}: {
  address: string;
  explorer?: string;
  label: string;
}) {
  const explorerUrl = explorer
    ? `${explorer.replace(/\/+$/u, "")}/address/${address}`
    : null;

  return (
    <HStack spacing={1}>
      <Text fontSize="2xs" fontFamily="mono" color="text.secondary">
        {shortAddress(address)}
      </Text>
      <CopyButton value={address} />
      {explorerUrl && (
        <IconButton
          aria-label={`View ${label} on explorer`}
          icon={<ExternalLinkIcon boxSize="11px" />}
          size="xs"
          variant="ghost"
          color="text.secondary"
          onClick={() => chrome.tabs.create({ url: explorerUrl })}
          _hover={{ color: "accent.secondary", bg: "bg.muted" }}
        />
      )}
    </HStack>
  );
}

export default function DelegatedPermissionGrantCard({
  grant,
  chainName,
  explorer,
  nativeSymbol,
  tokenMetadata,
  onRevoke,
}: {
  grant: Erc7715PermissionGrant;
  chainName: string;
  explorer?: string;
  nativeSymbol: string;
  tokenMetadata: TokenDisplayMetadata | null | undefined;
  onRevoke: () => void;
}) {
  const { tokens } = useTheme();
  const tokenAddress = tokenAddressFromGrant(grant);

  return (
    <Box
      p={3}
      bg="surface.raised"
      border={tokens.borders.thin}
      borderColor="border.subtle"
      borderRadius={tokens.radii.card}
    >
      <VStack spacing={2} align="stretch">
        <HStack justify="space-between" align="start">
          <VStack spacing={1} align="start" minW={0}>
            <HStack spacing={2}>
              <Badge
                bg="accent.secondary"
                color="accentFg.secondary"
                borderRadius={tokens.radii.badge}
              >
                {permissionTitle(grant.permissionType)}
              </Badge>
              <HStack spacing={1}>
                <ChainIcon
                  chainId={grant.chainId}
                  chainName={chainName}
                  size="16px"
                  withChip
                />
                <Text
                  fontSize="2xs"
                  color="text.secondary"
                  fontWeight="800"
                >
                  {chainName}
                </Text>
              </HStack>
            </HStack>
            <Text fontSize="sm" color="text.primary" fontWeight="900">
              {formatGrantAmount(grant, tokenMetadata, nativeSymbol)}
            </Text>
          </VStack>
          <IconButton
            aria-label="Revoke delegated permission"
            icon={<DeleteIcon />}
            size="xs"
            variant="ghost"
            color="chart.negative"
            onClick={onRevoke}
          />
        </HStack>

        <HStack justify="space-between" spacing={2}>
          <Text fontSize="2xs" color="text.secondary" fontWeight="800">
            Delegate
          </Text>
          <AddressActions
            address={grant.request.to}
            explorer={explorer}
            label="delegate"
          />
        </HStack>

        {tokenAddress && tokenAddress !== ZERO_ADDRESS && (
          <HStack justify="space-between" spacing={2}>
            <Text fontSize="2xs" color="text.secondary" fontWeight="800">
              Token
            </Text>
            <AddressActions
              address={tokenAddress}
              explorer={explorer}
              label="token"
            />
          </HStack>
        )}

        <HStack justify="space-between">
          <Text fontSize="2xs" color="text.secondary" fontWeight="800">
            Expires
          </Text>
          <Text
            fontSize="2xs"
            color="text.primary"
            fontWeight="800"
            textAlign="right"
          >
            {formatDateTime(grant.expiresAt)}
          </Text>
        </HStack>
      </VStack>
    </Box>
  );
}
