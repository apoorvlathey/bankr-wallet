import { RepeatIcon } from "@chakra-ui/icons";
import {
  Box, HStack, IconButton, Spinner, Text, VStack,
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Account, SafeAccount } from "@/chrome/types";
import type { SafeAccountRecord, SafeProposalRecord } from "@/chrome/safe/types";
import { isPendingSafeProposal } from "@/chrome/safe/proposalStatus";
import { AppHeader, AppScreen, ListSurface, ScreenBody } from "@/components/ui";
import AccountSettingsIdentity from "@/components/AccountSettingsIdentity";
import { buildActivityAddressLabels } from "@/components/Activity/activityIdentityModel";
import { SafeIcon } from "@/components/shared/AccountTypeIcons";
import { useNetworks } from "@/contexts/NetworksContext";
import { useAddressContacts } from "@/hooks/useAddressContacts";
import { getResolvedChainById } from "@/lib/chains";
import { SafeProposalConfirmation } from "./SafeProposalConfirmation";
import { SafeProposalRow } from "./SafeProposalRow";
import { didSafeProposalExecutionConfirm } from "./safeProposalActionModel";
import { sortSafeProposalsByNonceDescending } from "./safeProposalOrdering";
import { getSafeProposalBlockingNonce } from "./safeProposalSequence";

function send<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage(message, (response: T) => {
    const error = chrome.runtime.lastError;
    if (error) reject(new Error(error.message)); else resolve(response);
  }));
}
function unnamedAccountLabel(account: Account) {
  if (account.type === "bankr") return "Bankr account";
  if (account.type === "privateKey") return "Private key account";
  if (account.type === "seedPhrase") return `Seed account ${account.derivationIndex + 1}`;
  if (account.type === "safe") return "Safe account";
  return "View-only account";
}
function SafeRequestsTitle() {
  return (
    <HStack as="span" display="inline-flex" spacing={2} minW={0}>
      <SafeIcon boxSize="22px" color="status.success.emphasis" />
      <Text as="span" fontSize="inherit" fontWeight="inherit" lineHeight="inherit">
        Safe Requests
      </Text>
    </HStack>
  );
}

export default function SafeApprovalsScreen({ safeAccount, chainId, accounts, initialProposalId, onBack, onProposalBack, onExecutionSubmitted, onExecutionConfirmed }: { safeAccount: SafeAccount; chainId: number; accounts: Account[]; initialProposalId?: string | null; onBack: () => void; onProposalBack?: () => void; onExecutionSubmitted: () => void; onExecutionConfirmed: () => void }) {
  const [record, setRecord] = useState<SafeAccountRecord | null>(null);
  const [proposals, setProposals] = useState<SafeProposalRecord[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const previousProposalRef = useRef<Pick<SafeProposalRecord, "id" | "state"> | null>(null);
  const { networksInfo } = useNetworks();
  const { contacts } = useAddressContacts();
  const proposal = proposals.find((item) => item.id === selected) ?? null;
  const pendingProposals = useMemo(
    () => proposals.filter(isPendingSafeProposal),
    [proposals],
  );
  const effectiveChainId = proposal?.chainId ?? chainId;
  const snapshot = record?.chains[String(effectiveChainId)];
  const chain = getResolvedChainById(effectiveChainId, networksInfo);
  const firstVerifiedChainId = record
    ? Number(Object.keys(record.chains)[0])
    : effectiveChainId;
  const identityChain = getResolvedChainById(
    record?.chains[String(chainId)] ? chainId : firstVerifiedChainId,
    networksInfo,
  );
  const load = useCallback(async () => {
    const [safeRecords, proposalResponse] = await Promise.all([
      send<SafeAccountRecord[]>({ type: "getSafeAccounts" }),
      send<{ success: boolean; result?: SafeProposalRecord[]; error?: string }>({ type: "getSafeProposals" }),
    ]);
    setRecord(safeRecords.find((item) => item.accountId === safeAccount.id) ?? null);
    if (!proposalResponse.success) throw new Error(proposalResponse.error || "Could not load Safe proposals");
    setProposals(sortSafeProposalsByNonceDescending(
      (proposalResponse.result || []).filter((item) =>
        item.safeAccountId === safeAccount.id && !item.hiddenAt),
    ));
  }, [safeAccount.id]);
  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await send<{ success: boolean; error?: string }>({
        type: "syncSafeRequests",
        accountId: safeAccount.id,
      });
      if (!response.success) throw new Error(response.error || "Could not reload Safe requests");
      await load();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reload Safe requests");
    } finally {
      setRefreshing(false);
    }
  }, [load, safeAccount.id]);
  useEffect(() => { void load().catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load Safe")); }, [load]);
  useEffect(() => {
    const listener = (message: { type?: string }) => {
      if (message.type === "safeProposalsUpdated") {
        void load().catch(() => undefined);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [load]);
  useEffect(() => {
    if (initialProposalId) setSelected(initialProposalId);
  }, [initialProposalId]);
  useEffect(() => {
    const current = proposal
      ? { id: proposal.id, state: proposal.state }
      : null;
    const previous = previousProposalRef.current;
    previousProposalRef.current = current;
    if (didSafeProposalExecutionConfirm(previous, current)) {
      onExecutionConfirmed();
    }
  }, [onExecutionConfirmed, proposal]);
  const addressLabels = useMemo(() => {
    const labels = new Map(buildActivityAddressLabels(accounts, contacts));
    for (const account of accounts) {
      const address = account.address.toLowerCase();
      if (!labels.has(address)) labels.set(address, unnamedAccountLabel(account));
    }
    labels.set(safeAccount.address.toLowerCase(), "This Safe");
    return labels;
  }, [accounts, contacts, safeAccount.address]);

  const reloadButton = (
    <IconButton
      aria-label={refreshing ? "Reloading Safe requests" : "Reload Safe requests"}
      title="Reload Safe requests"
      icon={<RepeatIcon boxSize={5} />}
      variant="ghost"
      minW="44px"
      w="44px"
      h="44px"
      isLoading={refreshing}
      onClick={() => void refresh()}
    />
  );

  if (!record) return <AppScreen><AppHeader title={<SafeRequestsTitle />} trailing={reloadButton} onBack={onBack} /><ScreenBody display="flex" alignItems="center" justifyContent="center">{error ? <Text color="status.error.emphasis" fontSize="sm">{error}</Text> : <Spinner />}</ScreenBody></AppScreen>;
  if (proposal) {
    if (!snapshot) return <AppScreen><AppHeader title="Safe request" onBack={() => setSelected(null)} /><ScreenBody><Text color="fg.secondary">This Safe is not verified on {chain?.name ?? `chain ${effectiveChainId}`}.</Text></ScreenBody></AppScreen>;
    return (
      <SafeProposalConfirmation
        safeAccount={safeAccount}
        proposal={proposal}
        snapshot={snapshot}
        accounts={accounts}
        chainName={chain?.name ?? `Chain ${effectiveChainId}`}
        explorer={chain?.explorer}
        backLabel={onProposalBack ? "Back to Activity" : undefined}
        onBack={onProposalBack ?? (() => setSelected(null))}
        onOpenProposal={setSelected}
        onReload={load}
        onExecutionSubmitted={onExecutionSubmitted}
      />
    );
  }
  return <AppScreen><AppHeader title={<SafeRequestsTitle />} trailing={reloadButton} onBack={onBack} /><ScreenBody pt={5}><VStack align="stretch" spacing={5}>
    <Box mx={1} pb={4} borderBottom="1px solid" borderColor="border.subtle">
      <AccountSettingsIdentity
        account={safeAccount}
        resolvedName={null}
        resolvedAvatar={null}
        explorerUrl={identityChain ? `${identityChain.explorer}/address/${safeAccount.address}` : undefined}
      />
    </Box>
    {error && <Text color="chart.negative" fontSize="sm">{error}</Text>}
    {pendingProposals.length === 0 ? <Text color="fg.secondary">No pending Safe requests.</Text> : (
      <ListSurface aria-label="Safe requests">
        {pendingProposals.map((item) => {
          const itemSnapshot = record.chains[String(item.chainId)];
          const itemChain = getResolvedChainById(item.chainId, networksInfo);
          const sameNoncePending = pendingProposals.filter((candidate) =>
            candidate.id !== item.id &&
            candidate.chainId === item.chainId &&
            candidate.transaction.nonce === item.transaction.nonce,
          );
          const rejectionPending = item.purpose !== "rejection" &&
            sameNoncePending.some((candidate) => candidate.purpose === "rejection");
          const conflict = sameNoncePending.some((candidate) =>
            candidate.purpose !== "rejection" && item.purpose !== "rejection",
          );
          return (
            <SafeProposalRow
              key={item.id}
              proposal={item}
              blockedByNonce={getSafeProposalBlockingNonce(
                item,
                pendingProposals,
                itemSnapshot?.nonce,
              )}
              chainName={itemChain?.name ?? `Chain ${item.chainId}`}
              nativeSymbol={itemChain?.nativeCurrency.symbol}
              nativeDecimals={itemChain?.nativeCurrency.decimals}
              threshold={itemSnapshot?.threshold}
              conflict={conflict}
              rejectionPending={rejectionPending}
              addressLabels={addressLabels}
              onOpen={() => setSelected(item.id)}
            />
          );
        })}
      </ListSurface>
    )}
  </VStack></ScreenBody></AppScreen>;
}
