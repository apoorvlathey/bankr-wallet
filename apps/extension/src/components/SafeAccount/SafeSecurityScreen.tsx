import { ExternalLinkIcon } from "@chakra-ui/icons";
import { Badge, Box, Button, HStack, Link, Spinner, Text, VStack } from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import type { Account, SafeAccount } from "@/chrome/types";
import type { SafeAccountRecord } from "@/chrome/safe/types";
import { CHAIN_REGISTRY } from "@/constants/chainRegistry";
import { CopyButton } from "@/components/CopyButton";
import { AppHeader, AppScreen, ScreenBody, ScreenSection } from "@/components/ui";
import { SafeCapabilityBadge } from "./SafeCapabilityBadge";

export function SafeSecurityScreen({ account, onBack, onRemoved }: { account: SafeAccount; onBack: () => void; onRemoved: () => void | Promise<void> }) {
  const [record, setRecord] = useState<SafeAccountRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const load = useCallback(() => chrome.runtime.sendMessage({ type: "getSafeAccounts" }, (records: SafeAccountRecord[]) => setRecord((records || []).find((item) => item.accountId === account.id) ?? null)), [account.id]);
  useEffect(() => {
    load();
    chrome.runtime.sendMessage({ type: "getAccounts" }, (value: Account[]) => setAccounts(Array.isArray(value) ? value : []));
  }, [load]);
  async function refresh() {
    setBusy(true); setError(null);
    const response = await chrome.runtime.sendMessage({ type: "refreshSafeAccount", accountId: account.id });
    if (!response?.success) setError(response?.error || "Could not refresh Safe");
    load(); setBusy(false);
  }
  async function remove() {
    if (!globalThis.confirm("Remove this Safe from WalletChan? Published proposals and onchain Safe data will not be deleted.")) return;
    setBusy(true); setError(null);
    const response = await chrome.runtime.sendMessage({ type: "removeAccount", accountId: account.id });
    if (!response?.success) { setError(response?.error || "Could not remove Safe"); setBusy(false); return; }
    await onRemoved();
  }
  return <AppScreen><AppHeader title="Safe security" onBack={onBack} /><ScreenBody pt={5}>
    {!record ? <Spinner alignSelf="center" /> : <VStack align="stretch" spacing={5}>
      <HStack><Text fontFamily="mono" fontSize="sm" flex={1}>{account.address}</Text><CopyButton value={account.address} /></HStack>
      {Object.values(record.chains).map((snapshot) => {
        const chain = CHAIN_REGISTRY.find((item) => item.chainId === snapshot.chainId);
        return <ScreenSection key={snapshot.chainId} title={chain?.name || `Chain ${snapshot.chainId}`} description={`Verified at block ${snapshot.verifiedAtBlock}`}>
          <VStack align="stretch" spacing={3} p={3} bg="surface.raised" borderRadius="md">
            <HStack justify="space-between"><Text fontWeight="700">{snapshot.threshold} of {snapshot.owners.length} owners</Text><SafeCapabilityBadge capability={snapshot.capability} /></HStack>
            {snapshot.owners.map((owner) => {
              const linked = accounts.filter((candidate) => candidate.address.toLowerCase() === owner && ["bankr", "privateKey", "seedPhrase"].includes(candidate.type));
              return <HStack key={owner}><Box flex={1} minW={0}><Text fontFamily="mono" fontSize="xs" noOfLines={1}>{owner}</Text><Text fontSize="xs" color="fg.secondary">{snapshot.contractOwners.includes(owner) ? "Contract owner · unsupported" : linked.length ? linked.map((candidate) => candidate.displayName || candidate.type).join(" · ") : "External owner"}</Text></Box><CopyButton value={owner} />{chain && <Link href={`${chain.explorer}/address/${owner}`} isExternal aria-label="View owner on explorer"><ExternalLinkIcon /></Link>}</HStack>;
            })}
            <Text fontSize="xs" color="fg.secondary">Safe {snapshot.version} · nonce {snapshot.nonce}</Text>
            <HStack><Text fontSize="xs" color="fg.secondary" flex={1}>Singleton {snapshot.singleton}</Text><CopyButton value={snapshot.singleton} />{chain && <Link href={`${chain.explorer}/address/${snapshot.singleton}`} isExternal aria-label="View singleton on explorer"><ExternalLinkIcon /></Link>}</HStack>
            <HStack><Badge>Modules {snapshot.modules.length}</Badge><Badge>Guard {snapshot.guard.endsWith("0000000000000000000000000000000000000000") ? "none" : "set"}</Badge><Badge>Fallback {snapshot.fallbackHandler.endsWith("0000000000000000000000000000000000000000") ? "none" : "set"}</Badge></HStack>
            {snapshot.blockedReason && <Text color="status.warning.fg" fontSize="sm">{snapshot.blockedReason}</Text>}
            {chain && <Link href={`https://app.safe.global/home?safe=${snapshot.chainId}:${account.address}`} isExternal fontSize="sm" color="accent.secondary">Open in Safe Wallet <ExternalLinkIcon mx={1} /></Link>}
          </VStack>
        </ScreenSection>;
      })}
      {error && <Text color="chart.negative" fontSize="sm">{error}</Text>}
      <Button variant="secondary" isLoading={busy} onClick={() => void refresh()}>Refresh onchain state</Button>
      <Box pt={4} borderTop="1px solid" borderColor="border.subtle"><Button colorScheme="red" variant="outline" isLoading={busy} onClick={() => void remove()}>Remove Safe</Button></Box>
    </VStack>}
  </ScreenBody></AppScreen>;
}
