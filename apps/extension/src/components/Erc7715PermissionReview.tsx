import { useMemo, useState } from "react";
import {
  Badge,
  Box,
  Collapse,
  HStack,
  IconButton,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
  ExternalLinkIcon,
  InfoOutlineIcon,
} from "@chakra-ui/icons";

import type {
  Erc7715PermissionRequest,
  PendingErc7715PermissionRequest,
} from "@/chrome/pendingErc7715PermissionStorage";
import { buildErc7715PermissionCaveats } from "@/chrome/erc7715PermissionCaveats";
import { CopyButton } from "@/components/CopyButton";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import { Erc7715PermissionEditableControls } from "@/components/Erc7715PermissionEditableControls";
import ChainIcon from "@/components/ChainIcon";
import { getChainConfig } from "@/constants/chainConfig";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";
import { truncateAddress } from "@/lib/addressUtils";
import { useTheme } from "@/theme";

const DELEGATION_MANAGER = "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3";

function permissionTitle(type: string): string {
  switch (type) {
    case "native-token-allowance":
      return "Native Token Allowance";
    case "native-token-periodic":
      return "Native Periodic Allowance";
    case "native-token-stream":
      return "Native Stream Allowance";
    case "erc20-token-allowance":
      return "ERC-20 Token Allowance";
    case "erc20-token-periodic":
      return "ERC-20 Periodic Allowance";
    case "erc20-token-stream":
      return "ERC-20 Stream Allowance";
    case "token-approval-revocation":
      return "Token Approval Revocation";
    default:
      return type;
  }
}

function permissionIntent(type: string): string {
  switch (type) {
    case "native-token-allowance":
      return "Spend native tokens";
    case "native-token-periodic":
      return "Spend native tokens over time";
    case "native-token-stream":
      return "Stream native tokens over time";
    case "erc20-token-allowance":
      return "Spend ERC-20 tokens";
    case "erc20-token-periodic":
      return "Spend ERC-20 tokens over time";
    case "erc20-token-stream":
      return "Stream ERC-20 tokens over time";
    case "token-approval-revocation":
      return "Revoke token approvals";
    default:
      return "Use delegated permission";
  }
}

function permissionDescription(type: string): string {
  if (type === "token-approval-revocation") {
    return "The delegate can only clear the selected approval types until expiry.";
  }
  return "The delegate can act until the listed limit or expiry is hit.";
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

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <HStack align="start" justify="space-between" spacing={3} w="full">
      <Text
        fontSize="xs"
        color="text.secondary"
        fontWeight="900"
        textTransform="uppercase"
        flexShrink={0}
      >
        {label}
      </Text>
      <Box minW={0} textAlign="right">
        {children}
      </Box>
    </HStack>
  );
}

function AddressRow({
  label,
  address,
  explorer,
}: {
  label: string;
  address: string;
  explorer?: string;
}) {
  const explorerUrl = explorer
    ? `${explorer.replace(/\/+$/, "")}/address/${address}`
    : null;

  return (
    <InfoRow label={label}>
      <HStack spacing={1} justify="flex-end">
        <Text fontSize="xs" fontFamily="mono" fontWeight="800" color="text.primary">
          {truncateAddress(address)}
        </Text>
        <CopyButton value={address} />
        {explorerUrl && (
          <IconButton
            aria-label={`View ${label.toLowerCase()} on explorer`}
            icon={<ExternalLinkIcon boxSize="11px" />}
            size="xs"
            variant="ghost"
            color="text.secondary"
            onClick={() => window.open(explorerUrl, "_blank")}
            _hover={{ color: "accent.secondary", bg: "bg.muted" }}
          />
        )}
      </HStack>
    </InfoRow>
  );
}

export function Erc7715PermissionReview({
  permissionRequest,
  editedRequest,
  onEditedRequestChange,
  onValidationErrorChange,
}: {
  permissionRequest: PendingErc7715PermissionRequest;
  editedRequest: Erc7715PermissionRequest;
  onEditedRequestChange: (request: Erc7715PermissionRequest) => void;
  onValidationErrorChange: (error: string | null) => void;
}) {
  const { tokens } = useTheme();
  const { networksInfo } = useNetworks();
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const resolvedChain =
    getResolvedChainById(permissionRequest.chainId, networksInfo) ||
    getChainConfig(permissionRequest.chainId);
  const explorer = resolvedChain?.explorer;
  const nativeSymbol =
    resolvedChain?.nativeCurrency?.symbol ||
    getChainConfig(permissionRequest.chainId).nativeCurrency?.symbol ||
    "ETH";
  const displayedCaveats = useMemo(() => {
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

  return (
    <VStack align="stretch" spacing={3}>
      <Box
        bg="status.info.bg"
        border={tokens.borders.medium}
        borderColor="status.info.border"
        borderRadius={tokens.radii.card}
        boxShadow="card"
        p={3}
      >
        <HStack spacing={2} align="start">
          <InfoOutlineIcon color="status.info.fg" mt={0.5} />
          <VStack align="start" spacing={1}>
            <Text fontSize="sm" fontWeight="900" color="status.info.fg">
              {permissionIntent(permissionRequest.permissionType)}
            </Text>
            <Text fontSize="xs" fontWeight="700" color="status.info.fg">
              {permissionDescription(permissionRequest.permissionType)}
            </Text>
          </VStack>
        </HStack>
      </Box>

      <Box
        border={tokens.borders.thick}
        borderColor="border.default"
        borderRadius={tokens.radii.card}
        bg="surface.sunken"
        boxShadow="card"
        p={3}
      >
        <VStack align="stretch" spacing={3}>
          <HStack justify="space-between">
            <Badge
              variant="solid"
              bg="accent.secondary"
              color="accentFg.secondary"
              borderRadius={tokens.radii.badge}
            >
              {permissionTitle(permissionRequest.permissionType)}
            </Badge>
            <HStack spacing={1}>
              <ChainIcon chainId={permissionRequest.chainId} size={18} />
              <Text fontSize="xs" fontWeight="900" color="text.primary">
                {permissionRequest.chainName}
              </Text>
            </HStack>
          </HStack>

          <InfoRow label="From">
            <HStack justify="flex-end">
              <FromAccountDisplay address={editedRequest.from} />
            </HStack>
          </InfoRow>
          <AddressRow
            label="Delegate"
            address={editedRequest.to}
            explorer={explorer}
          />
          <Box
            bg="surface.raised"
            border={tokens.borders.thin}
            borderColor="border.default"
            borderRadius={tokens.radii.input}
            p={3}
          >
            <VStack align="stretch" spacing={1}>
              <Text
                fontSize="xs"
                color="text.secondary"
                fontWeight="900"
                textTransform="uppercase"
              >
                Justification
              </Text>
              <Text
                fontSize="xs"
                color={
                  editedRequest.permission.justification
                    ? "text.primary"
                    : "text.secondary"
                }
                fontStyle={
                  editedRequest.permission.justification ? "normal" : "italic"
                }
                fontWeight={
                  editedRequest.permission.justification ? "700" : "600"
                }
                whiteSpace="pre-wrap"
                wordBreak="break-word"
                overflowWrap="anywhere"
              >
                {editedRequest.permission.justification ||
                  "No justification was provided for the permission"}
              </Text>
            </VStack>
          </Box>
          <Erc7715PermissionEditableControls
            permissionRequest={permissionRequest}
            editedRequest={editedRequest}
            explorer={explorer}
            nativeSymbol={nativeSymbol}
            onEditedRequestChange={onEditedRequestChange}
            onValidationErrorChange={onValidationErrorChange}
          />
        </VStack>
      </Box>

      <Box
        border={tokens.borders.medium}
        borderColor="border.default"
        borderRadius={tokens.radii.card}
        bg="surface.base"
        overflow="hidden"
      >
        <HStack
          as="button"
          type="button"
          w="full"
          justify="space-between"
          p={3}
          onClick={() => setAdvancedOpen((open) => !open)}
          textAlign="left"
        >
          <Text fontSize="xs" fontWeight="900" color="text.primary" textTransform="uppercase">
            Advanced Details
          </Text>
          <ChevronDownIcon
            transform={advancedOpen ? "rotate(180deg)" : "rotate(0deg)"}
            transition="transform 0.15s ease"
          />
        </HStack>
        <Collapse in={advancedOpen} animateOpacity>
          <VStack align="stretch" spacing={2} px={3} pb={3}>
            <AddressRow label="Manager" address={DELEGATION_MANAGER} explorer={explorer} />
            {displayedCaveats.map((caveat, index) => (
              <Box
                key={`${caveat.enforcer}-${index}`}
                bg="bg.muted"
                border={tokens.borders.thin}
                borderColor="border.default"
                borderRadius={tokens.radii.input}
                p={2}
              >
                <VStack align="stretch" spacing={2}>
                  <InfoRow label="Caveat">
                    <Text fontSize="xs" fontWeight="900" color="text.primary">
                      {caveat.enforcerName}
                    </Text>
                  </InfoRow>
                  <AddressRow label="Enforcer" address={caveat.enforcer} explorer={explorer} />
                  <InfoRow label="Terms">
                    <HStack spacing={1} justify="flex-end" minW={0}>
                      <Text
                        fontSize="xs"
                        fontFamily="mono"
                        color="text.secondary"
                        fontWeight="700"
                        noOfLines={1}
                      >
                        {caveat.terms}
                      </Text>
                      <CopyButton value={caveat.terms} />
                    </HStack>
                  </InfoRow>
                </VStack>
              </Box>
            ))}
          </VStack>
        </Collapse>
      </Box>
    </VStack>
  );
}
