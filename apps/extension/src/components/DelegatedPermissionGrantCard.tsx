import {
  Box,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";

import type { Erc7715PermissionGrant } from "@/chrome/pendingErc7715PermissionStorage";
import type { Account } from "@/chrome/types";
import { AccountAvatar } from "@/components/AccountIdentity";
import ChainIcon from "@/components/ChainIcon";
import { TrashIcon } from "@/components/Settings/icons";
import TokenLogo from "@/components/TokenLogo";
import {
  ZERO_ADDRESS,
  formatDateTime,
  formatGrantAmount,
  permissionTitle,
  shortAddress,
  tokenAddressFromGrant,
} from "@/lib/erc7715PermissionDisplay";
import {
  isErc7715NativePermissionType,
  isErc7715TokenApprovalRevocationPermissionType,
} from "@/lib/erc7715PermissionEditing";
import type { TokenDisplayMetadata } from "@/lib/tokenMetadataClient";
import { AddressActions as SharedAddressActions } from "@/components/shared/LabeledAddressPopover";
import { useAddressContact } from "@/hooks/useAddressContacts";

function AddressActions({
  address,
  explorer,
  label,
  showAddress = true,
}: {
  address: string;
  explorer?: string;
  label: string;
  showAddress?: boolean;
}) {
  return <SharedAddressActions address={address} explorer={explorer} contextLabel={label} compact showAddress={showAddress} />;
}

function DelegateIdentity({
  address,
  account,
  resolvedName,
  resolvedAvatar,
  explorer,
}: {
  address: string;
  account?: Account;
  resolvedName: string | null;
  resolvedAvatar: string | null;
  explorer?: string;
}) {
  const { contact } = useAddressContact(address);
  if (!account) {
    return <AddressActions address={address} explorer={explorer} label="delegate" />;
  }

  const displayName = contact?.label || account.displayName || resolvedName || shortAddress(address);

  return (
    <HStack
      spacing={1.5}
      flex="1"
      minW={0}
      justify="flex-end"
      align="center"
    >
      <Box flexShrink={0}>
        <AccountAvatar account={account} ensAvatar={resolvedAvatar} size={24} />
      </Box>
      <VStack
        flex="0 1 auto"
        w="fit-content"
        minW={0}
        maxW="140px"
        spacing={0}
        align="flex-end"
      >
        <Text
          w="full"
          fontSize="sm"
          color="text.primary"
          fontWeight="600"
          lineHeight="1.2"
          textAlign="right"
          whiteSpace="nowrap"
          overflow="hidden"
          textOverflow="ellipsis"
        >
          {displayName}
        </Text>
        <Text
          w="full"
          fontSize="xs"
          fontFamily="mono"
          color="text.secondary"
          lineHeight="1.25"
          textAlign="right"
          whiteSpace="nowrap"
        >
          {shortAddress(address)}
        </Text>
      </VStack>
      <AddressActions
        address={address}
        explorer={explorer}
        label="delegate"
        showAddress={false}
      />
    </HStack>
  );
}

export default function DelegatedPermissionGrantCard({
  grant,
  chainName,
  explorer,
  nativeSymbol,
  tokenMetadata,
  delegateAccount,
  delegateName,
  delegateAvatar,
  onRevoke,
  hasDivider = false,
}: {
  grant: Erc7715PermissionGrant;
  chainName: string;
  explorer?: string;
  nativeSymbol: string;
  tokenMetadata: TokenDisplayMetadata | null | undefined;
  delegateAccount?: Account;
  delegateName: string | null;
  delegateAvatar: string | null;
  onRevoke: () => void;
  hasDivider?: boolean;
}) {
  const tokenAddress = tokenAddressFromGrant(grant);
  const formattedAmount = formatGrantAmount(grant, tokenMetadata, nativeSymbol);
  const isNative = isErc7715NativePermissionType(grant.permissionType);
  const isApprovalRevocation =
    isErc7715TokenApprovalRevocationPermissionType(grant.permissionType);
  const tokenSymbol = isNative ? nativeSymbol : tokenMetadata?.symbol || null;
  const symbolOffset = tokenSymbol
    ? formattedAmount.indexOf(` ${tokenSymbol}`)
    : -1;
  const showTokenLogo =
    !isApprovalRevocation &&
    symbolOffset > 0 &&
    (isNative || !!tokenMetadata?.logoUrl);

  return (
    <Box
      px={4}
      py={3.5}
      borderTopWidth={hasDivider ? "1px" : "0"}
      borderTopStyle="solid"
      borderTopColor="border.default"
    >
      <VStack spacing={3} align="stretch">
        <HStack justify="space-between" align="start" spacing={3}>
          <VStack spacing={0.5} align="start" minW={0}>
            <Text fontSize="sm" color="text.primary" fontWeight="700">
              {permissionTitle(grant.permissionType)}
            </Text>
            {showTokenLogo ? (
              <HStack spacing={1.5} minW={0}>
                <Text fontSize="md" color="text.primary" fontWeight="700">
                  {formattedAmount.slice(0, symbolOffset)}
                </Text>
                <TokenLogo
                  symbol={tokenSymbol}
                  logoUrl={tokenMetadata?.logoUrl}
                  nativeChainId={isNative ? grant.chainId : undefined}
                  size="20px"
                />
                <Text fontSize="md" color="text.primary" fontWeight="700">
                  {formattedAmount.slice(symbolOffset + 1)}
                </Text>
              </HStack>
            ) : (
              <Text fontSize="md" color="text.primary" fontWeight="700">
                {formattedAmount}
              </Text>
            )}
          </VStack>
          <HStack spacing={1} flexShrink={0}>
            <HStack spacing={1.5} color="text.secondary">
              <ChainIcon
                chainId={grant.chainId}
                chainName={chainName}
                size="20px"
                withChip
              />
              <Text fontSize="xs" fontWeight="600">
                {chainName}
              </Text>
            </HStack>
            <IconButton
              aria-label="Revoke delegated permission"
              icon={<TrashIcon boxSize="17px" />}
              size="sm"
              variant="ghost"
              color="text.tertiary"
              onClick={onRevoke}
              _hover={{ color: "chart.negative", bg: "status.error.bg" }}
            />
          </HStack>
        </HStack>

        <VStack spacing={1.5} align="stretch">
          <HStack
            justify="space-between"
            align="center"
            spacing={3}
            minW={0}
          >
            <Text
              fontSize="xs"
              color="text.tertiary"
              fontWeight="600"
              flexShrink={0}
            >
            Delegate
            </Text>
            <DelegateIdentity
              address={grant.request.to}
              account={delegateAccount}
              resolvedName={delegateName}
              resolvedAvatar={delegateAvatar}
              explorer={explorer}
            />
          </HStack>

          {tokenAddress && tokenAddress !== ZERO_ADDRESS && (
            <HStack justify="space-between" spacing={3} minW={0}>
              <Text
                fontSize="xs"
                color="text.tertiary"
                fontWeight="600"
                flexShrink={0}
              >
                Token contract
              </Text>
              <AddressActions
                address={tokenAddress}
                explorer={explorer}
                label="token"
              />
            </HStack>
          )}

          <HStack justify="space-between" spacing={3}>
            <Text fontSize="xs" color="text.tertiary" fontWeight="600">
              Expires
            </Text>
            <Text
              fontSize="xs"
              color="text.secondary"
              fontWeight="600"
              textAlign="right"
            >
              {formatDateTime(grant.expiresAt)}
            </Text>
          </HStack>
        </VStack>
      </VStack>
    </Box>
  );
}
