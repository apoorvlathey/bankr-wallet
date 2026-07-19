import {
  Badge,
  Box,
  Flex,
  Text,
} from "@chakra-ui/react";
import { ChevronRightIcon, RepeatIcon } from "@chakra-ui/icons";
import type { CombinedRequest } from "@/app/requestModel";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import type { PendingSignatureRequest } from "@/chrome/requests/pendingSignatureStorage";
import type { PendingErc7715PermissionRequest } from "@/chrome/pendingErc7715PermissionStorage";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import { getChainConfig } from "@/constants/chainConfig";
import { googleFaviconUrl } from "@/constants/externalUrls";
import ChainIcon from "@/components/ChainIcon";
import SafeImage from "@/components/SafeImage";
import {
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
} from "@/components/ui";
import { formatRelativeTime } from "@/lib/timeFormatUtils";
import { useDappOriginFormatter } from "@/hooks/useDappOriginDisplay";

function getOriginHostname(origin: string): string | null {
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
}

function getOriginDisplay(origin: string): string {
  return getOriginHostname(origin) || origin;
}

function getFaviconUrl(origin: string, favicon: string | null): string | undefined {
  if (favicon) return favicon;
  const hostname = getOriginHostname(origin);
  return hostname ? googleFaviconUrl(hostname) : undefined;
}

function getMethodDisplayName(method: string): string {
  switch (method) {
    case "personal_sign":
      return "Personal message";
    case "eth_sign":
      return "Raw message";
    case "eth_signTypedData":
    case "eth_signTypedData_v3":
    case "eth_signTypedData_v4":
      return "Typed data";
    default:
      return method;
  }
}

function getPermissionDisplayName(permissionType: string): string {
  return permissionType
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/^./, (character) => character.toUpperCase());
}

function truncateAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

interface OriginMarkProps {
  origin: string;
  favicon: string | null;
  fallbackFavicon?: string | null;
  displayLabel?: string;
}

function OriginMark({
  origin,
  favicon,
  fallbackFavicon,
  displayLabel,
}: OriginMarkProps) {
  const src = getFaviconUrl(origin, favicon);
  const fallback = getFaviconUrl(origin, null);
  const initial =
    (displayLabel || getOriginDisplay(origin)).charAt(0).toUpperCase() || "?";

  return (
    <Box
      w="36px"
      h="36px"
      position="relative"
      display="flex"
      alignItems="center"
      justifyContent="center"
      overflow="hidden"
      borderRadius="md"
      bg="surface.sunken"
      border="1px solid"
      borderColor="border.subtle"
    >
      <Text as="span" color="fg.secondary" fontSize="sm" fontWeight={700}>
        {initial}
      </Text>
      {src && (
        <SafeImage
          src={src}
          fallbackSrc={fallbackFavicon || fallback}
          alt=""
          position="absolute"
          inset={0}
          w="full"
          h="full"
          p={1.5}
          objectFit="contain"
          fallback={<Box position="absolute" inset={0} />}
        />
      )}
    </Box>
  );
}

interface RequestPresentation {
  title: string;
  typeLabel: string;
  detail: string;
  chainId: number;
  chainName: string;
  timestamp: number;
  origin?: string;
  favicon?: string | null;
  isUserBatch?: boolean;
}

function presentRequest(item: CombinedRequest): RequestPresentation {
  if (item.type === "crossDappBatch") {
    return {
      title: "Your cross-dapp batch",
      typeLabel: "Batch",
      detail: `${item.request.entries.length} ${item.request.entries.length === 1 ? "call" : "calls"}`,
      chainId: item.request.chainId,
      chainName: item.request.chainName,
      timestamp: item.request.createdAt,
      isUserBatch: true,
    };
  }

  if (item.type === "tx") {
    return {
      title: getOriginDisplay(item.request.origin),
      typeLabel: "Transaction",
      detail: item.request.tx.to
        ? truncateAddress(item.request.tx.to)
        : "Contract deployment",
      chainId: item.request.tx.chainId,
      chainName: item.request.chainName,
      timestamp: item.request.timestamp,
      origin: item.request.origin,
      favicon: item.request.favicon,
    };
  }

  if (item.type === "batch") {
    return {
      title: getOriginDisplay(item.request.origin),
      typeLabel: "Batch transaction",
      detail: `${item.request.params.calls.length} ${item.request.params.calls.length === 1 ? "call" : "calls"}`,
      chainId: item.request.chainId,
      chainName: item.request.chainName,
      timestamp: item.request.timestamp,
      origin: item.request.origin,
      favicon: item.request.favicon,
    };
  }

  if (item.type === "permission") {
    return {
      title: getOriginDisplay(item.request.origin),
      typeLabel: "Permission",
      detail: getPermissionDisplayName(item.request.permissionType),
      chainId: item.request.chainId,
      chainName: item.request.chainName,
      timestamp: item.request.timestamp,
      origin: item.request.origin,
      favicon: item.request.favicon,
    };
  }

  return {
    title: getOriginDisplay(item.request.origin),
    typeLabel: "Signature",
    detail: getMethodDisplayName(item.request.signature.method),
    chainId: item.request.signature.chainId,
    chainName: item.request.chainName,
    timestamp: item.request.timestamp,
    origin: item.request.origin,
    favicon: item.request.favicon,
  };
}

interface PendingRequestRowProps {
  item: CombinedRequest;
  position: number;
  totalCount: number;
  onSelectTx: (txRequest: PendingTxRequest) => void;
  onSelectSignature: (sigRequest: PendingSignatureRequest) => void;
  onSelectPermission?: (request: PendingErc7715PermissionRequest) => void;
  onSelectBatch?: (batchRequest: PendingBatchTxRequest) => void;
  onSelectCrossDappBatch?: () => void;
}

export default function PendingRequestRow({
  item,
  position,
  totalCount,
  onSelectTx,
  onSelectSignature,
  onSelectPermission,
  onSelectBatch,
  onSelectCrossDappBatch,
}: PendingRequestRowProps) {
  const formatOrigin = useDappOriginFormatter();
  const rawPresentation = presentRequest(item);
  const displayOrigin = rawPresentation.origin
    ? formatOrigin(rawPresentation.origin)
    : null;
  const presentation = displayOrigin?.resolvedName
    ? { ...rawPresentation, title: displayOrigin.label }
    : rawPresentation;
  const chain = getChainConfig(presentation.chainId);

  const handleSelect = () => {
    switch (item.type) {
      case "tx":
        onSelectTx(item.request);
        break;
      case "sig":
        onSelectSignature(item.request);
        break;
      case "permission":
        onSelectPermission?.(item.request);
        break;
      case "batch":
        onSelectBatch?.(item.request);
        break;
      case "crossDappBatch":
        onSelectCrossDappBatch?.();
        break;
    }
  };

  return (
    <ListItem
      interactive
      onClick={handleSelect}
      minH="76px"
      aria-label={`${presentation.typeLabel} request from ${presentation.title}, ${position} of ${totalCount}`}
    >
      <ListItemMedia>
        {presentation.isUserBatch ? (
          <Flex
            as="span"
            w="36px"
            h="36px"
            align="center"
            justify="center"
            borderRadius="md"
            bg="surface.sunken"
            border="1px solid"
            borderColor="border.subtle"
            color="fg.secondary"
          >
            <RepeatIcon boxSize={4} />
          </Flex>
        ) : (
          <OriginMark
            origin={presentation.origin || presentation.title}
            favicon={
              displayOrigin?.faviconSrc || presentation.favicon || null
            }
            fallbackFavicon={displayOrigin?.faviconFallbackSrc}
            displayLabel={presentation.title}
          />
        )}
      </ListItemMedia>

      <ListItemContent gap={1}>
        <Flex as="span" align="center" gap={2} minW={0}>
          <ListItemTitle noOfLines={1} flex="1 1 auto" minW={0}>
            {presentation.title}
          </ListItemTitle>
          <Badge
            as="span"
            flexShrink={0}
            bg={presentation.isUserBatch ? "status.warning.tint" : "surface.raisedHover"}
            color={presentation.isUserBatch ? "status.warning.fg" : "fg.secondary"}
            borderRadius="full"
            px={2}
            py={0.5}
            fontSize="xs"
            fontWeight={600}
            textTransform="none"
            letterSpacing="normal"
          >
            {presentation.typeLabel}
          </Badge>
        </Flex>

        <ListItemDescription as="span" noOfLines={1}>
          {presentation.detail}
        </ListItemDescription>

        <Flex as="span" align="center" gap={1.5} color="fg.muted" minW={0}>
          <ChainIcon
            chainId={presentation.chainId}
            chainName={presentation.chainName}
            size="12px"
          />
          <Text as="span" fontSize="xs" noOfLines={1}>
            {chain?.name || presentation.chainName}
          </Text>
          <Text as="span" aria-hidden="true" fontSize="xs">
            ·
          </Text>
          <Text as="span" fontSize="xs" whiteSpace="nowrap">
            {formatRelativeTime(presentation.timestamp)}
          </Text>
          <Text as="span" aria-hidden="true" fontSize="xs">
            ·
          </Text>
          <Text as="span" fontSize="xs" whiteSpace="nowrap">
            {position} of {totalCount}
          </Text>
        </Flex>
      </ListItemContent>

      <ListItemActions aria-hidden="true">
        <ChevronRightIcon boxSize={5} />
      </ListItemActions>
    </ListItem>
  );
}
