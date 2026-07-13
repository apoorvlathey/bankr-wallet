import { memo, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Badge,
  Box,
  Code,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";

import { CopyButton } from "@/components/CopyButton";
import { getEthShLabels } from "@/lib/ethShLabelsCache";
import {
  formatHexByteLength,
  isRootAuthority,
  normalizeErc7710Delegation,
  type Erc7710Caveat,
  type Erc7710DelegationTypedData,
} from "@/lib/erc7710Delegation";
import { getResolvedChainById } from "@/lib/chains";
import { useNetworks } from "@/contexts/NetworksContext";
import { useTheme } from "@/theme";

interface Erc7710DelegationDisplayProps {
  typedData: Erc7710DelegationTypedData;
  chainId: number;
}

function truncateHex(value: string, head = 10, tail = 8): string {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function AddressValue({
  address,
  chainId,
}: {
  address: string;
  chainId: number;
}) {
  const { networksInfo } = useNetworks();
  const [label, setLabel] = useState<string | null>(null);
  const resolvedChain = getResolvedChainById(chainId, networksInfo);
  const explorerUrl = resolvedChain?.explorer
    ? `${resolvedChain.explorer.replace(/\/+$/, "")}/address/${address}`
    : null;

  useEffect(() => {
    let cancelled = false;
    getEthShLabels(address, chainId).then((labels) => {
      if (!cancelled) setLabel(labels[0] || null);
    });
    return () => {
      cancelled = true;
    };
  }, [address, chainId]);

  return (
    <VStack align="end" spacing={0.5} minW={0}>
      <HStack spacing={1} justify="flex-end" maxW="full">
        <Text
          fontSize="xs"
          fontFamily="mono"
          color="accent.secondary"
          fontWeight="700"
          noOfLines={1}
        >
          {truncateHex(address, 6, 4)}
        </Text>
        <CopyButton value={address} />
        {explorerUrl && (
          <IconButton
            aria-label="View on explorer"
            icon={<ExternalLinkIcon boxSize="10px" />}
            size="xs"
            variant="ghost"
            color="text.secondary"
            onClick={() => window.open(explorerUrl, "_blank", "noopener,noreferrer")}
            _hover={{ color: "accent.secondary", bg: "bg.muted" }}
          />
        )}
      </HStack>
      {label && (
        <Text
          fontSize="10px"
          color="fg.secondary"
          fontWeight="700"
          textAlign="right"
          noOfLines={2}
        >
          {label}
        </Text>
      )}
    </VStack>
  );
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <HStack align="start" justify="space-between" spacing={3} w="full">
      <Text
        fontSize="xs"
        color="fg.secondary"
        fontWeight="700"
        textTransform="uppercase"
        flexShrink={0}
        pt={1}
      >
        {label}
      </Text>
      <Box flex="1" minW={0} textAlign="right">
        {children}
      </Box>
    </HStack>
  );
}

function HexValue({
  value,
  helper,
}: {
  value: string;
  helper?: string;
}) {
  return (
    <VStack align="end" spacing={0.5}>
      <HStack spacing={1} justify="flex-end" maxW="full">
        <Text
          fontSize="xs"
          fontFamily="mono"
          color="fg.primary"
          fontWeight="700"
          wordBreak="break-all"
        >
          {truncateHex(value)}
        </Text>
        <CopyButton value={value} />
      </HStack>
      {helper && (
        <Text fontSize="10px" color="fg.muted" fontWeight="600">
          {helper}
        </Text>
      )}
    </VStack>
  );
}

function CaveatCard({
  caveat,
  index,
  chainId,
}: {
  caveat: Erc7710Caveat;
  index: number;
  chainId: number;
}) {
  const { tokens } = useTheme();

  return (
    <Box
      border={tokens.borders.thin}
      borderColor="border.default"
      borderRadius="md"
      bg="surface.raised"
      p={2.5}
    >
      <VStack align="stretch" spacing={2}>
        <HStack justify="space-between">
          <Badge
            bg="accent.secondary"
            color="accentFg.secondary"
            border={tokens.borders.thin}
            borderColor="border.default"
            fontWeight="800"
          >
            Caveat {index + 1}
          </Badge>
          <Text fontSize="10px" color="fg.muted" fontWeight="700">
            {formatHexByteLength(caveat.terms)}
          </Text>
        </HStack>
        <InfoRow label="Enforcer">
          <AddressValue address={caveat.enforcer} chainId={chainId} />
        </InfoRow>
        <InfoRow label="Terms">
          <HexValue value={caveat.terms} helper={formatHexByteLength(caveat.terms)} />
        </InfoRow>
        {caveat.args !== "0x" && (
          <InfoRow label="Args">
            <HexValue value={caveat.args} helper={formatHexByteLength(caveat.args)} />
          </InfoRow>
        )}
      </VStack>
    </Box>
  );
}

function Erc7710DelegationDisplay({
  typedData,
  chainId,
}: Erc7710DelegationDisplayProps) {
  const { tokens } = useTheme();
  const delegation = useMemo(
    () => normalizeErc7710Delegation(typedData),
    [typedData],
  );
  const manager =
    typeof typedData.domain?.verifyingContract === "string"
      ? typedData.domain.verifyingContract
      : null;
  const root = isRootAuthority(delegation.authority);

  return (
    <Box
      bg="surface.accentTint"
      border={tokens.borders.thin}
      borderColor="border.default"
      borderRadius="lg"
      boxShadow="card"
      p={3}
    >
      <VStack align="stretch" spacing={3}>
        <HStack align="start" justify="space-between" spacing={3}>
          <VStack align="start" spacing={0.5} flex="1" minW={0}>
            <Text fontSize="md" color="fg.primary" fontWeight="900" lineHeight="1.2">
              Create ERC-7710 delegation
            </Text>
            <Text fontSize="xs" color="fg.secondary" fontWeight="700">
              Delegate receives authority from delegator
            </Text>
          </VStack>
          <Badge
            bg={delegation.caveats.length > 0 ? "status.success.bg" : "status.warning.bg"}
            color={delegation.caveats.length > 0 ? "status.success.fg" : "status.warning.fg"}
            border={tokens.borders.thin}
            borderColor={
              delegation.caveats.length > 0
                ? "status.success.border"
                : "status.warning.border"
            }
            flexShrink={0}
          >
            {delegation.caveats.length} caveat{delegation.caveats.length === 1 ? "" : "s"}
          </Badge>
        </HStack>

        {delegation.caveats.length === 0 && (
          <Box
            bg="status.warning.bg"
            border={tokens.borders.thin}
            borderColor="status.warning.border"
            borderRadius="md"
            p={2.5}
          >
            <Text fontSize="xs" color="status.warning.fg" fontWeight="800">
              No caveats. The delegate may redeem any action accepted by this delegation manager.
            </Text>
          </Box>
        )}

        <VStack align="stretch" spacing={2}>
          <InfoRow label="Delegate">
            <AddressValue address={delegation.delegate} chainId={chainId} />
          </InfoRow>
          <InfoRow label="Delegator">
            <AddressValue address={delegation.delegator} chainId={chainId} />
          </InfoRow>
          {manager && (
            <InfoRow label="Manager">
              <AddressValue address={manager} chainId={chainId} />
            </InfoRow>
          )}
          <InfoRow label="Authority">
            {root ? (
              <HStack justify="flex-end" spacing={1}>
                <Code
                  fontSize="10px"
                  bg="accent.highlight"
                  color="accentFg.highlight"
                  border={tokens.borders.thin}
                  borderColor="border.default"
                  fontWeight="800"
                >
                  ROOT
                </Code>
                <CopyButton value={delegation.authority} />
              </HStack>
            ) : (
              <HexValue value={delegation.authority} helper="Parent delegation hash" />
            )}
          </InfoRow>
          <InfoRow label="Salt">
            <HexValue value={delegation.salt} />
          </InfoRow>
        </VStack>

        {delegation.caveats.length > 0 && (
          <VStack align="stretch" spacing={2}>
            {delegation.caveats.map((caveat, index) => (
              <CaveatCard
                key={`${caveat.enforcer}-${index}`}
                caveat={caveat}
                index={index}
                chainId={chainId}
              />
            ))}
          </VStack>
        )}
      </VStack>
    </Box>
  );
}

export default memo(Erc7710DelegationDisplay);
