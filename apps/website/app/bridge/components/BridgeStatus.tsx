"use client";

import { useMemo } from "react";
import {
  Box,
  HStack,
  Image,
  Link,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ArrowRight } from "lucide-react";
import { useBridgeStatus } from "../hooks/useBridgeStatus";
import { BungeeStatusCode, type BungeeChain } from "../types";

interface BridgeStatusProps {
  requestHash?: string;
  txHash?: string;
  /** Map chainId → explorer URL prefix (no trailing slash). */
  explorers?: Record<number, string>;
  /** Chain registry from /supported-chains so we can render name + logo. */
  chains?: BungeeChain[];
}

const STATUS_LABELS: Record<BungeeStatusCode, string> = {
  [BungeeStatusCode.PENDING]: "Pending — waiting for source confirmation",
  [BungeeStatusCode.ASSIGNED]: "Assigned to a solver",
  [BungeeStatusCode.EXTRACTED]: "Funds extracted on source chain",
  [BungeeStatusCode.FULFILLED]: "Delivered on destination chain",
  [BungeeStatusCode.SETTLED]: "Settled",
  [BungeeStatusCode.EXPIRED]: "Expired",
  [BungeeStatusCode.CANCELLED]: "Cancelled",
  [BungeeStatusCode.REFUNDED]: "Refunded on source chain",
};

const STATUS_COLORS: Record<BungeeStatusCode, string> = {
  [BungeeStatusCode.PENDING]: "bauhaus.blue",
  [BungeeStatusCode.ASSIGNED]: "bauhaus.blue",
  [BungeeStatusCode.EXTRACTED]: "bauhaus.yellow",
  [BungeeStatusCode.FULFILLED]: "bauhaus.green",
  [BungeeStatusCode.SETTLED]: "bauhaus.green",
  [BungeeStatusCode.EXPIRED]: "bauhaus.red",
  [BungeeStatusCode.CANCELLED]: "bauhaus.red",
  [BungeeStatusCode.REFUNDED]: "bauhaus.red",
};

function txLink(
  explorers: Record<number, string> | undefined,
  chainId: number | undefined,
  hash: string | undefined,
) {
  if (!explorers || !chainId || !hash) return null;
  const base = explorers[chainId];
  if (!base) return null;
  return `${base}/tx/${hash}`;
}

function truncate(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

interface ChainTxBlockProps {
  chain?: BungeeChain;
  chainId?: number;
  hash?: string;
  link: string | null;
  /** Visual: dim until the leg has happened. */
  dim?: boolean;
  /** Title in front of hash, e.g. "Refund". */
  prefix?: string;
}

function ChainTxBlock({
  chain,
  chainId,
  hash,
  link,
  dim,
  prefix,
}: ChainTxBlockProps) {
  const name = chain?.name ?? (chainId ? `Chain ${chainId}` : "—");
  const logo = chain?.icon ?? chain?.logoURI;

  return (
    <VStack
      flex={1}
      spacing={1}
      align="center"
      opacity={dim ? 0.5 : 1}
      minW={0}
    >
      <HStack spacing={1.5}>
        {logo && (
          <Image
            src={logo}
            alt={name}
            boxSize="18px"
            borderRadius="full"
          />
        )}
        <Text
          fontWeight="black"
          fontSize="xs"
          textTransform="uppercase"
          letterSpacing="wide"
          noOfLines={1}
        >
          {name}
        </Text>
      </HStack>
      {hash ? (
        link ? (
          <Link
            href={link}
            isExternal
            fontSize="xs"
            fontWeight="bold"
            color="bauhaus.blue"
            fontFamily="mono"
          >
            {prefix ? `${prefix} ` : ""}
            {truncate(hash)} ↗
          </Link>
        ) : (
          <Text fontSize="xs" fontWeight="bold" fontFamily="mono" color="gray.500">
            {truncate(hash)}
          </Text>
        )
      ) : (
        <Text fontSize="2xs" color="gray.400" fontWeight="bold">
          pending…
        </Text>
      )}
    </VStack>
  );
}

export function BridgeStatus({
  requestHash,
  txHash,
  explorers,
  chains,
}: BridgeStatusProps) {
  const { entry, error, isPolling } = useBridgeStatus({ requestHash, txHash });

  const chainsById = useMemo(() => {
    const map = new Map<number, BungeeChain>();
    for (const c of chains ?? []) map.set(c.chainId, c);
    return map;
  }, [chains]);

  if (!requestHash && !txHash) return null;

  const code = entry?.bungeeStatusCode;
  const label = code !== undefined ? STATUS_LABELS[code] : "Waiting for status…";
  const color = code !== undefined ? STATUS_COLORS[code] : "bauhaus.blue";

  const sourceChainId = entry?.originData?.originChainId;
  const destChainId = entry?.destinationData?.destinationChainId;
  const refundChainId =
    entry?.refund?.chainId ?? entry?.refund?.originChainId;

  const sourceHash = entry?.originData?.txHash;
  const destHash = entry?.destinationData?.txHash;
  const refundHash = entry?.refund?.txHash;

  const sourceLink = txLink(explorers, sourceChainId, sourceHash);
  const destLink = txLink(explorers, destChainId, destHash);
  const refundLink = txLink(explorers, refundChainId, refundHash);

  const routeName = entry?.routeDetails?.name;
  const isRefunded = code === BungeeStatusCode.REFUNDED;
  // Until destination is fulfilled, dim it to show progress is one-sided.
  const destNotReached =
    code !== undefined &&
    code < BungeeStatusCode.FULFILLED &&
    !destHash;

  return (
    <Box
      bg="bauhaus.muted"
      border="2px solid"
      borderColor="bauhaus.border"
      px={4}
      py={3}
    >
      <VStack spacing={3} align="stretch">
        {/* Status header */}
        <HStack justify="space-between" spacing={2}>
          <HStack spacing={2} flex={1} minW={0}>
            {isPolling && <Spinner size="xs" />}
            <Text fontSize="sm" fontWeight="black" color={color} noOfLines={1}>
              {label}
            </Text>
          </HStack>
          {routeName && (
            <Text
              fontSize="2xs"
              color="gray.500"
              fontWeight="bold"
              textTransform="uppercase"
              letterSpacing="wide"
              flexShrink={0}
            >
              via {routeName}
            </Text>
          )}
        </HStack>

        {/* Source → Destination flow */}
        {(sourceChainId || destChainId) && (
          <HStack
            spacing={2}
            align="center"
            bg="white"
            border="2px solid"
            borderColor="bauhaus.border"
            px={3}
            py={2}
          >
            <ChainTxBlock
              chain={sourceChainId ? chainsById.get(sourceChainId) : undefined}
              chainId={sourceChainId}
              hash={sourceHash}
              link={sourceLink}
            />

            <Box
              flexShrink={0}
              color={destHash ? "bauhaus.green" : "gray.400"}
            >
              <ArrowRight size={20} strokeWidth={3} />
            </Box>

            <ChainTxBlock
              chain={destChainId ? chainsById.get(destChainId) : undefined}
              chainId={destChainId}
              hash={destHash}
              link={destLink}
              dim={destNotReached}
            />
          </HStack>
        )}

        {/* Refund row — only when present */}
        {isRefunded && refundChainId && (
          <HStack
            spacing={2}
            bg="white"
            border="2px solid"
            borderColor="bauhaus.red"
            px={3}
            py={2}
          >
            <Text
              fontSize="2xs"
              fontWeight="black"
              color="bauhaus.red"
              textTransform="uppercase"
              letterSpacing="wide"
              flexShrink={0}
            >
              Refund:
            </Text>
            <ChainTxBlock
              chain={chainsById.get(refundChainId)}
              chainId={refundChainId}
              hash={refundHash}
              link={refundLink}
            />
          </HStack>
        )}

        {error && (
          <Text fontSize="xs" color="bauhaus.red">
            {error}
          </Text>
        )}
      </VStack>
    </Box>
  );
}
