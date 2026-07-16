import { useCallback, useMemo } from "react";
import type { Account } from "@/chrome/types";
import { useAddressContacts } from "@/hooks/useAddressContacts";
import { useEnsIdentities } from "@/hooks/useEnsIdentities";
import {
  getAccountPickerDisplayName,
  getAccountPickerSecondaryIdentity,
} from "@/lib/accountIdentityPresentation";

export function useAccountIdentityLabels(accounts: Account[]) {
  const addresses = useMemo(() => accounts.map((account) => account.address), [accounts]);
  const { identities } = useEnsIdentities(addresses);
  const { contacts } = useAddressContacts();
  const contactLabels = useMemo(
    () => new Map(contacts.map((contact) => [contact.address.toLowerCase(), contact.label])),
    [contacts],
  );
  const getEnsName = useCallback(
    (account: Account) => identities.get(account.address.toLowerCase())?.name ?? null,
    [identities],
  );
  const getEnsAvatar = useCallback(
    (account: Account) => identities.get(account.address.toLowerCase())?.avatar ?? null,
    [identities],
  );
  const getContactLabel = useCallback(
    (account: Account) => contactLabels.get(account.address.toLowerCase()) ?? null,
    [contactLabels],
  );
  const getDisplayName = useCallback(
    (account: Account) => getAccountPickerDisplayName(account, getEnsName(account), getContactLabel(account)),
    [getContactLabel, getEnsName],
  );
  const getSecondaryIdentity = useCallback(
    (account: Account) => getAccountPickerSecondaryIdentity(account, getEnsName(account), getContactLabel(account)),
    [getContactLabel, getEnsName],
  );

  return { identities, getContactLabel, getDisplayName, getEnsAvatar, getEnsName, getSecondaryIdentity };
}
