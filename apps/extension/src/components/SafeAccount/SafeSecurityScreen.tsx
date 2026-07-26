import { CheckIcon, DeleteIcon, RepeatIcon } from "@chakra-ui/icons";
import {
  Alert,
  AlertIcon,
  Box,
  Button,
  FormControl,
  HStack,
  Input,
  Spinner,
  VStack,
} from "@chakra-ui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import type { Account, SafeAccount } from "@/chrome/types";
import type { SafeAccountRecord } from "@/chrome/safe/types";
import AccountSettingsIdentity from "@/components/AccountSettingsIdentity";
import {
  AppHeader,
  AppScreen,
  ListItem,
  ListItemContent,
  ListItemDescription,
  ListItemMedia,
  ListItemTitle,
  ListSurface,
  ScreenBody,
  ScreenSection,
} from "@/components/ui";
import { CHAIN_REGISTRY } from "@/constants/chainRegistry";
import { useThemedToast } from "@/hooks/useThemedToast";
import { SafeChainSettingsAccordion, SafeChainSettingsSection } from "./SafeChainSettingsSection";
import { SafeRemoveDialog } from "./SafeRemoveDialog";

export function SafeSecurityScreen({
  account,
  onBack,
  onAccountUpdated,
  onRemoved,
}: {
  account: SafeAccount;
  onBack: () => void;
  onAccountUpdated: () => void | Promise<void>;
  onRemoved: () => void | Promise<void>;
}) {
  const toast = useThemedToast();
  const [record, setRecord] = useState<SafeAccountRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);
  const [displayName, setDisplayName] = useState(account.displayName || "");
  const [savedDisplayName, setSavedDisplayName] = useState(account.displayName || "");
  const [isSavingName, setIsSavingName] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const load = useCallback(() => {
    chrome.runtime.sendMessage({ type: "getSafeAccounts" }, (records: SafeAccountRecord[]) => {
      setRecord((records || []).find((item) => item.accountId === account.id) ?? null);
      setIsLoading(false);
    });
  }, [account.id]);

  useEffect(() => {
    load();
    chrome.runtime.sendMessage({ type: "getAccounts" }, (value: Account[]) => {
      setAccounts(Array.isArray(value) ? value : []);
    });
  }, [load]);

  useEffect(() => {
    const nextName = account.displayName || "";
    setDisplayName(nextName);
    setSavedDisplayName(nextName);
  }, [account.displayName]);

  const snapshots = useMemo(
    () => record ? Object.values(record.chains).sort((left, right) => left.chainId - right.chainId) : [],
    [record],
  );
  const firstChain = CHAIN_REGISTRY.find((item) => item.chainId === snapshots[0]?.chainId);
  const displayNameDirty = displayName.trim() !== savedDisplayName;
  const displayAccount = useMemo(
    () => ({ ...account, displayName: savedDisplayName || undefined }),
    [account, savedDisplayName],
  );

  function saveDisplayName() {
    const trimmedName = displayName.trim();
    if (trimmedName === savedDisplayName) return;

    setIsSavingName(true);
    chrome.runtime.sendMessage(
      {
        type: "updateAccountDisplayName",
        accountId: account.id,
        displayName: trimmedName || undefined,
      },
      async (result: { success: boolean; error?: string }) => {
        setIsSavingName(false);
        if (result.success) {
          setDisplayName(trimmedName);
          setSavedDisplayName(trimmedName);
          toast({ title: "Display name updated", status: "success", duration: 2000 });
          await onAccountUpdated();
          return;
        }
        toast({
          title: "Failed to update",
          description: result.error,
          status: "error",
          duration: 3000,
        });
      },
    );
  }

  async function refresh() {
    setIsRefreshing(true);
    setError(null);
    const response = await chrome.runtime.sendMessage({
      type: "refreshSafeAccount",
      accountId: account.id,
    }) as {
      success?: boolean;
      newChainIds?: number[];
      discoveryFailureCount?: number;
      discoveryError?: string;
      error?: string;
    };
    if (!response?.success) {
      setError(response?.error || "Could not refresh Safe");
    } else if (response.newChainIds?.length) {
      toast({
        title: "Safe networks updated",
        description: `Added ${response.newChainIds.length} newly deployed ${response.newChainIds.length === 1 ? "network" : "networks"}.`,
        status: "success",
        duration: 3500,
      });
    } else if (response.discoveryError || response.discoveryFailureCount) {
      toast({
        title: "Known networks refreshed",
        description: response.discoveryError || `${response.discoveryFailureCount} networks could not be checked for new deployments.`,
        status: "warning",
        duration: 4000,
      });
    } else {
      toast({
        title: "Safe networks refreshed",
        description: "No new deployments found.",
        status: "success",
        duration: 2500,
      });
    }
    load();
    setIsRefreshing(false);
  }

  async function remove() {
    setIsRemoving(true);
    setError(null);
    const response = await chrome.runtime.sendMessage({ type: "removeAccount", accountId: account.id });
    if (!response?.success) {
      setError(response?.error || "Could not remove Safe");
      setIsRemoving(false);
      setIsRemoveOpen(false);
      return;
    }
    await onRemoved();
  }

  return (
    <>
      <AppScreen>
        <AppHeader title="Account settings" onBack={onBack} />
        <ScreenBody pt={5}>
          {isLoading ? (
            <Box display="grid" minH="240px" placeItems="center">
              <Spinner aria-label="Loading Safe settings" />
            </Box>
          ) : (
            <VStack align="stretch" spacing={6}>
              <Box pb={5} borderBottom="1px solid" borderColor="border.subtle">
                <AccountSettingsIdentity
                  account={displayAccount}
                  resolvedName={null}
                  resolvedAvatar={null}
                  explorerUrl={firstChain ? `${firstChain.explorer}/address/${account.address}` : undefined}
                />
              </Box>

              <ScreenSection title="Account name" description="Shown throughout WalletChan.">
                <FormControl>
                  <HStack spacing={2}>
                    <Input
                      aria-label="Display name"
                      value={displayName}
                      onChange={(event) => setDisplayName(event.target.value)}
                      placeholder="Enter a name"
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && displayNameDirty && !isSavingName) {
                          saveDisplayName();
                        }
                      }}
                    />
                    {displayNameDirty && (
                      <Button
                        variant="brand"
                        onClick={saveDisplayName}
                        isLoading={isSavingName}
                        minW="76px"
                        leftIcon={<CheckIcon />}
                      >
                        Save
                      </Button>
                    )}
                  </HStack>
                </FormControl>
              </ScreenSection>

              {snapshots.length === 1 ? (
                <SafeChainSettingsSection
                  snapshot={snapshots[0]}
                  chain={CHAIN_REGISTRY.find((item) => item.chainId === snapshots[0].chainId)}
                  safeAddress={account.address}
                  accounts={accounts}
                />
              ) : snapshots.length > 1 ? (
                <SafeChainSettingsAccordion
                  snapshots={snapshots}
                  chains={CHAIN_REGISTRY}
                  safeAddress={account.address}
                  accounts={accounts}
                />
              ) : (
                <Alert status="warning" alignItems="start">
                  <AlertIcon />
                  Safe verification data is unavailable. Refresh the onchain state to try again.
                </Alert>
              )}

              {error && (
                <Alert status="error" alignItems="start">
                  <AlertIcon />
                  {error}
                </Alert>
              )}

              <ScreenSection title="Account tools">
                <ListSurface>
                  <ListItem interactive onClick={() => void refresh()} isDisabled={isRefreshing}>
                    <ListItemMedia><RepeatIcon boxSize={5} /></ListItemMedia>
                    <ListItemContent>
                      <ListItemTitle>{isRefreshing ? "Refreshing Safe details…" : "Refresh Safe details"}</ListItemTitle>
                      <ListItemDescription>Update owners and settings, and find deployments on new networks.</ListItemDescription>
                    </ListItemContent>
                  </ListItem>
                </ListSurface>
              </ScreenSection>

              <ScreenSection title="Sensitive actions">
                <ListSurface>
                  <ListItem interactive onClick={() => setIsRemoveOpen(true)}>
                    <ListItemMedia><DeleteIcon color="status.error.emphasis" boxSize={5} /></ListItemMedia>
                    <ListItemContent>
                      <ListItemTitle color="status.error.emphasis">Remove Safe</ListItemTitle>
                      <ListItemDescription>Remove this Safe account from WalletChan</ListItemDescription>
                    </ListItemContent>
                  </ListItem>
                </ListSurface>
              </ScreenSection>
            </VStack>
          )}
        </ScreenBody>
      </AppScreen>

      <SafeRemoveDialog
        address={account.address}
        isOpen={isRemoveOpen}
        isRemoving={isRemoving}
        onClose={() => setIsRemoveOpen(false)}
        onRemove={() => void remove()}
      />
    </>
  );
}
