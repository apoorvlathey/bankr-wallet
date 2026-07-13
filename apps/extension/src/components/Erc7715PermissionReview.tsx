import { useMemo, type ReactNode } from "react";
import { formatUnits } from "viem";
import {
  Badge,
  Box,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";

import type {
  Erc7715PermissionRequest,
  PendingErc7715PermissionRequest,
} from "@/chrome/pendingErc7715PermissionStorage";
import { buildErc7715PermissionCaveats } from "@/chrome/erc7715/caveats";
import { CopyButton } from "@/components/CopyButton";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import { Erc7715PermissionEditableControls } from "@/components/Erc7715PermissionEditableControls";
import { Erc7715PermissionTokenCard } from "@/components/Erc7715PermissionTokenCard";
import { useErc7715PermissionAsset } from "@/components/useErc7715PermissionAsset";
import ChainIcon from "@/components/ChainIcon";
import SafeImage from "@/components/SafeImage";
import TokenLogo from "@/components/TokenLogo";
import {
  AssetDeltaRow,
  InlineDisclosure,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListSurface,
  OutcomeCard,
} from "@/components/ui";
import { getChainConfig } from "@/constants/chainConfig";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";
import { truncateAddress } from "@/lib/addressUtils";
import { formatUsd } from "@/lib/currencyFormatUtils";
import {
  displayPermissionOrigin,
  formatApprovalRevocationMethods,
  formatDateTime,
  permissionTitle,
} from "@/lib/erc7715PermissionDisplay";
import {
  getErc7715PermissionAmount,
  getErc7715PermissionAmountPerSecond,
  getErc7715PermissionExpiry,
  getErc7715PermissionPeriodDuration,
  getErc7715PermissionTokenAddress,
  isErc7715NativePermissionType,
  isErc7715PeriodicPermissionType,
  isErc7715StreamPermissionType,
  isErc7715TokenApprovalRevocationPermissionType,
} from "@/lib/erc7715PermissionEditing";

const DELEGATION_MANAGER = "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3";
const DAY_SECONDS = 24 * 60 * 60;

export interface Erc7715PermissionReviewSections {
  outcome: ReactNode;
  financialImpact: ReactNode;
  context: ReactNode;
  advancedDetails: ReactNode;
}

interface Erc7715PermissionReviewProps {
  permissionRequest: PendingErc7715PermissionRequest;
  editedRequest: Erc7715PermissionRequest;
  validationError: string | null;
  onEditedRequestChange: (request: Erc7715PermissionRequest) => void;
  onValidationErrorChange: (error: string | null) => void;
  children: (sections: Erc7715PermissionReviewSections) => ReactNode;
}

function permissionIntent(type: string): string {
  switch (type) {
    case "native-token-allowance":
    case "erc20-token-allowance":
      return "Delegate a spending limit";
    case "native-token-periodic":
    case "erc20-token-periodic":
      return "Delegate a recurring spending limit";
    case "native-token-stream":
    case "erc20-token-stream":
      return "Delegate a continuous token stream";
    case "token-approval-revocation":
      return "Delegate token approval cleanup";
    default:
      return "Delegate a wallet permission";
  }
}

function permissionDescription(type: string): string {
  if (type === "token-approval-revocation") {
    return "The delegate can only clear the selected approval types until expiry.";
  }
  return "The delegate can act only within the amount, timing, and technical caveats shown below.";
}

function delegationNonceFromCaveats(
  caveats: PendingErc7715PermissionRequest["caveats"],
): bigint | undefined {
  const nonceCaveat = caveats.find(
    (caveat) => caveat.enforcerName === "NonceEnforcer",
  );
  if (!nonceCaveat || !/^0x[0-9a-f]+$/iu.test(nonceCaveat.terms)) {
    return undefined;
  }
  try {
    return BigInt(nonceCaveat.terms);
  } catch {
    return undefined;
  }
}

function compactDecimal(value: string): string {
  const [whole, fraction = ""] = value.split(".");
  const compactFraction = fraction.slice(0, 6).replace(/0+$/u, "");
  return compactFraction ? `${whole}.${compactFraction}` : whole;
}

function frequencyLabel(seconds: number | null): string {
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
      return seconds ? `${seconds} seconds` : "period";
  }
}

function explorerAddressUrl(explorer: string | undefined, address: string) {
  return explorer
    ? `${explorer.replace(/\/+$/, "")}/address/${address}`
    : null;
}

function AddressValue({
  label,
  address,
  explorer,
}: {
  label: string;
  address: string;
  explorer?: string;
}) {
  const explorerUrl = explorerAddressUrl(explorer, address);

  return (
    <HStack spacing={1} minW={0}>
      <Text fontSize="sm" fontFamily="mono" color="fg.primary">
        {truncateAddress(address)}
      </Text>
      <CopyButton value={address} />
      {explorerUrl && (
        <IconButton
          aria-label={`View ${label.toLowerCase()} on explorer`}
          icon={<ExternalLinkIcon boxSize={3} />}
          size="xs"
          variant="ghost"
          color="fg.secondary"
          onClick={() => window.open(explorerUrl, "_blank", "noopener,noreferrer")}
        />
      )}
    </HStack>
  );
}

function ContextRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <ListItem density="compact">
      <ListItemContent>
        <ListItemDescription>{label}</ListItemDescription>
        <Box color="fg.primary" fontSize="sm" minW={0} overflowWrap="anywhere">
          {children}
        </Box>
      </ListItemContent>
    </ListItem>
  );
}

function useDisplayedCaveats(
  permissionRequest: PendingErc7715PermissionRequest,
  editedRequest: Erc7715PermissionRequest,
) {
  return useMemo(() => {
    try {
      const delegationNonce = delegationNonceFromCaveats(
        permissionRequest.caveats,
      );
      if (delegationNonce === undefined) return permissionRequest.caveats;

      return buildErc7715PermissionCaveats(
        editedRequest as unknown as Record<string, unknown>,
        0,
        { delegationNonce },
      );
    } catch {
      return permissionRequest.caveats;
    }
  }, [editedRequest, permissionRequest.caveats]);
}

function PermissionReviewContent({
  permissionRequest,
  editedRequest,
  validationError,
  onEditedRequestChange,
  onValidationErrorChange,
  asset,
  explorer,
  isNative,
  displayedCaveats,
  children,
}: Erc7715PermissionReviewProps & {
  asset: ReturnType<typeof useErc7715PermissionAsset>;
  explorer?: string;
  isNative: boolean;
  displayedCaveats: PendingErc7715PermissionRequest["caveats"];
}) {
  const displayOrigin = displayPermissionOrigin(permissionRequest);
  const permissionType = permissionRequest.permissionType;
  const isRevocation =
    isErc7715TokenApprovalRevocationPermissionType(permissionType);
  const isPeriodic = isErc7715PeriodicPermissionType(permissionType);
  const isStream = isErc7715StreamPermissionType(permissionType);
  const expiry = getErc7715PermissionExpiry(editedRequest);
  const expiryLabel = formatDateTime(expiry);
  const expiryPhrase = expiry === null ? "with no expiration" : `until ${expiryLabel}`;
  const periodDuration = getErc7715PermissionPeriodDuration(editedRequest);
  const rawAmount = isRevocation
    ? 0n
    : isStream
      ? getErc7715PermissionAmountPerSecond(editedRequest) *
        BigInt(DAY_SECONDS)
      : getErc7715PermissionAmount(editedRequest);
  const amountLabel = isRevocation
    ? formatApprovalRevocationMethods(editedRequest.permission.data)
    : typeof asset.decimals === "number"
      ? `${compactDecimal(formatUnits(rawAmount, asset.decimals))} ${asset.symbol}`
      : `${rawAmount.toString()} base units`;
  const amountWithFrequency = isPeriodic
    ? `${amountLabel} per ${frequencyLabel(periodDuration)}`
    : isStream
      ? `${amountLabel} per day`
      : amountLabel;
  const formattedAmount =
    !isRevocation && typeof asset.decimals === "number"
      ? Number(formatUnits(rawAmount, asset.decimals))
      : 0;
  const fiatEstimate =
    Number.isFinite(formattedAmount) &&
    formattedAmount > 0 &&
    asset.priceUsd > 0
      ? `~${formatUsd(formattedAmount * asset.priceUsd)}`
      : undefined;
  const outcomeText = isRevocation
    ? `Allow ${displayOrigin} to revoke ${amountLabel} ${expiryPhrase}`
    : `Allow ${displayOrigin} to use up to ${amountWithFrequency} ${expiryPhrase}`;
  const rawRequest = JSON.stringify(editedRequest, null, 2);
  const accountExplorerUrl = explorerAddressUrl(explorer, editedRequest.from);

  const outcome = (
    <OutcomeCard
      label={permissionIntent(permissionType)}
      outcome={outcomeText}
      media={
        permissionRequest.favicon ? (
          <SafeImage
            src={permissionRequest.favicon}
            alt=""
            boxSize="36px"
            borderRadius="md"
            borderWidth="1px"
            borderStyle="solid"
            borderColor="border.default"
          />
        ) : undefined
      }
      context={permissionDescription(permissionType)}
      status={<Badge variant="outline">{permissionTitle(permissionType)}</Badge>}
    />
  );

  const financialImpact = (
    <VStack align="stretch" spacing={4}>
      <AssetDeltaRow
        direction={isRevocation ? "neutral" : "send"}
        directionLabel={
          isRevocation ? "Revocation scope" : "Delegated spending limit"
        }
        asset={isRevocation ? "Approval types" : asset.symbol}
        amount={amountWithFrequency}
        fiat={fiatEstimate}
        meta={
          isRevocation
            ? "Only the selected approval methods can be revoked"
            : isStream
            ? "Continuous rate shown as daily exposure"
            : isPeriodic
              ? `Renews every ${frequencyLabel(periodDuration)}`
              : "Maximum delegated exposure"
        }
        media={
          isRevocation ? undefined : (
            <TokenLogo
              symbol={asset.symbol}
              logoUrl={asset.logoUrl}
              nativeChainId={isNative ? permissionRequest.chainId : undefined}
              size="36px"
            />
          )
        }
      />

      {!isRevocation && (
        <Erc7715PermissionTokenCard
          asset={asset}
          chainId={permissionRequest.chainId}
          isNative={isNative}
        />
      )}

      <Erc7715PermissionEditableControls
        permissionRequest={permissionRequest}
        editedRequest={editedRequest}
        asset={asset}
        onEditedRequestChange={onEditedRequestChange}
        onValidationErrorChange={onValidationErrorChange}
      />

      {validationError && (
        <Box
          role="alert"
          bg="status.error.bg"
          color="status.error.fg"
          borderWidth="1px"
          borderStyle="solid"
          borderColor="status.error.border"
          borderRadius="md"
          px={3}
          py={2.5}
          fontSize="sm"
          fontWeight="600"
        >
          {validationError}
        </Box>
      )}
    </VStack>
  );

  const context = (
    <ListSurface aria-label="Permission context">
      <ContextRow label="Requesting app">
        <HStack spacing={2}>
          {permissionRequest.favicon && (
            <SafeImage
              src={permissionRequest.favicon}
              alt=""
              boxSize="24px"
              borderRadius="md"
            />
          )}
          <Text fontSize="sm" fontWeight="600" overflowWrap="anywhere">
            {displayOrigin}
          </Text>
        </HStack>
      </ContextRow>
      <ContextRow label="Delegate">
        <AddressValue label="Delegate" address={editedRequest.to} explorer={explorer} />
      </ContextRow>
      <ContextRow label="Account">
        <HStack spacing={1} flexWrap="wrap">
          <FromAccountDisplay address={editedRequest.from} />
          <CopyButton value={editedRequest.from} />
          {accountExplorerUrl && (
            <IconButton
              aria-label="View account on explorer"
              icon={<ExternalLinkIcon boxSize={3} />}
              size="xs"
              variant="ghost"
              color="fg.secondary"
              onClick={() => window.open(accountExplorerUrl, "_blank", "noopener,noreferrer")}
            />
          )}
        </HStack>
      </ContextRow>
      <ContextRow label="Network">
        <HStack spacing={2}>
          <ChainIcon chainId={permissionRequest.chainId} size="20px" />
          <Text fontSize="sm" fontWeight="600">
            {permissionRequest.chainName}
          </Text>
        </HStack>
      </ContextRow>
      <ContextRow label="Justification">
        <Text
          fontSize="sm"
          color={
            editedRequest.permission.justification
              ? "fg.primary"
              : "fg.secondary"
          }
          fontStyle={
            editedRequest.permission.justification ? "normal" : "italic"
          }
          whiteSpace="pre-wrap"
          overflowWrap="anywhere"
        >
          {editedRequest.permission.justification ||
            "No justification was provided for the permission"}
        </Text>
      </ContextRow>
    </ListSurface>
  );

  const advancedDetails = (
    <InlineDisclosure
      label="Technical details"
      description={`${displayedCaveats.length} WalletChan-derived caveats and the raw request`}
    >
      <VStack align="stretch" spacing={3} pt={2}>
        <Box>
          <Text fontSize="xs" color="fg.secondary" mb={1}>
            Delegation manager
          </Text>
          <AddressValue
            label="Delegation manager"
            address={DELEGATION_MANAGER}
            explorer={explorer}
          />
        </Box>

        {displayedCaveats.map((caveat, index) => (
          <Box
            key={`${caveat.enforcer}-${index}`}
            bg="surface.sunken"
            borderWidth="1px"
            borderStyle="solid"
            borderColor="border.subtle"
            borderRadius="md"
            p={3}
          >
            <VStack align="stretch" spacing={2}>
              <Text fontSize="sm" fontWeight="600" color="fg.primary">
                {caveat.enforcerName}
              </Text>
              <Box>
                <Text fontSize="xs" color="fg.secondary" mb={1}>
                  Enforcer
                </Text>
                <AddressValue
                  label="Enforcer"
                  address={caveat.enforcer}
                  explorer={explorer}
                />
              </Box>
              <Box>
                <Text fontSize="xs" color="fg.secondary" mb={1}>
                  Terms
                </Text>
                <HStack spacing={1} minW={0}>
                  <Text
                    fontSize="xs"
                    fontFamily="mono"
                    color="fg.secondary"
                    noOfLines={1}
                    minW={0}
                  >
                    {caveat.terms}
                  </Text>
                  <CopyButton value={caveat.terms} />
                </HStack>
              </Box>
            </VStack>
          </Box>
        ))}

        <Box>
          <HStack justify="space-between" mb={2}>
            <Text fontSize="sm" fontWeight="600" color="fg.primary">
              Raw permission request
            </Text>
            <CopyButton value={rawRequest} />
          </HStack>
          <Box
            as="pre"
            m={0}
            p={3}
            maxH="240px"
            overflow="auto"
            whiteSpace="pre-wrap"
            wordBreak="break-word"
            bg="surface.sunken"
            borderWidth="1px"
            borderStyle="solid"
            borderColor="border.subtle"
            borderRadius="md"
            color="fg.secondary"
            fontFamily="mono"
            fontSize="xs"
          >
            {rawRequest}
          </Box>
        </Box>
      </VStack>
    </InlineDisclosure>
  );

  return children({ outcome, financialImpact, context, advancedDetails });
}

function TokenPermissionReview(props: Erc7715PermissionReviewProps) {
  const { permissionRequest, editedRequest } = props;
  const { networksInfo } = useNetworks();
  const displayedCaveats = useDisplayedCaveats(permissionRequest, editedRequest);
  const resolvedChain = getResolvedChainById(
    permissionRequest.chainId,
    networksInfo,
  );
  const explorer =
    resolvedChain?.explorer || getChainConfig(permissionRequest.chainId).explorer;
  const nativeSymbol =
    resolvedChain?.nativeCurrency.symbol || "ETH";
  const tokenAddress = getErc7715PermissionTokenAddress(editedRequest);
  const isNative = isErc7715NativePermissionType(
    permissionRequest.permissionType,
  );
  const asset = useErc7715PermissionAsset({
    permissionRequest,
    editedRequest,
    explorer,
    nativeSymbol,
    tokenAddress,
    isNative,
  });

  return (
    <PermissionReviewContent
      {...props}
      asset={asset}
      explorer={explorer}
      isNative={isNative}
      displayedCaveats={displayedCaveats}
    />
  );
}

function ApprovalRevocationReview(props: Erc7715PermissionReviewProps) {
  const { permissionRequest, editedRequest } = props;
  const { networksInfo } = useNetworks();
  const displayedCaveats = useDisplayedCaveats(permissionRequest, editedRequest);
  const resolvedChain =
    getResolvedChainById(permissionRequest.chainId, networksInfo) ||
    getChainConfig(permissionRequest.chainId);
  const explorer = resolvedChain?.explorer;
  const asset = {
    symbol: "Approvals",
    name: "Token approval methods",
    decimals: null,
    decimalsStatus: "verified" as const,
    priceUsd: 0,
    balanceLabel: "",
    balanceUsdLabel: "",
    tokenExplorerUrl: null,
    tokenAddress: null,
  };

  return (
    <PermissionReviewContent
      {...props}
      asset={asset}
      explorer={explorer}
      isNative={false}
      displayedCaveats={displayedCaveats}
    />
  );
}

export function Erc7715PermissionReview(props: Erc7715PermissionReviewProps) {
  if (
    isErc7715TokenApprovalRevocationPermissionType(
      props.permissionRequest.permissionType,
    )
  ) {
    return <ApprovalRevocationReview {...props} />;
  }

  return <TokenPermissionReview {...props} />;
}
