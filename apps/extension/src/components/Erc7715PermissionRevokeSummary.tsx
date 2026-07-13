import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Box,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ExternalLinkIcon, InfoOutlineIcon } from "@chakra-ui/icons";
import { formatUnits } from "viem";

import type { Erc7715PermissionRevokeMeta } from "@/chrome/pendingTxStorage";
import { CopyButton } from "@/components/CopyButton";
import TokenLogo from "@/components/TokenLogo";
import {
  formatDateTime,
  permissionTitle,
  shortAddress,
  ZERO_ADDRESS,
} from "@/lib/erc7715PermissionDisplay";
import {
  isErc7715NativePermissionType,
  isErc7715PeriodicPermissionType,
  isErc7715StreamPermissionType,
  isErc7715TokenApprovalRevocationPermissionType,
} from "@/lib/erc7715PermissionEditing";
import { approvalRevocationMethodLabelsFromFields } from "@/lib/erc7715ApprovalRevocation";
import {
  resolveTokenMetadataClient,
  type TokenDisplayMetadata,
} from "@/lib/tokenMetadataClient";
import { useTheme } from "@/theme";

function compactDecimal(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const compactFraction = fraction.slice(0, 6).replace(/0+$/u, "");
  return compactFraction ? `${whole}.${compactFraction}` : whole;
}

function frequencyLabel(seconds: number | undefined): string | null {
  switch (seconds) {
    case 60 * 60:
      return "hour";
    case 24 * 60 * 60:
      return "day";
    case 7 * 24 * 60 * 60:
      return "week";
    case 14 * 24 * 60 * 60:
      return "2 weeks";
    case 30 * 24 * 60 * 60:
      return "month";
    case 365 * 24 * 60 * 60:
      return "year";
    default:
      return seconds ? `${seconds}s` : null;
  }
}

function isValidAddress(value: string | undefined): value is `0x${string}` {
  return !!value && /^0x[0-9a-fA-F]{40}$/u.test(value);
}

function RevokeAddressRow({
  label,
  address,
  explorer,
}: {
  label: string;
  address: string;
  explorer?: string;
}) {
  const explorerUrl =
    explorer && isValidAddress(address)
      ? `${explorer.replace(/\/+$/u, "")}/address/${address}`
      : null;

  return (
    <HStack justify="space-between" spacing={3}>
      <Text fontSize="xs" color="text.secondary" fontWeight="800">
        {label}
      </Text>
      <HStack spacing={1.5} minW={0}>
        <Text
          fontSize="xs"
          color="text.primary"
          fontFamily="mono"
          fontWeight="800"
          isTruncated
        >
          {shortAddress(address)}
        </Text>
        <CopyButton value={address} />
        {explorerUrl && (
          <IconButton
            aria-label={`View ${label.toLowerCase()} on explorer`}
            icon={<ExternalLinkIcon boxSize="11px" />}
            size="xs"
            variant="ghost"
            color="text.secondary"
            onClick={() => window.open(explorerUrl, "_blank", "noopener,noreferrer")}
            _hover={{ color: "accent.secondary", bg: "bg.muted" }}
          />
        )}
      </HStack>
    </HStack>
  );
}

function formatAmount({
  meta,
  metadata,
  nativeSymbol,
  isNative,
}: {
  meta: Erc7715PermissionRevokeMeta;
  metadata: TokenDisplayMetadata | null;
  nativeSymbol: string;
  isNative: boolean;
}): string | null {
  if (!meta.amount) return null;

  try {
    const raw = BigInt(meta.amount);
    const decimals = isNative ? 18 : metadata?.decimals;
    const symbol = isNative ? nativeSymbol : metadata?.symbol || "tokens";
    if (typeof decimals !== "number") return `${raw.toString()} base units`;

    const amount = `${compactDecimal(formatUnits(raw, decimals))} ${symbol}`;
    const shouldShowFrequency =
      isErc7715PeriodicPermissionType(meta.permissionType || "") ||
      isErc7715StreamPermissionType(meta.permissionType || "");
    if (!shouldShowFrequency) {
      return amount;
    }

    const frequency = frequencyLabel(meta.periodDuration);
    return frequency ? `${amount} / ${frequency}` : amount;
  } catch {
    return null;
  }
}

export default function Erc7715PermissionRevokeSummary({
  meta,
  chainId,
  chainName,
  explorer,
  nativeSymbol,
}: {
  meta: Erc7715PermissionRevokeMeta;
  chainId: number;
  chainName: string;
  explorer?: string;
  nativeSymbol: string;
}) {
  const { tokens } = useTheme();
  const [metadata, setMetadata] = useState<TokenDisplayMetadata | null>(null);
  const isNative = isErc7715NativePermissionType(meta.permissionType || "");
  const tokenAddress =
    meta.tokenAddress && meta.tokenAddress.toLowerCase() !== ZERO_ADDRESS
      ? meta.tokenAddress
      : null;

  useEffect(() => {
    let cancelled = false;
    setMetadata(null);

    const lookupAddress = isNative ? "native" : tokenAddress;
    if (!lookupAddress) return;

    resolveTokenMetadataClient(chainId, lookupAddress).then((next) => {
      if (!cancelled) setMetadata(next);
    });

    return () => {
      cancelled = true;
    };
  }, [chainId, isNative, tokenAddress]);

  const amountLabel = useMemo(
    () => formatAmount({ meta, metadata, nativeSymbol, isNative }),
    [isNative, meta, metadata, nativeSymbol],
  );
  const revocationMethodLabels = useMemo(
    () =>
      approvalRevocationMethodLabelsFromFields(
        meta.approvalRevocationMethods || [],
      ),
    [meta.approvalRevocationMethods],
  );
  const expiresLabel =
    meta.expiresAt === undefined ? "Unknown" : formatDateTime(meta.expiresAt);
  const tokenSymbol = isNative
    ? nativeSymbol
    : metadata?.symbol || (tokenAddress ? "ERC-20" : "Token");
  const tokenName = isNative ? "Native asset" : metadata?.name || "ERC-20 token";
  const tokenExplorerUrl =
    tokenAddress && explorer
      ? `${explorer.replace(/\/+$/u, "")}/address/${tokenAddress}`
      : null;

  return (
    <Box
      bg="surface.raised"
      border={tokens.borders.thin}
      borderColor="border.default"
      borderRadius={tokens.radii.card}
      boxShadow="card"
      overflow="hidden"
    >
      <Box
        px={3}
        py={2.5}
        bg="status.info.bg"
        borderBottom={tokens.borders.thin}
        borderColor="status.info.border"
      >
        <HStack spacing={2.5} align="flex-start">
          <InfoOutlineIcon color="status.info.fg" mt={0.5} flexShrink={0} />
          <VStack spacing={0.5} align="stretch">
            <Text
              fontSize="sm"
              color="status.info.fg"
              fontWeight="900"
              lineHeight="short"
            >
              Revoke delegated permission
            </Text>
            <Text
              fontSize="xs"
              color="status.info.fg"
              fontWeight="600"
              lineHeight="short"
            >
              Disables this delegated permission onchain. Once confirmed, the
              delegate can no longer act with it.
            </Text>
          </VStack>
        </HStack>
      </Box>

      <VStack spacing={3} align="stretch" p={3}>
        <HStack justify="space-between" align="center">
          <Badge
            bg="accent.secondary"
            color="accentFg.secondary"
            borderRadius={tokens.radii.badge}
            px={2}
            py={0.5}
          >
            {permissionTitle(meta.permissionType || "delegated-permission")}
          </Badge>
          <Text fontSize="xs" color="text.secondary" fontWeight="800">
            {chainName}
          </Text>
        </HStack>

        {meta.origin && (
          <HStack justify="space-between" spacing={3}>
            <Text fontSize="xs" color="text.secondary" fontWeight="800">
              Requested by
            </Text>
            <Text
              fontSize="xs"
              color="text.primary"
              fontWeight="800"
              textAlign="right"
              noOfLines={1}
            >
              {meta.origin}
            </Text>
          </HStack>
        )}

        {meta.delegate && (
          <RevokeAddressRow
            label="Delegate"
            address={meta.delegate}
            explorer={explorer}
          />
        )}

        {(isNative || tokenAddress || amountLabel) && (
          <Box
            p={2.5}
            bg="surface.sunken"
            border={tokens.borders.thin}
            borderColor="border.subtle"
            borderRadius={tokens.radii.card}
          >
            <HStack spacing={2.5} justify="space-between" align="center">
              <HStack spacing={2.5} minW={0}>
                <TokenLogo
                  symbol={tokenSymbol}
                  logoUrl={metadata?.logoUrl}
                  nativeChainId={isNative ? chainId : undefined}
                  size="28px"
                  fontSize="10px"
                />
                <VStack spacing={0} align="start" minW={0}>
                  <HStack spacing={1.5} minW={0}>
                    <Text
                      fontSize="sm"
                      color="text.primary"
                      fontWeight="900"
                      noOfLines={1}
                    >
                      {tokenSymbol}
                    </Text>
                    {tokenExplorerUrl && (
                      <IconButton
                        aria-label="View token on explorer"
                        icon={<ExternalLinkIcon boxSize="11px" />}
                        size="xs"
                        variant="ghost"
                        color="text.secondary"
                        onClick={() => window.open(tokenExplorerUrl, "_blank", "noopener,noreferrer")}
                        _hover={{ color: "accent.secondary", bg: "bg.muted" }}
                      />
                    )}
                  </HStack>
                  <Text
                    fontSize="xs"
                    color="text.secondary"
                    fontWeight="700"
                    noOfLines={1}
                  >
                    {tokenName}
                  </Text>
                  {!isNative && tokenAddress && (
                    <HStack spacing={1}>
                      <Text
                        fontSize="2xs"
                        color="text.tertiary"
                        fontFamily="mono"
                      >
                        {shortAddress(tokenAddress)}
                      </Text>
                      <CopyButton value={tokenAddress} />
                    </HStack>
                  )}
                </VStack>
              </HStack>
              {amountLabel && (
                <Text
                  fontSize="xs"
                  color="text.primary"
                  fontWeight="900"
                  textAlign="right"
                >
                  {amountLabel}
                </Text>
              )}
            </HStack>
          </Box>
        )}

        {isErc7715TokenApprovalRevocationPermissionType(
          meta.permissionType || "",
        ) &&
          revocationMethodLabels.length > 0 && (
            <Box
              p={2.5}
              bg="surface.sunken"
              border={tokens.borders.thin}
              borderColor="border.subtle"
              borderRadius={tokens.radii.card}
            >
              <VStack spacing={1.5} align="stretch">
                <Text fontSize="xs" color="text.secondary" fontWeight="800">
                  Revocation methods
                </Text>
                {revocationMethodLabels.map((label) => (
                  <Text
                    key={label}
                    fontSize="xs"
                    color="text.primary"
                    fontWeight="900"
                  >
                    {label}
                  </Text>
                ))}
              </VStack>
            </Box>
          )}

        <HStack justify="space-between" spacing={3}>
          <Text fontSize="xs" color="text.secondary" fontWeight="800">
            Expires
          </Text>
          <Text
            fontSize="xs"
            color="text.primary"
            fontWeight="800"
            textAlign="right"
          >
            {expiresLabel}
          </Text>
        </HStack>
      </VStack>
    </Box>
  );
}
