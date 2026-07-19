import { Box, HStack, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";

import type { Erc7715PermissionRevokeMeta } from "@/chrome/requests/pendingTxStorage";
import TokenLogo from "@/components/TokenLogo";
import { AddressParam } from "@/components/decodedParams/AddressParam";
import { TokenContractPopover } from "@/components/shared/TokenContractPopover";
import { useDappOriginFormatter } from "@/hooks/useDappOriginDisplay";
import { permissionTitle } from "@/lib/erc7715PermissionDisplay";
import type { TokenDisplayMetadata } from "@/lib/tokenMetadataClient";

function SummaryRow({
  label,
  children,
  divider = true,
}: {
  label: string;
  children: ReactNode;
  divider?: boolean;
}) {
  return (
    <HStack
      minH="48px"
      px={3}
      py={2.5}
      spacing={3}
      justify="space-between"
      borderTopWidth={divider ? "1px" : 0}
      borderTopStyle="solid"
      borderTopColor="border.subtle"
    >
      <Text color="fg.secondary" fontSize="xs" fontWeight="600" flexShrink={0}>
        {label}
      </Text>
      <Box minW={0} textAlign="right">
        {children}
      </Box>
    </HStack>
  );
}

function requestingSiteLabel(origin: string): string {
  try {
    return new URL(origin).host || origin;
  } catch {
    return origin;
  }
}

export default function Erc7715RevokeReceipt({
  meta,
  chainId,
  explorer,
  metadata,
  isNative,
  tokenAddress,
  tokenSymbol,
  tokenName,
  amountLabel,
  expiresLabel,
  revocationMethodLabels,
}: {
  meta: Erc7715PermissionRevokeMeta;
  chainId: number;
  explorer?: string;
  metadata: TokenDisplayMetadata | null;
  isNative: boolean;
  tokenAddress: string | null;
  tokenSymbol: string;
  tokenName: string;
  amountLabel: string | null;
  expiresLabel: string;
  revocationMethodLabels: string[];
}) {
  const formatOrigin = useDappOriginFormatter();
  const tokenLogo = (
    <TokenLogo
      symbol={tokenSymbol}
      logoUrl={metadata?.logoUrl}
      nativeChainId={isNative ? chainId : undefined}
      size="24px"
      fontSize="8px"
    />
  );

  return (
    <Box
      bg="surface.raised"
      border="1px solid"
      borderColor="border.default"
      borderRadius="lg"
      overflow="hidden"
    >
      <VStack align="stretch" spacing={0}>
        <SummaryRow label="Action" divider={false}>
          <Text
            color="fg.primary"
            fontSize="md"
            fontWeight="700"
            lineHeight="short"
            textAlign="right"
            overflowWrap="anywhere"
          >
            Revoke delegated permission
          </Text>
        </SummaryRow>

        <SummaryRow label="Permission">
          <Text color="fg.primary" fontSize="sm" fontWeight="700">
            {permissionTitle(meta.permissionType || "delegated-permission")}
          </Text>
        </SummaryRow>

        {meta.origin && (
          <SummaryRow label="Requested by">
            <Text
              color="fg.primary"
              fontSize="xs"
              fontWeight="700"
              overflowWrap="anywhere"
            >
              {formatOrigin(meta.origin).resolvedName ||
                requestingSiteLabel(meta.origin)}
            </Text>
          </SummaryRow>
        )}

        {meta.delegate && (
          <SummaryRow label="Delegate">
            <AddressParam
              value={meta.delegate}
              chainId={chainId}
              contextLabel="permission delegate"
            />
          </SummaryRow>
        )}

        {(isNative || tokenAddress || amountLabel) && (
          <SummaryRow label="Asset">
            <HStack spacing={2} justify="flex-end" minW={0}>
              {tokenAddress ? (
                <TokenContractPopover
                  address={tokenAddress}
                  explorer={explorer}
                  symbol={tokenSymbol}
                  triggerColor="fg.primary"
                >
                  {tokenLogo}
                </TokenContractPopover>
              ) : (
                tokenLogo
              )}
              <VStack spacing={0} align="flex-end" minW={0}>
                <Text color="fg.primary" fontSize="sm" fontWeight="700">
                  {tokenSymbol}
                </Text>
                <Text
                  color="fg.secondary"
                  fontSize="2xs"
                  fontWeight="600"
                  noOfLines={1}
                >
                  {tokenName}
                </Text>
              </VStack>
            </HStack>
          </SummaryRow>
        )}

        {amountLabel && (
          <SummaryRow label="Limit">
            <Text
              color="fg.primary"
              fontSize="sm"
              fontWeight="700"
              sx={{ fontVariantNumeric: "tabular-nums" }}
            >
              {amountLabel}
            </Text>
          </SummaryRow>
        )}

        {revocationMethodLabels.length > 0 && (
          <SummaryRow label="Methods">
            <Text
              color="fg.primary"
              fontSize="xs"
              fontWeight="700"
              textAlign="right"
              overflowWrap="anywhere"
            >
              {revocationMethodLabels.join(", ")}
            </Text>
          </SummaryRow>
        )}

        <SummaryRow label="Expires">
          <Text
            color="fg.primary"
            fontSize="xs"
            fontWeight="700"
            textAlign="right"
          >
            {expiresLabel}
          </Text>
        </SummaryRow>
      </VStack>
    </Box>
  );
}
