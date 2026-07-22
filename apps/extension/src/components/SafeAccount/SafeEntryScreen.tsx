import {
  Alert,
  AlertDescription,
  AlertIcon,
  Box,
  Button,
  Divider,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  Input,
  Spinner,
  Text,
  Tooltip,
  usePrefersReducedMotion,
  VStack,
  Wrap,
  WrapItem,
} from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { KNOWN_CHAINS } from "@/constants/knownChains.generated";
import { AppHeader, AppScreen, ScreenBody, ScreenSection, StickyActionBar } from "@/components/ui";
import type { SafeAccountRecord, SafeChainSnapshot } from "@/chrome/safe/types";
import { SafeOwnerAccountPicker } from "./SafeOwnerAccountPicker";
import { SafeVerificationCard } from "./SafeVerificationCard";
import { DiscoveredSafeRow } from "./DiscoveredSafeRow";
import type { Account } from "@/chrome/types";
import { fetchPortfolio } from "@/chrome/portfolio/api";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChains } from "@/lib/chains";
import ChainIcon from "@/components/ChainIcon";
import { useSafeOwnerDiscovery } from "./useSafeOwnerDiscovery";

interface ProbeResponse {
  address?: `0x${string}`;
  snapshots?: SafeChainSnapshot[];
  verificationIds?: string[];
  failures?: Array<{ chainId: number; chainName: string; error: string }>;
  scannedChainIds?: number[];
  success?: false;
  error?: string;
}

function runtimeMessage<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response: T) => {
      const error = chrome.runtime.lastError;
      if (error) reject(new Error(error.message));
      else resolve(response);
    });
  });
}

export function SafeEntryScreen({
  onBack,
  onAccountAdded,
}: {
  onBack: () => void;
  onAccountAdded: (account: Account) => void;
}) {
  const [address, setAddress] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [probe, setProbe] = useState<ProbeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedOwnerAccountId, setSelectedOwnerAccountId] = useState<string | null>(null);
  const [selectedFromDiscovery, setSelectedFromDiscovery] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [safeRecords, setSafeRecords] = useState<SafeAccountRecord[]>([]);
  const [balances, setBalances] = useState<Record<number, number>>({});
  const manualScanGeneration = useRef(0);
  const verifiedSafeRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const ownerDiscovery = useSafeOwnerDiscovery();
  const { networksInfo } = useNetworks();
  const chainById = useMemo(
    () => new Map([
      ...getResolvedChains(networksInfo).map((chain) => [chain.chainId, { name: chain.name, explorer: chain.explorer }] as const),
      ...Object.values(KNOWN_CHAINS).map((chain) => [chain.chainId, { name: chain.name, explorer: chain.explorer }] as const),
    ]),
    [networksInfo],
  );
  const ownerAccounts = useMemo(
    () => accounts.filter((account) =>
      account.type === "bankr" ||
      account.type === "privateKey" ||
      account.type === "seedPhrase"),
    [accounts],
  );
  const importedSafeAddresses = useMemo(
    () => new Set(safeRecords.map((record) => record.address.toLowerCase())),
    [safeRecords],
  );
  useEffect(() => {
    void runtimeMessage<Account[]>({ type: "getAccounts" }).then(setAccounts).catch(() => undefined);
    void runtimeMessage<SafeAccountRecord[]>({ type: "getSafeAccounts" }).then(setSafeRecords).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!probe?.address || !probe.snapshots?.length) {
      setBalances({});
      return;
    }
    const controller = new AbortController();
    void fetchPortfolio(probe.address, controller.signal).then((portfolio) => {
      const totals: Record<number, number> = {};
      for (const token of portfolio.tokens) totals[token.chainId] = (totals[token.chainId] || 0) + token.valueUsd;
      for (const position of portfolio.defiPositions) totals[position.chainId] = (totals[position.chainId] || 0) + position.valueUsd;
      setBalances(totals);
    }).catch(() => setBalances({}));
    return () => controller.abort();
  }, [probe?.address, probe?.snapshots?.length]);

  useEffect(() => {
    if (!probe?.address || !probe.snapshots?.length) return;
    const frame = requestAnimationFrame(() => {
      verifiedSafeRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [prefersReducedMotion, probe?.address, probe?.snapshots?.length]);

  const alreadyImported = !!probe?.address && safeRecords.some(
    (record) => record.address.toLowerCase() === probe.address?.toLowerCase(),
  );
  const hasDifferentConfigurations = new Set(
    (probe?.snapshots || []).map((snapshot) => snapshot.configEpoch),
  ).size > 1;

  async function scan() {
    const generation = ++manualScanGeneration.current;
    setError(null);
    setProbe(null);
    setIsScanning(true);
    try {
      const result = await runtimeMessage<ProbeResponse>({
        type: "probeSafeAddress",
        address,
      });
      if (result.success === false) throw new Error(result.error || "Safe scan failed");
      if (generation !== manualScanGeneration.current) return;
      setProbe(result);
    } catch (caught) {
      if (generation !== manualScanGeneration.current) return;
      setError(caught instanceof Error ? caught.message : "Safe scan failed");
    } finally {
      if (generation === manualScanGeneration.current) setIsScanning(false);
    }
  }

  // Manual import is intentionally user-initiated, but once the user starts
  // entering a complete address the verified-chain review updates without an
  // extra submit ceremony, matching the established Safe import UX.
  useEffect(() => {
    const candidate = address.trim();
    const match = /(?:^|:)(0x[0-9a-fA-F]{40})$/.exec(candidate);
    if (!match) return;
    if (
      probe?.address?.toLowerCase() === match[1].toLowerCase() &&
      probe.snapshots?.length
    ) {
      return;
    }
    const timer = setTimeout(() => void scan(), 450);
    return () => clearTimeout(timer);
    // scan is keyed to the current address value by construction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address]);

  async function importSafe() {
    if (!probe?.address || !probe.snapshots?.length) return;
    setIsImporting(true);
    setError(null);
    try {
      const result = await runtimeMessage<{ success: boolean; account?: Account; error?: string }>({
        type: "importSafeAccount",
        address: probe.address,
        displayName: displayName.trim() || undefined,
        chainIds: probe.snapshots.map((snapshot) => snapshot.chainId),
        verificationIds: probe.verificationIds,
        importedBy: selectedFromDiscovery ? "ownerDiscovery" : "manual",
      });
      if (!result.success || !result.account) throw new Error(result.error || "Failed to add Safe");
      onAccountAdded(result.account);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to add Safe");
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <AppScreen>
      <AppHeader title="Add Safe" onBack={onBack} />
      <ScreenBody pt={4}>
        <VStack align="stretch" spacing={5}>
          <ScreenSection title="Find by owner">
            <VStack align="stretch" spacing={3}>
              {ownerAccounts.length ? (
                <SafeOwnerAccountPicker
                  accounts={ownerAccounts}
                  selectedAccountId={selectedOwnerAccountId}
                  onSelect={(accountId) => {
                    manualScanGeneration.current += 1;
                    setAddress("");
                    setProbe(null);
                    setError(null);
                    setIsScanning(false);
                    setSelectedFromDiscovery(false);
                    setSelectedOwnerAccountId(accountId);
                    void ownerDiscovery.discover(accountId);
                  }}
                />
              ) : (
                <Alert status="info">
                  <AlertIcon />
                  <AlertDescription fontSize="sm">
                    Add a Bankr, private-key, or seed-phrase account to search by owner.
                  </AlertDescription>
                </Alert>
              )}
              {ownerDiscovery.isDiscovering && (
                <HStack
                  w="full"
                  justify="center"
                  color="fg.secondary"
                  spacing={2}
                  py={1}
                  role="status"
                  aria-live="polite"
                >
                  <Spinner size="sm" />
                  <Text fontSize="sm">
                    {ownerDiscovery.progress
                      ? `Checked ${ownerDiscovery.progress.scanned} of ${ownerDiscovery.progress.total} networks…`
                      : "Finding Safes…"}
                  </Text>
                </HStack>
              )}
              {ownerDiscovery.error && (
                <Alert status="error">
                  <AlertIcon />
                  <AlertDescription fontSize="sm">
                    {ownerDiscovery.error}
                  </AlertDescription>
                </Alert>
              )}
              {ownerDiscovery.isComplete &&
                !ownerDiscovery.error &&
                ownerDiscovery.discovered.length === 0 && (
                <Alert status="info">
                  <AlertIcon />
                  <AlertDescription fontSize="sm">
                    No verified Safes were found for this account.
                  </AlertDescription>
                </Alert>
              )}
            </VStack>
          </ScreenSection>
          {ownerDiscovery.discovered.map((candidate) => (
            <DiscoveredSafeRow
              key={candidate.address}
              candidate={candidate}
              chainById={chainById}
              isAlreadyAdded={importedSafeAddresses.has(candidate.address.toLowerCase())}
              onSelect={() => {
                setAddress(candidate.address);
                setProbe(candidate);
                setSelectedFromDiscovery(true);
              }}
            />
          ))}

          {!selectedOwnerAccountId && (
            <>
              <HStack spacing={3} color="fg.muted" aria-hidden="true">
                <Divider borderColor="border.subtle" />
                <Text fontSize="xs" lineHeight="1" textTransform="lowercase">or</Text>
                <Divider borderColor="border.subtle" />
              </HStack>

              <ScreenSection
                title="Enter Safe address"
                description="Paste an address to check it across chains."
              >
                <VStack align="stretch" spacing={3}>
                  <FormControl isInvalid={!!error}>
                    <FormLabel>Safe address</FormLabel>
                    <Input
                      fontFamily="mono"
                      value={address}
                      placeholder="0x… or 5042:0x…"
                      onChange={(event) => {
                        setAddress(event.target.value);
                        setProbe(null);
                        setSelectedFromDiscovery(false);
                        setError(null);
                      }}
                    />
                    <FormErrorMessage>{error}</FormErrorMessage>
                  </FormControl>
                  <Button variant="secondary" onClick={() => void scan()} isLoading={isScanning} isDisabled={!address.trim()}>
                    Find Safe
                  </Button>
                  {isScanning && (
                    <HStack
                      w="full"
                      justify="center"
                      color="fg.secondary"
                      spacing={2}
                      py={1}
                      role="status"
                      aria-live="polite"
                    >
                      <Spinner size="sm" />
                      <Text fontSize="sm">Checking networks…</Text>
                    </HStack>
                  )}
                </VStack>
              </ScreenSection>
            </>
          )}

          {probe && !probe.snapshots?.length && (
            <Alert status="warning"><AlertIcon /><AlertDescription>No verified Safe was found on the scanned networks.</AlertDescription></Alert>
          )}
          {!!probe?.failures?.length && (
            <Text color="status.warning.fg" fontSize="xs">
              {probe.failures.length} of {probe.scannedChainIds?.length ?? probe.failures.length} networks were unavailable or did not contain a supported Safe.
            </Text>
          )}
          {!!probe?.snapshots?.length && probe.address && (
            <ScreenSection
              ref={verifiedSafeRef}
              title="Verified Safe"
              headerAction={(
                <Wrap spacing={1.5} justify="flex-end">
                  {probe.snapshots.map((snapshot) => {
                    const chain = chainById.get(snapshot.chainId);
                    const chainName = chain?.name || `Chain ${snapshot.chainId}`;
                    return (
                      <WrapItem key={snapshot.chainId}>
                        <Tooltip label={chainName} hasArrow openDelay={250}>
                          <Box aria-label={chainName}>
                            <ChainIcon
                              chainId={snapshot.chainId}
                              chainName={chainName}
                              size="22px"
                              withChip
                            />
                          </Box>
                        </Tooltip>
                      </WrapItem>
                    );
                  })}
                </Wrap>
              )}
            >
              <VStack align="stretch" spacing={3}>
                {hasDifferentConfigurations && (
                  <Alert status="warning"><AlertIcon /><AlertDescription fontSize="sm">This address has different owners, threshold, or security configuration across networks. Review each chain independently.</AlertDescription></Alert>
                )}
                {probe.snapshots.map((snapshot) => {
                  const chain = chainById.get(snapshot.chainId);
                  return (
                    <SafeVerificationCard
                      key={snapshot.chainId}
                      snapshot={snapshot}
                      chain={chain}
                      safeAddress={probe.address!}
                      balanceUsd={balances[snapshot.chainId]}
                      accounts={accounts}
                      isAlreadyAdded={alreadyImported}
                    />
                  );
                })}
                <FormControl>
                  <FormLabel>Safe name (optional)</FormLabel>
                  <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} maxLength={64} placeholder="Treasury Safe" />
                </FormControl>
              </VStack>
            </ScreenSection>
          )}
        </VStack>
      </ScreenBody>
      {!!probe?.snapshots?.length && (
        <StickyActionBar primaryAction={<Button variant="brand" isLoading={isImporting} isDisabled={alreadyImported} onClick={() => void importSafe()}>{alreadyImported ? "Already added" : probe.snapshots.every((item) => item.capability === "blocked") ? "Add as observe-only" : "Add Safe"}</Button>} />
      )}
    </AppScreen>
  );
}
