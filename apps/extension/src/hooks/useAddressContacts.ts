import { useCallback, useEffect, useMemo, useState } from "react";
import type { AddressContact } from "@/chrome/contactBook/repository";

type MutationResponse = { success?: boolean; contacts?: AddressContact[]; error?: string };

let sharedContacts: AddressContact[] | null = null;
let sharedLoad: Promise<AddressContact[]> | null = null;

async function loadContacts(): Promise<AddressContact[]> {
  if (sharedContacts) return sharedContacts;
  if (sharedLoad) return sharedLoad;
  sharedLoad = chrome.runtime.sendMessage({ type: "getAddressContacts" }).then((result) => {
    sharedContacts = Array.isArray(result) ? result : [];
    return sharedContacts;
  }).finally(() => { sharedLoad = null; });
  return sharedLoad;
}

export function useAddressContacts() {
  const [contacts, setContacts] = useState<AddressContact[]>(sharedContacts || []);
  const [isLoading, setIsLoading] = useState(sharedContacts === null);

  useEffect(() => {
    let cancelled = false;
    void loadContacts()
      .then((next) => {
        if (!cancelled) setContacts(next);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    const listener = (message: any) => {
      if (message?.type !== "addressContactsUpdated") return;
      if (Array.isArray(message.contacts)) {
        sharedContacts = message.contacts;
        setContacts(message.contacts);
      }
      else {
        sharedContacts = null;
        void loadContacts().then(setContacts);
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      cancelled = true;
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, []);

  const mutate = useCallback(async (message: Record<string, unknown>) => {
    const response = await chrome.runtime.sendMessage(message) as MutationResponse;
    if (!response?.success) throw new Error(response?.error || "Contact update failed");
    if (Array.isArray(response.contacts)) {
      sharedContacts = response.contacts;
      setContacts(response.contacts);
    }
    return response.contacts || [];
  }, []);

  return {
    contacts,
    isLoading,
    createContact: (address: string, label: string) => mutate({ type: "createAddressContact", address, label }),
    updateContact: (address: string, label: string) => mutate({ type: "updateAddressContactLabel", address, label }),
    removeContact: (address: string) => mutate({ type: "removeAddressContact", address }),
    reorderContacts: (addresses: string[]) => mutate({ type: "reorderAddressContacts", addresses }),
  };
}

export function useAddressContact(address: string | null | undefined) {
  const state = useAddressContacts();
  const contact = useMemo(() => {
    if (!address) return null;
    const normalized = address.toLowerCase();
    return state.contacts.find((candidate) => candidate.address.toLowerCase() === normalized) ?? null;
  }, [address, state.contacts]);
  return { ...state, contact };
}

export function useAddressContactLabelMap() {
  const { contacts } = useAddressContacts();
  return useMemo(
    () => new Map(contacts.map((contact) => [contact.address.toLowerCase(), contact.label])),
    [contacts],
  );
}
