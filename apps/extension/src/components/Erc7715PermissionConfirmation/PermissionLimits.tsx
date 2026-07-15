import { WarningTwoIcon } from "@chakra-ui/icons";
import {
  Box,
  HStack,
  Text,
  VStack,
  usePrefersReducedMotion,
} from "@chakra-ui/react";
import { useRef, type ReactNode } from "react";

import type { PendingErc7715PermissionRequest } from "@/chrome/pendingErc7715PermissionStorage";
import TokenLogo from "@/components/TokenLogo";
import { LabeledAddressPopover } from "@/components/shared/LabeledAddressPopover";
import { TokenContractPopover } from "@/components/shared/TokenContractPopover";
import { AssetDeltaRow, InlineDisclosure } from "@/components/ui";
import { shortAddress } from "@/lib/erc7715PermissionDisplay";
import type { PermissionPresentation } from "./permissionPresentation";
import type { Erc7715PermissionAsset } from "./useErc7715PermissionAsset";

export function PermissionLimits({
  permissionRequest,
  presentation,
  asset,
  isNative,
  explorer,
  delegate,
  justification,
  validationError,
  children,
}: {
  permissionRequest: PendingErc7715PermissionRequest;
  presentation: PermissionPresentation;
  asset: Erc7715PermissionAsset;
  isNative: boolean;
  explorer?: string;
  delegate: string;
  justification?: string;
  validationError: string | null;
  children: ReactNode;
}) {
  const disclosureRef = useRef<HTMLDetailsElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const handleEditOpenChange = (open: boolean) => {
    if (!open) return;
    requestAnimationFrame(() => {
      if (!disclosureRef.current?.open) return;
      disclosureRef.current.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });
  };

  return (
    <VStack align="stretch" spacing={4}>
      <Box
        px={3}
        bg="surface.raised"
        borderWidth="1px"
        borderStyle="solid"
        borderColor="border.subtle"
        borderRadius="lg"
        overflow="hidden"
      >
        <VStack
          align="stretch"
          spacing={0.5}
          py={3}
          borderBottomWidth="1px"
          borderBottomStyle="solid"
          borderBottomColor="border.subtle"
        >
          <Text color="fg.muted" fontSize="xs" fontWeight="600">
            Reason from dapp
          </Text>
          <Text
            color={justification ? "fg.primary" : "fg.muted"}
            fontSize="sm"
            fontStyle={justification ? "normal" : "italic"}
            whiteSpace="pre-wrap"
            overflowWrap="anywhere"
          >
            {justification || "No reason provided"}
          </Text>
        </VStack>
        <AssetDeltaRow
          direction="neutral"
          directionLabel={presentation.limitLabel}
          showDirectionIcon={false}
          amountColor="fg.primary"
          asset={
            !presentation.isRevocation && !isNative && asset.tokenAddress ? (
              <TokenContractPopover
                address={asset.tokenAddress}
                explorer={explorer}
                symbol={asset.symbol}
                triggerColor="fg.primary"
              >
                {presentation.assetLabel}
              </TokenContractPopover>
            ) : (
              presentation.assetLabel
            )
          }
          amount={presentation.amountLabel}
          fiat={presentation.fiatEstimate}
          meta={presentation.exposureMeta}
          metaFullWidth
          metaTextAlign="right"
          media={
            presentation.isRevocation ? undefined : (
              <TokenLogo
                symbol={asset.symbol}
                logoUrl={asset.logoUrl}
                nativeChainId={isNative ? permissionRequest.chainId : undefined}
                size="36px"
              />
            )
          }
        />
        {!presentation.isRevocation && (
          <HStack justify="space-between" spacing={3} py={3}>
            <VStack align="stretch" spacing={0.5} minW={0}>
              <Text color="fg.muted" fontSize="xs" fontWeight="600">
                Available balance
              </Text>
              <Text
                color="fg.secondary"
                fontSize="sm"
                fontWeight="600"
                sx={{ fontVariantNumeric: "tabular-nums" }}
              >
                {asset.balanceLabel}
              </Text>
            </VStack>
            <VStack align="end" spacing={0.5} minW={0}>
              {asset.balanceUsdLabel && (
                <Text
                  color="fg.muted"
                  fontSize="xs"
                  sx={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {asset.balanceUsdLabel}
                </Text>
              )}
            </VStack>
          </HStack>
        )}
        <HStack
          justify="space-between"
          spacing={3}
          py={3}
          borderTopWidth={presentation.isRevocation ? 0 : "1px"}
          borderTopStyle="solid"
          borderTopColor="border.subtle"
        >
          <Text color="fg.muted" fontSize="xs" fontWeight="600">
            Delegate
          </Text>
          <LabeledAddressPopover
            address={delegate}
            contextLabel="delegate"
            explorer={explorer}
            label={shortAddress(delegate)}
          />
        </HStack>
      </Box>

      <InlineDisclosure
        ref={disclosureRef}
        label="Edit Parameters"
        onOpenChange={handleEditOpenChange}
      >
        <VStack align="stretch" spacing={4} pt={2}>
          {children}

          {validationError && (
            <HStack
              role="alert"
              align="flex-start"
              spacing={2}
              bg="status.error.bg"
              color="status.error.fg"
              borderWidth="1px"
              borderStyle="solid"
              borderColor="status.error.border"
              borderRadius="md"
              px={3}
              py={2.5}
            >
              <WarningTwoIcon boxSize="14px" mt="2px" flexShrink={0} />
              <Text fontSize="xs" fontWeight="600" lineHeight="1.45">
                {validationError}
              </Text>
            </HStack>
          )}
        </VStack>
      </InlineDisclosure>
    </VStack>
  );
}
