import { memo, useCallback, useRef, useState } from "react";
import { ChevronRightIcon } from "@chakra-ui/icons";
import { Button, Flex, HStack, Icon, IconButton, Text, VStack } from "@chakra-ui/react";

import type { Account } from "@/chrome/types";
import AccountExplorerMenu from "@/components/AccountExplorerMenu";
import { AccountAvatar } from "@/components/AccountIdentity";
import AccountPickerScreen from "@/components/AccountPicker/AccountPickerScreen";
import { CopyButton } from "@/components/CopyButton";
import { FullScreenPickerLayer } from "@/components/FullScreenPickerLayer";
import MiddleTruncatedAddress from "@/components/MiddleTruncatedAddress";
import { useAccountIdentityLabels } from "@/hooks/useAccountIdentityLabels";
import type { ResolvedChain } from "@/lib/chains";

interface AccountSwitcherProps {
  accounts: Account[];
  activeAccount: Account | null;
  explorerChains: ResolvedChain[];
  onAccountSelect: (account: Account) => void;
  onAddAccount: () => void;
  onAccountSettings: (account: Account) => void;
  onShowQr?: () => void;
  isPickerOpen?: boolean;
  onPickerOpenChange?: (isOpen: boolean) => void;
  onAccountsReordered?: (accounts: Account[]) => void;
}

const QrCodeIcon = () => (
  <Icon viewBox="0 0 24 24" boxSize="14px" aria-hidden="true">
    <path
      d="M3 3h6v6H3V3Zm12 0h6v6h-6V3ZM3 15h6v6H3v-6Zm12 0h2v2h-2v-2Zm4 0h2v2h-2v-2Zm-4 4h2v2h-2v-2Zm4 0h2v2h-2v-2Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
    />
  </Icon>
);

function AccountSwitcher({
  accounts,
  activeAccount,
  explorerChains,
  onAccountSelect,
  onAddAccount,
  onAccountSettings,
  onShowQr,
  isPickerOpen: controlledPickerOpen,
  onPickerOpenChange,
  onAccountsReordered,
}: AccountSwitcherProps) {
  const [uncontrolledPickerOpen, setUncontrolledPickerOpen] = useState(false);
  const isPickerOpen = controlledPickerOpen ?? uncontrolledPickerOpen;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const { getDisplayName, getEnsAvatar } = useAccountIdentityLabels(accounts);

  const setPickerOpen = useCallback(
    (isOpen: boolean) => {
      if (controlledPickerOpen === undefined) setUncontrolledPickerOpen(isOpen);
      onPickerOpenChange?.(isOpen);
    },
    [controlledPickerOpen, onPickerOpenChange],
  );

  const closePicker = useCallback((restoreFocus = true) => {
    setPickerOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, [setPickerOpen]);

  const selectAccount = (account: Account) => {
    onAccountSelect(account);
    closePicker();
  };

  const openAccountSettings = (account: Account) => {
    onAccountSettings(account);
    closePicker(false);
  };

  const addAccount = () => {
    onAddAccount();
    closePicker(false);
  };

  return (
    <>
      <Flex w="full" minH="64px" position="relative" align="center" isolation="isolate">
        <Button
          ref={triggerRef}
          aria-haspopup="listbox"
          aria-expanded={isPickerOpen}
          aria-label="Choose account"
          variant="ghost"
          position="absolute"
          inset={0}
          zIndex={0}
          w="full"
          h="full"
          p={0}
          borderRadius={0}
          _hover={{ bg: "surface.raisedHover" }}
          _active={{ bg: "surface.sunken" }}
          onClick={() => setPickerOpen(true)}
        />

        {activeAccount ? (
          <HStack
            position="relative"
            zIndex={1}
            w="full"
            minW={0}
            spacing={3}
            px={3}
            py={2.5}
            pointerEvents="none"
          >
            <AccountAvatar account={activeAccount} ensAvatar={getEnsAvatar(activeAccount)} size={36} />
            <VStack align="stretch" spacing={0.5} minW={0} flex={1}>
              <Text color="fg.primary" fontSize="md" fontWeight="600" lineHeight="1.3" noOfLines={1}>
                {getDisplayName(activeAccount)}
              </Text>
              <HStack minW={0} spacing={0} pe={6} color="fg.secondary">
                <Flex minW={0} flex={1}>
                  <MiddleTruncatedAddress address={activeAccount.address} />
                </Flex>
                {onShowQr && (
                  <IconButton
                    aria-label="Show active address QR code"
                    icon={<QrCodeIcon />}
                    size="xs"
                    minW="24px"
                    w="24px"
                    h="24px"
                    variant="ghost"
                    pointerEvents="auto"
                    color="fg.secondary"
                    onClick={onShowQr}
                    _hover={{ color: "accent.highlight", bg: "surface.raisedHover" }}
                  />
                )}
                <Flex pointerEvents="auto" flexShrink={0}>
                  <CopyButton value={activeAccount.address} label="Copy active address" />
                </Flex>
                <AccountExplorerMenu address={activeAccount.address} chains={explorerChains} />
              </HStack>
            </VStack>
            <ChevronRightIcon boxSize={5} color="fg.muted" flexShrink={0} />
          </HStack>
        ) : (
          <HStack position="relative" zIndex={1} w="full" justify="space-between" px={3} pointerEvents="none">
            <Text color="fg.secondary" fontWeight="600">Choose account</Text>
            <ChevronRightIcon boxSize={5} color="fg.muted" />
          </HStack>
        )}
      </Flex>

      {isPickerOpen && (
        <FullScreenPickerLayer>
          <AccountPickerScreen
            accounts={accounts}
            activeAccount={activeAccount}
            title="Choose account"
            mode="select"
            onBack={() => closePicker()}
            onAccountSelect={selectAccount}
            onAccountSettings={openAccountSettings}
            onAddAccount={addAccount}
            onAccountsReordered={onAccountsReordered}
          />
        </FullScreenPickerLayer>
      )}
    </>
  );
}

export default memo(AccountSwitcher);
