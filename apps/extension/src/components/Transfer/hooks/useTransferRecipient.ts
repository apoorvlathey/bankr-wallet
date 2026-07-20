import { useCallback, useEffect, useMemo, useState } from "react";
import type { Account } from "@/chrome/types";
import { useAddressResolver } from "@/hooks/useAddressResolver";
import { useCachedAvatarSrc } from "@/hooks/useCachedAvatarSrc";
import { useEnsIdentities } from "@/hooks/useEnsIdentities";
import { useRecipientAddressKind } from "@/hooks/useRecipientAddressKind";
import { truncateAddress } from "@/lib/addressUtils";
import { useAddressContacts } from "@/hooks/useAddressContacts";
import { useAddressContactIdentities } from "@/hooks/useAddressContactIdentities";
import { buildRecipientSuggestions } from "../model/recipientSuggestions";

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
  const { contacts, removeContact, reorderContacts } = useAddressContacts();
  const eligibleRecipientContacts = useMemo(() => {
    const excluded = new Set((accounts || []).map((account) => account.address.toLowerCase()));
    excluded.add(fromAddress.toLowerCase());
    return contacts.filter((contact) => !excluded.has(contact.address.toLowerCase()));
  }, [accounts, contacts, fromAddress]);
  const { contactIdentities: recipientContactIdentities } = useAddressContactIdentities(eligibleRecipientContacts);
  const contactIdentitiesByAddress = useMemo(
    () => new Map(recipientContactIdentities.map((identity) => [identity.contact.address.toLowerCase(), identity])),
    [recipientContactIdentities],
  );

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
  const contactLabels = useMemo(
    () => new Map(contacts.map((contact) => [contact.address.toLowerCase(), contact.label])),
    [contacts],
  );

  const getAccountDisplayName = useCallback(
    (account: Account): string => {
      const contactLabel = contactLabels.get(account.address.toLowerCase());
      if (contactLabel) return contactLabel;
      if (account.displayName) return account.displayName;
      const identity = identities.get(account.address.toLowerCase());
      return identity?.name || truncateAddress(account.address);
    },
    [contactLabels, identities],
  );

  const getAccountEnsAvatar = useCallback(
    (account: Account): string | null =>
      identities.get(account.address.toLowerCase())?.avatar ?? null,
    [identities],
  );
  const accountsByAddress = useMemo(
    () => new Map(otherAccounts.map((account) => [account.address.toLowerCase(), account])),
    [otherAccounts],
  );
  const localRecipientIdentity = useMemo(() => {
    const key = recipient.toLowerCase();
    const contactIdentity = contactIdentitiesByAddress.get(key);
    if (contactIdentity) {
      return {
        address: contactIdentity.contact.address,
        name: contactIdentity.contact.label,
        avatar: contactIdentity.avatar,
      };
    }
    const account = accountsByAddress.get(key);
    if (!account) return null;
    return {
      address: account.address,
      name: getAccountDisplayName(account),
      avatar: identities.get(key)?.avatar ?? null,
    };
  }, [accountsByAddress, contactIdentitiesByAddress, getAccountDisplayName, identities, recipient]);
  const remoteResolver = useAddressResolver(localRecipientIdentity ? "" : recipient);
  const resolver = localRecipientIdentity
    ? {
        resolvedAddress: localRecipientIdentity.address,
        resolvedName: localRecipientIdentity.name,
        avatar: localRecipientIdentity.avatar,
        isResolving: false,
        isLoadingExtras: false,
        isValid: true,
        error: null,
      }
    : remoteResolver;
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

  const filteredRecipientContacts = useMemo(() => {
    const query = recipientSearch.trim().toLowerCase();
    if (!query) return recipientContactIdentities;
    return recipientContactIdentities.filter(({ contact, publicName }) => contact.label.toLowerCase().includes(query)
      || contact.address.toLowerCase().includes(query)
      || Boolean(publicName?.toLowerCase().includes(query)));
  }, [recipientContactIdentities, recipientSearch]);

  const recipientContacts = useMemo(
    () => recipientContactIdentities.map(({ contact }) => contact),
    [recipientContactIdentities],
  );

  const suggestions = useMemo(() => {
    if (localRecipientIdentity) return [];
    const ranked = buildRecipientSuggestions(
      recipient,
      otherAccounts,
      recipientContacts,
      getAccountDisplayName,
      6,
      (address) => identities.get(address.toLowerCase())?.name
        || contactIdentitiesByAddress.get(address.toLowerCase())?.publicName
        || null,
    );
    return ranked.map((suggestion) => {
      const key = suggestion.address.toLowerCase();
      const contactIdentity = contactIdentitiesByAddress.get(key);
      const account = accountsByAddress.get(key);
      const publicName = contactIdentity?.publicName || suggestion.publicName;
      return {
        ...suggestion,
        publicName,
        avatar: contactIdentity?.avatar || identities.get(key)?.avatar || null,
        fallbackAvatar: account?.type === "bankr" ? "/bankr-icon.png" : undefined,
        secondaryText: publicName && publicName.toLowerCase() !== suggestion.label.toLowerCase()
          ? publicName
          : contactIdentity?.secondaryText || truncateAddress(suggestion.address),
        secondaryIsAddress: contactIdentity?.secondaryIsAddress
          ?? (!publicName || publicName.toLowerCase() === suggestion.label.toLowerCase()),
      };
    });
  }, [accountsByAddress, contactIdentitiesByAddress, getAccountDisplayName, identities, localRecipientIdentity, otherAccounts, recipient, recipientContacts]);

  const selectRecipientAccount = (account: Account) => {
    setRecipient(account.address);
    setIsRecipientPickerOpen(false);
    setRecipientSearch("");
  };

  const selectRecipientAddress = (address: string) => {
    setRecipient(address);
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
    allAddressContacts: contacts,
    recipientContacts,
    filteredRecipientContacts,
    suggestions,
    getAccountDisplayName,
    getAccountEnsAvatar,
    selectRecipientAccount,
    selectRecipientAddress,
    removeContact,
    reorderContacts,
  };
}

export type TransferRecipient = ReturnType<typeof useTransferRecipient>;
