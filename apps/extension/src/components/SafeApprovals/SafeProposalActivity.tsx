import { Box } from "@chakra-ui/react";
import { Fragment, useEffect, useMemo, useState } from "react";
import type { SafeProposalRecord } from "@/chrome/safe/types";
import type { Account } from "@/chrome/types";
import { ActivityDateHeader } from "@/components/Activity/ActivityDateHeader";
import { buildActivityAddressLabels } from "@/components/Activity/activityIdentityModel";
import { groupActivityByDate } from "@/components/Activity/activityModel";
import { ListSurface } from "@/components/ui";
import { useNetworks } from "@/contexts/NetworksContext";
import { useAddressContacts } from "@/hooks/useAddressContacts";
import { useDappOriginFormatter } from "@/hooks/useDappOriginDisplay";
import { getResolvedChainById } from "@/lib/chains";
import { SafeProposalActivityRow } from "./SafeProposalActivityRow";
import { getSafeProposalRequestOrigin } from "./safeProposalActivityModel";
import { sortSafeProposalsByNonceDescending } from "./safeProposalOrdering";

export function SafeProposalActivity({
  safeAccountId,
  accounts,
  filterChainId,
  onOpen,
  onVisibilityChange,
}: {
  safeAccountId: string;
  accounts: Account[];
  filterChainId: number | null;
  onOpen: (proposalId: string) => void;
  onVisibilityChange?: (visible: boolean) => void;
}) {
  const [records, setRecords] = useState<SafeProposalRecord[]>([]);
  const { networksInfo } = useNetworks();
  const { contacts } = useAddressContacts();
  const formatOrigin = useDappOriginFormatter();

  useEffect(() => {
    let active = true;
    const load = () => chrome.runtime.sendMessage(
      { type: "getSafeProposals" },
      (response) => {
        if (!active || chrome.runtime.lastError) return;
        setRecords(
          response?.success && Array.isArray(response.result)
            ? response.result
            : [],
        );
      },
    );
    load();
    const listener = (message: { type?: string }) => {
      if (message.type === "safeProposalsUpdated") load();
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      active = false;
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  const visible = useMemo(
    () => sortSafeProposalsByNonceDescending(
      records.filter((item) =>
        item.safeAccountId === safeAccountId &&
        !item.hiddenAt &&
        (!filterChainId || item.chainId === filterChainId)),
    ),
    [filterChainId, records, safeAccountId],
  );
  const displayRecords = useMemo(() => visible.slice(0, 20), [visible]);
  const dateGroups = useMemo(
    () => groupActivityByDate(displayRecords, new Date()),
    [displayRecords],
  );
  const addressLabels = useMemo(
    () => buildActivityAddressLabels(accounts, contacts),
    [accounts, contacts],
  );

  useEffect(() => {
    onVisibilityChange?.(visible.length > 0);
  }, [onVisibilityChange, visible.length]);

  if (visible.length === 0) return null;

  return (
    <Box mb={3}>
      <ListSurface aria-label="Safe proposal activity">
        {dateGroups.map((group) => (
          <Fragment key={group.label}>
            <ActivityDateHeader label={group.label} />
            {group.txs.map((proposal) => {
              const chain = getResolvedChainById(proposal.chainId, networksInfo);
              const chainName = chain?.name ?? `Chain ${proposal.chainId}`;
              const origin = getSafeProposalRequestOrigin(proposal.route.origin);
              return (
                <SafeProposalActivityRow
                  key={proposal.id}
                  proposal={proposal}
                  chainName={chainName}
                  nativeSymbol={chain?.nativeCurrency.symbol}
                  nativeDecimals={chain?.nativeCurrency.decimals}
                  addressLabels={addressLabels}
                  originDisplay={formatOrigin(origin)}
                  onOpen={() => onOpen(proposal.id)}
                />
              );
            })}
          </Fragment>
        ))}
      </ListSurface>
    </Box>
  );
}
