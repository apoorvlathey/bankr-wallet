import { blo } from "blo";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Account } from "@/chrome/types";
import { useAddressResolver } from "@/hooks/useAddressResolver";
import { useCachedAvatarMap, useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";
import { useEnsIdentities } from "@/hooks/useEnsIdentities";
import { useRecipientAddressKind } from "@/hooks/useRecipientAddressKind";
import { truncateAddress } from "@/lib/addressUtils";

interface UseTransferRecipientOptions {
  accounts?: Account[];
  fromAddress: string;
  chainId: number;
}

export function useTransferRecipient({
  accounts,
  fromAddress,
  chainId,
}: UseTransferRecipientOptions) {
  const [recipient, setRecipient] = useState("");
  const [isRecipientPickerOpen, setIsRecipientPickerOpen] = useState(false);
  const [recipientSearch, setRecipientSearch] = useState("");
  const [acknowledgeContract, setAcknowledgeContract] = useState(false);
  const resolver = useAddressResolver(recipient);
  const cachedRecipientAvatar = useCachedAvatarSrc(resolver.avatar);

  const recipientKind = useRecipientAddressKind(
    resolver.isValid && !resolver.isResolving
      ? resolver.resolvedAddress
      : null,
    chainId,
  );
  const isRecipientContract = recipientKind.kind === "contract";

  useEffect(() => {
    setAcknowledgeContract(false);
  }, [chainId, resolver.resolvedAddress]);

  const otherAccounts = useMemo(
    () =>
      (accounts || []).filter(
        (account) =>
          account.address.toLowerCase() !== fromAddress.toLowerCase(),
      ),
    [accounts, fromAddress],
  );
  const otherAccountAddresses = useMemo(
    () => otherAccounts.map((account) => account.address),
    [otherAccounts],
  );
  const { identities } = useEnsIdentities(otherAccountAddresses);
  const avatarUrls = useMemo(
    () =>
      otherAccounts
        .map((account) => identities.get(account.address.toLowerCase())?.avatar)
        .filter((url): url is string => Boolean(url)),
    [identities, otherAccounts],
  );
  const cachedAvatars = useCachedAvatarMap(avatarUrls);

  const getAccountDisplayName = useCallback(
    (account: Account): string => {
      if (account.displayName) return account.displayName;
      const identity = identities.get(account.address.toLowerCase());
      return identity?.name || truncateAddress(account.address);
    },
    [identities],
  );

  const getAccountAvatar = useCallback(
    (account: Account): string => {
      const avatar = identities.get(account.address.toLowerCase())?.avatar;
      if (avatar) return cachedAvatars.get(avatar) || avatar;
      if (account.type === "bankr") return "/bankr-icon.png";
      return blo(account.address as `0x${string}`);
    },
    [cachedAvatars, identities],
  );

  const filteredRecipientAccounts = useMemo(() => {
    const query = recipientSearch.trim().toLowerCase();
    if (!query) return otherAccounts;
    return otherAccounts.filter((account) => {
      const identity = identities.get(account.address.toLowerCase());
      return (
        getAccountDisplayName(account).toLowerCase().includes(query) ||
        account.address.toLowerCase().includes(query) ||
        account.type.toLowerCase().includes(query) ||
        identity?.name?.toLowerCase().includes(query)
      );
    });
  }, [getAccountDisplayName, identities, otherAccounts, recipientSearch]);

  const selectRecipientAccount = (account: Account) => {
    setRecipient(account.address);
    setIsRecipientPickerOpen(false);
    setRecipientSearch("");
  };

  const closeRecipientPicker = () => {
    setIsRecipientPickerOpen(false);
    setRecipientSearch("");
  };

  return {
    recipient,
    setRecipient: (value: string) => setRecipient(value.trim()),
    ...resolver,
    cachedRecipientAvatar,
    isRecipientContract,
    isCheckingRecipientKind: recipientKind.isChecking,
    acknowledgeContract,
    setAcknowledgeContract,
    otherAccounts,
    isRecipientPickerOpen,
    openRecipientPicker: () => setIsRecipientPickerOpen(true),
    closeRecipientPicker,
    recipientSearch,
    setRecipientSearch,
    filteredRecipientAccounts,
    getAccountDisplayName,
    getAccountAvatar,
    selectRecipientAccount,
  };
}

export type TransferRecipient = ReturnType<typeof useTransferRecipient>;
