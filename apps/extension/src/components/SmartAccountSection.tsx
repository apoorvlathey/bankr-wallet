/**
 * Smart Account (EIP-7702) section for the Account Settings modal.
 *
 * Per-chain delegation status for PK / Seed Phrase accounts. Shows the EOA's
 * current onchain delegation and the user's custom override (if any), with
 * an Edit button that opens EditDelegateModal for that chain.
 *
 * Chains shown:
 *   - Every chain in EIP7702_SUPPORTED_CHAIN_IDS (the built-in Pectra set).
 *   - Plus every non-hidden chain in the user's `networksInfo` (custom EVM
 *     chains they've added) so they can see / revoke / re-delegate even on
 *     chains where we don't ship a WalletChan default delegate.
 *   - Plus any chain with a stored customDelegate that's no longer in the
 *     networks list (leftover) — so cleanup is still possible.
 */

import { useEffect, useMemo, useState } from "react";
import {
  HStack,
  VStack,
  Text,
  Button,
  Spinner,
  Collapse,
  Box,
} from "@chakra-ui/react";
import { ChevronDownIcon, ChevronRightIcon } from "@chakra-ui/icons";
import {
  CHAIN_REGISTRY,
  EIP7702_SUPPORTED_CHAIN_IDS,
  EIP_7702_DEFAULT_DELEGATE,
} from "@/constants/chainRegistry";
import EditDelegateModal from "@/components/EditDelegateModal";
import ChainIcon from "@/components/ChainIcon";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChains } from "@/lib/chains";

type Address = `0x${string}`;

interface DelegationStatus {
  loading: boolean;
  delegate: Address | null;
  source: "onchain" | "default" | "none" | null;
  onchainDelegate: Address | null;
  customDelegate: Address | null;
  needsAuthorization: boolean;
  error?: string;
}

function fetchStatus(
  accountId: string,
  chainId: number,
): Promise<DelegationStatus> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: "getDelegationStatus", accountId, chainId },
      (
        res:
          | {
              success: true;
              delegate: Address | null;
              source: "onchain" | "default" | "none";
              needsAuthorization: boolean;
              onchainDelegate: Address | null;
              customDelegate: Address | null;
            }
          | { success: false; error: string }
          | undefined,
      ) => {
        if (!res || !res.success) {
          resolve({
            loading: false,
            delegate: null,
            source: null,
            onchainDelegate: null,
            customDelegate: null,
            needsAuthorization: false,
            error: res && !res.success ? res.error : "Failed to resolve",
          });
          return;
        }
        resolve({
          loading: false,
          delegate: res.delegate,
          source: res.source,
          onchainDelegate: res.onchainDelegate,
          customDelegate: res.customDelegate,
          needsAuthorization: res.needsAuthorization,
        });
      },
    );
  });
}

function shortAddress(addr: Address | null): string {
  if (!addr) return "Not delegated";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function sourceLabel(status: DelegationStatus): string | null {
  const onchain = status.onchainDelegate?.toLowerCase();
  if (onchain) {
    if (onchain === EIP_7702_DEFAULT_DELEGATE.toLowerCase()) {
      return "WalletChan default";
    }
    const custom = status.customDelegate?.toLowerCase();
    if (custom && custom === onchain) return "Custom";
    // External delegate: distinguish "we can keep using it" (it implements
    // ERC-7821 — resolver returns source: "onchain", needsAuthorization:
    // false) from "we'll replace it" (it doesn't — resolver returns source:
    // "default", needsAuthorization: true, onchainDelegate populated). The
    // second case can surprise the user when the next batch flips their
    // delegation, so call it out explicitly.
    if (status.source === "default" && status.needsAuthorization) {
      return "External · replaced on next batch";
    }
    return "External (set elsewhere)";
  }
  if (status.source === "default") {
    return "Not delegated · default on next batch";
  }
  // Custom chains without a WalletChan default: the headline address line
  // already says "Not delegated", so don't repeat it on the second line.
  return null;
}

interface Props {
  accountId: string;
  accountAddress: string;
}

export default function SmartAccountSection({ accountId, accountAddress }: Props) {
  const { networksInfo } = useNetworks();
  const [statuses, setStatuses] = useState<Record<number, DelegationStatus>>({});
  const [editingChain, setEditingChain] = useState<number | null>(null);
  // Collapsed by default — most users won't touch this. The header row stays
  // visible so they know the feature exists, and the chain list expands on tap.
  const [isExpanded, setIsExpanded] = useState(false);

  // The 8 built-in 7702 chains are always in the table. Every non-hidden
  // chain in the user's networksInfo joins them (covers custom EVM chains).
  // We also keep any chain with a stored customDelegate that's no longer in
  // networksInfo, so the user can still revoke leftovers. The list is
  // derived once per change rather than per status refresh so the fetch
  // effect doesn't oscillate when statuses arrive.
  // Map of chainId → display name for every chain in networksInfo (covers
  // custom EVM chains the user added; built-in chains fall back through
  // CHAIN_REGISTRY at render). Built once per networksInfo change.
  const chainNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const c of getResolvedChains(networksInfo)) {
      map.set(c.chainId, c.name);
    }
    return map;
  }, [networksInfo]);

  const networkChainIds = useMemo(() => {
    return getResolvedChains(networksInfo)
      .filter((c) => !c.hidden)
      .map((c) => c.chainId);
  }, [networksInfo]);

  const chainIds = useMemo(() => {
    const set = new Set<number>(EIP7702_SUPPORTED_CHAIN_IDS);
    for (const cid of networkChainIds) set.add(cid);
    for (const [cid, s] of Object.entries(statuses)) {
      if (s.customDelegate) set.add(Number(cid));
    }
    return Array.from(set);
  }, [networkChainIds, statuses]);

  // Lazy load — only fan out the per-chain status fetches when the user
  // expands the section. Avoids the RPC fan-out on every Account Settings
  // open when most users won't touch this. Depends on the stable
  // `networkChainIds` (not the wider `chainIds`, which re-derives off
  // `statuses` and would cause feedback loops) plus the built-in 7702 set.
  useEffect(() => {
    if (!isExpanded) return;
    let cancelled = false;
    (async () => {
      const initialIds = Array.from(
        new Set<number>([
          ...EIP7702_SUPPORTED_CHAIN_IDS,
          ...networkChainIds,
        ]),
      );
      const results = await Promise.all(
        initialIds.map(async (cid) => ({
          chainId: cid,
          status: await fetchStatus(accountId, cid),
        })),
      );
      if (cancelled) return;
      setStatuses((prev) => {
        const next = { ...prev };
        for (const r of results) next[r.chainId] = r.status;
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [accountId, isExpanded, networkChainIds]);

  return (
    <VStack spacing={2} align="stretch">
      <Box
        as="button"
        type="button"
        onClick={() => setIsExpanded((v) => !v)}
        textAlign="left"
        w="full"
        cursor="pointer"
        _hover={{ "& > .chevron": { color: "text.primary" } }}
      >
        <HStack spacing={1} align="center">
          {isExpanded ? (
            <ChevronDownIcon
              className="chevron"
              boxSize="14px"
              color="text.tertiary"
            />
          ) : (
            <ChevronRightIcon
              className="chevron"
              boxSize="14px"
              color="text.tertiary"
            />
          )}
          <Text
            fontSize="2xs"
            fontWeight="700"
            color="text.tertiary"
            textTransform="uppercase"
            letterSpacing="wider"
          >
            Smart Account (EIP-7702)
          </Text>
        </HStack>
      </Box>

      <Collapse in={isExpanded} animateOpacity unmountOnExit>
        <VStack spacing={2} align="stretch">
          <Text fontSize="2xs" color="text.secondary" lineHeight="short">
            Delegate to a smart contract so your account can execute atomic
            batches. Configure once per chain; subsequent batches reuse it for
            free.
          </Text>

          <VStack spacing={1} align="stretch">
            {chainIds.map((chainId) => {
          const status = statuses[chainId];
          // Prefer the user's configured chain name (covers custom EVM
          // chains, which CHAIN_REGISTRY doesn't carry). Falls back to the
          // built-in registry, then a `Chain <id>` placeholder for chains
          // that aren't in either source (leftover customDelegate cleanup).
          const displayName =
            chainNameById.get(chainId) ||
            CHAIN_REGISTRY.find((c) => c.chainId === chainId)?.name ||
            `Chain ${chainId}`;
          return (
            <HStack
              key={chainId}
              spacing={2}
              p={2}
              bg="surface.raised"
              border="1.5px solid"
              borderColor="border.subtle"
              borderRadius="md"
              align="center"
            >
              {/* ChainIcon paints a light chip behind dark-glyph SVGs in
                  Midnight (MegaETH, Mantle, …) so they don't vanish on dark
                  surfaces — matches every other chain-row in the app. */}
              <ChainIcon
                chainId={chainId}
                chainName={displayName}
                size="18px"
                withChip
              />
              <VStack spacing={0} align="flex-start" flex="1" minW={0}>
                <Text fontSize="xs" fontWeight="800" color="text.primary">
                  {displayName}
                </Text>
                {status?.loading || !status ? (
                  <Spinner size="2xs" />
                ) : (
                  <VStack spacing={0} align="flex-start" minW={0}>
                    <Text
                      fontSize="2xs"
                      fontFamily="mono"
                      color="text.secondary"
                      noOfLines={1}
                    >
                      {shortAddress(status.onchainDelegate)}
                    </Text>
                    {sourceLabel(status) && (
                      <Text
                        fontSize="2xs"
                        color="text.tertiary"
                        lineHeight="short"
                      >
                        {sourceLabel(status)}
                      </Text>
                    )}
                  </VStack>
                )}
              </VStack>
              <Button
                size="xs"
                variant="secondary"
                onClick={() => setEditingChain(chainId)}
                isDisabled={!status || status.loading}
                flexShrink={0}
              >
                Edit
              </Button>
            </HStack>
          );
        })}
          </VStack>
        </VStack>
      </Collapse>

      {editingChain !== null && (
        <EditDelegateModal
          isOpen
          accountId={accountId}
          accountAddress={accountAddress as Address}
          chainId={editingChain}
          currentStatus={statuses[editingChain]}
          onClose={() => setEditingChain(null)}
        />
      )}
    </VStack>
  );
}
