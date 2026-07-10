/**
 * Shared "Smart account setup / replacement" banner.
 *
 * Rendered on any confirmation surface where the tx will bundle an EIP-7702
 * authorization tuple (`batchPlan.needsAuthorization === true`):
 *
 *   • BatchTransactionConfirmation     — dapp-initiated batches
 *   • CrossDappBatchConfirmation       — via the BatchTransactionConfirmation
 *                                        wrapper, so this one's free
 *   • SwapConfirmation                 — PK/SP atomic swaps via 7702
 *
 * Two text variants, switched on `onchainDelegate`:
 *
 *   Fresh   — EOA has no current delegation. "Smart account setup (one-time)".
 *   Replace — EOA delegated to a non-7821-capable contract. "Smart account
 *             upgrade". Same neutral visual treatment as Fresh (border, icon
 *             colors) so the user isn't startled by a warning-style banner
 *             on what is functionally an upgrade. The expanded details still
 *             show BOTH addresses (current + new) so nothing happens silently.
 *
 * Surfaces that already render this banner only need to pass the
 * authorization-relevant props from their `batchPlan`; the chain explorer URL
 * is the only locally-derived dependency.
 */

import { useState } from "react";
import {
  Box,
  HStack,
  VStack,
  Text,
  Icon,
  Link,
  Collapse,
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  ExternalLinkIcon,
} from "@chakra-ui/icons";
import { CopyButton } from "@/components/CopyButton";
import { getKnownDelegateName } from "@/constants/chainRegistry";
import { useTheme } from "@/theme";

type Address = `0x${string}`;

export interface SmartAccountSetupBannerProps {
  /** Delegate WalletChan will authorize this tx. */
  delegate: Address;
  /**
   * The EOA's current onchain delegation, if any. When set AND different from
   * `delegate`, switches the banner to the "replacing existing delegation"
   * variant.
   */
  onchainDelegate?: Address | null;
  /** Block explorer base URL (e.g. https://etherscan.io). Used for the address links. */
  explorerUrl?: string;
}

export default function SmartAccountSetupBanner({
  delegate,
  onchainDelegate,
  explorerUrl,
}: SmartAccountSetupBannerProps) {
  const { tokens } = useTheme();
  const [expanded, setExpanded] = useState(false);

  const isReplacing =
    !!onchainDelegate && onchainDelegate.toLowerCase() !== delegate.toLowerCase();

  return (
    <Box
      bg="surface.raised"
      border={tokens.borders.thin}
      borderColor="border.subtle"
      borderRadius="lg"
      px={3}
      py={2}
    >
      <HStack
        as="button"
        type="button"
        w="full"
        spacing={2}
        align="center"
        justify="space-between"
        cursor="pointer"
        textAlign="start"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <HStack spacing={2} flex={1} minW={0}>
          <Text fontSize="md" lineHeight="1">
            ⚡
          </Text>
          <Text
            fontSize="xs"
            fontWeight="600"
            color="text.primary"
            noOfLines={1}
          >
            {isReplacing
              ? "Smart account upgrade"
              : "Smart account setup (one-time)"}
          </Text>
        </HStack>
        <HStack spacing={1} flexShrink={0}>
          <Text fontSize="xs" color="text.secondary" fontWeight="500">
            Details
          </Text>
          <Icon
            as={expanded ? ChevronUpIcon : ChevronDownIcon}
            boxSize="14px"
            color="text.tertiary"
          />
        </HStack>
      </HStack>
      <Collapse in={expanded} animateOpacity>
        <VStack
          spacing={1.5}
          align="stretch"
          mt={2.5}
          pt={2.5}
          borderTop="1px solid"
          borderColor="border.subtle"
        >
          <Text fontSize="xs" color="text.secondary" lineHeight="short">
            {isReplacing
              ? "Switches this account's delegate to ours that supports atomic batching via ERC-7821."
              : "Lets this account execute multiple calls in one atomic tx."}
          </Text>
          {isReplacing && onchainDelegate && (
            <HStack spacing={1.5} align="center">
              <Text fontSize="2xs" color="text.tertiary" fontWeight="700">
                Current
              </Text>
              <Text
                fontSize="2xs"
                fontFamily="mono"
                color="text.primary"
                noOfLines={1}
              >
                {onchainDelegate.slice(0, 6)}…{onchainDelegate.slice(-4)}
              </Text>
              <CopyButton value={onchainDelegate} />
              {explorerUrl && (
                <Link
                  href={`${explorerUrl}/address/${onchainDelegate}`}
                  isExternal
                  color="accentFg.secondary"
                  display="inline-flex"
                  alignItems="center"
                >
                  <Icon as={ExternalLinkIcon} boxSize="12px" />
                </Link>
              )}
            </HStack>
          )}
          <HStack spacing={1.5} align="center">
            <Text fontSize="2xs" color="text.tertiary" fontWeight="700">
              {isReplacing ? "New" : "Delegate"}
            </Text>
            <Text
              fontSize="2xs"
              fontFamily="mono"
              color="text.primary"
              noOfLines={1}
            >
              {delegate.slice(0, 6)}…{delegate.slice(-4)}
            </Text>
            {getKnownDelegateName(delegate) && (
              <Box
                bg="accent.highlight"
                color="accentFg.highlight"
                borderWidth="1px"
                borderColor="border.default"
                borderRadius={tokens.radii.badge}
                px={1.5}
                py={0.5}
                fontSize="9px"
                fontWeight="700"
                textTransform="uppercase"
                letterSpacing="wider"
                lineHeight="1"
              >
                {getKnownDelegateName(delegate)}
              </Box>
            )}
            <CopyButton value={delegate} />
            {explorerUrl && (
              <Link
                href={`${explorerUrl}/address/${delegate}`}
                isExternal
                color="accentFg.secondary"
                display="inline-flex"
                alignItems="center"
              >
                <Icon as={ExternalLinkIcon} boxSize="12px" />
              </Link>
            )}
          </HStack>
          <Text fontSize="xs" color="text.tertiary" lineHeight="short">
            Manage or revoke in Account Settings → Smart Account.
          </Text>
        </VStack>
      </Collapse>
    </Box>
  );
}
