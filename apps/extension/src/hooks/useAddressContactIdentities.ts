import { useMemo } from "react";
import type { AddressContact } from "@/chrome/contactBook/repository";
import { useEnsIdentities } from "@/hooks/useEnsIdentities";
import { truncateAddress } from "@/lib/addressUtils";

export interface AddressContactIdentity {
  contact: AddressContact;
  publicName: string | null;
  avatar: string | null;
  secondaryText: string;
  secondaryIsAddress: boolean;
}

export function useAddressContactIdentities(contacts: AddressContact[]) {
  const addresses = useMemo(
    () => contacts.map((contact) => contact.address),
    [contacts],
  );
  const { identities, isLoading } = useEnsIdentities(addresses);

  const contactIdentities = useMemo(
    () => contacts.map((contact): AddressContactIdentity => {
      const identity = identities.get(contact.address.toLowerCase());
      const publicName = identity?.name ?? null;
      return {
        contact,
        publicName,
        avatar: identity?.avatar ?? null,
        secondaryText: publicName || truncateAddress(contact.address),
        secondaryIsAddress: !publicName,
      };
    }),
    [contacts, identities],
  );

  const identitiesByAddress = useMemo(
    () => new Map(contactIdentities.map((identity) => [identity.contact.address.toLowerCase(), identity])),
    [contactIdentities],
  );

  return { contactIdentities, identitiesByAddress, isLoading };
}
