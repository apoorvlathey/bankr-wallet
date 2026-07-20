import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { Flex, IconButton, Text } from "@chakra-ui/react";
import {
  ChevronRightIcon,
  ExternalLinkIcon,
} from "@chakra-ui/icons";
import type { Account } from "@/chrome/types";
import { AccountAvatar } from "@/components/AccountIdentity";
import { AccountPickerRow } from "@/components/AccountPickerRow";
import { getDefaultAccountExplorerUrl } from "@/components/accountExplorerUtils";
import { getWalletTypeLabel } from "@/components/accountIdentityLabels";
import { CopyButton } from "@/components/CopyButton";
import { FullScreenPickerLayer } from "@/components/FullScreenPickerLayer";
import {
  FullScreenPicker,
  FullScreenPickerGroup,
  ListItem,
  ListItemContent,
  ListItemMedia,
  ListItemTitle,
  ListSurface,
} from "@/components/ui";
import { useAccountIdentityLabels } from "@/hooks/useAccountIdentityLabels";
import { useSeedGroupMap } from "@/hooks/useSeedGroupMap";
import { truncateAddress } from "@/lib/addressUtils";
import type { SafeAccountRecord } from "@/chrome/safe/types";

interface DappConnectionAccountSelectorProps {
  accounts: Account[];
  account: Account;
  onAccountSelect: (account: Account) => void | Promise<void>;
  chainId?: number;
}

export default function DappConnectionAccountSelector({
  accounts,
  account,
  onAccountSelect,
  chainId,
}: DappConnectionAccountSelectorProps) {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [switchingAccountId, setSwitchingAccountId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [safeRecords, setSafeRecords] = useState<SafeAccountRecord[]>([]);
  const seedGroupMap = useSeedGroupMap(accounts);
  const accountTriggerRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const { getDisplayName, getEnsAvatar, getSecondaryIdentity } = useAccountIdentityLabels(accounts);
  useEffect(() => {
    chrome.runtime.sendMessage({ type: "getSafeAccounts" }, (records: SafeAccountRecord[]) => setSafeRecords(records || []));
  }, []);
  const safeCanConnect = (candidate: Account) => {
    if (candidate.type !== "safe") return true;
    const record = safeRecords.find((item) => item.accountId === candidate.id);
    const snapshots = chainId ? [record?.chains[String(chainId)]] : Object.values(record?.chains || {});
    return snapshots.some((snapshot) => !!snapshot && ["approve", "quorumAvailable", "readyToExecute"].includes(snapshot.capability));
  };

  const closePicker = useCallback((restoreFocus = true) => {
    setIsPickerOpen(false);
    setSwitchError(null);
    if (restoreFocus) {
      requestAnimationFrame(() => accountTriggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!isPickerOpen) return;

    const focusFrame = requestAnimationFrame(() => {
      pickerRef.current
        ?.querySelector<HTMLElement>("[data-screen-heading]")
        ?.focus();
    });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePicker, isPickerOpen]);

  const selectAccount = async (nextAccount: Account) => {
    if (!safeCanConnect(nextAccount)) return;
    if (nextAccount.id === account.id) {
      closePicker();
      return;
    }

    setSwitchingAccountId(nextAccount.id);
    setSwitchError(null);
    try {
      await onAccountSelect(nextAccount);
      closePicker();
    } catch {
      setSwitchError("Couldn’t switch accounts. Try again.");
    } finally {
      setSwitchingAccountId(null);
    }
  };

  return (
    <>
      <ListSurface>
        <ListItem px={0} py={0} gap={0}>
          <Flex
            ref={accountTriggerRef}
            as="button"
            type="button"
            aria-haspopup="listbox"
            aria-expanded={isPickerOpen}
            minW={0}
            flex={1}
            minH="64px"
            px={3}
            py={2.5}
            gap={3}
            align="center"
            textAlign="start"
            _hover={{ bg: "surface.raisedHover" }}
            _focus={{ outline: "none" }}
            _focusVisible={{
              boxShadow: "inset 0 0 0 2px var(--chakra-colors-border-focus)",
            }}
            onClick={() => setIsPickerOpen(true)}
          >
            <ListItemMedia>
              <AccountAvatar
                account={account}
                ensAvatar={getEnsAvatar(account)}
                size={36}
              />
            </ListItemMedia>
            <ListItemContent>
              <ListItemTitle noOfLines={1}>
                {getDisplayName(account)}
              </ListItemTitle>
              <Text
                as="span"
                color="fg.secondary"
                fontFamily="mono"
                fontSize="sm"
                lineHeight="1.45"
                noOfLines={1}
              >
                {truncateAddress(account.address)}
              </Text>
            </ListItemContent>
            <ChevronRightIcon boxSize={5} color="fg.muted" flexShrink={0} />
          </Flex>
        </ListItem>
      </ListSurface>

      {isPickerOpen && (
        <FullScreenPickerLayer>
          <FullScreenPicker
            ref={pickerRef}
            title="Choose account"
            onBack={() => closePicker()}
            backLabel="Back to connection request"
          >
            <FullScreenPickerGroup
              label="Accounts"
              description="Choose the account this site can see"
            >
              {accounts.map((candidate) => {
                return (
                  <AccountPickerRow
                    key={candidate.id}
                    account={candidate}
                    displayName={getDisplayName(candidate)}
                    ensAvatar={getEnsAvatar(candidate)}
                    secondaryIdentity={getSecondaryIdentity(candidate)}
                    walletTypeLabel={getWalletTypeLabel(candidate, seedGroupMap)}
                    statusLabel={
                      candidate.type === "safe" && !safeCanConnect(candidate)
                        ? "Observe-only Safe"
                        : switchingAccountId === candidate.id
                          ? "Switching…"
                          : undefined
                    }
                    isSelected={candidate.id === account.id}
                    isDisabled={!safeCanConnect(candidate) || switchingAccountId !== null}
                    onSelect={() => void selectAccount(candidate)}
                    actions={
                      <>
                        <CopyButton value={candidate.address} />
                        <IconButton
                          as="a"
                          href={getDefaultAccountExplorerUrl(candidate.address)}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="View address on Etherscan"
                          icon={<ExternalLinkIcon />}
                          size="xs"
                          variant="ghost"
                        />
                      </>
                    }
                  />
                );
              })}
            </FullScreenPickerGroup>
            {switchError && (
              <Text mt={3} px={1} color="chart.negative" fontSize="sm">
                {switchError}
              </Text>
            )}
          </FullScreenPicker>
        </FullScreenPickerLayer>
      )}
    </>
  );
}
