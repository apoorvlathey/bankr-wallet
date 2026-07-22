import { getAddress, isAddress } from "viem";
import { withStorageLock } from "../storageLock";

export const ADDRESS_CONTACTS_STORAGE_KEY = "addressContacts";
export const ADDRESS_CONTACTS_LIMIT = 500;
export const ADDRESS_CONTACT_LABEL_LIMIT = 64;
const ADDRESS_CONTACTS_LOCK_KEY = "local:addressContacts";

export interface AddressContact {
  address: `0x${string}`;
  label: string;
}

function normalizeLabel(value: unknown): string {
  if (typeof value !== "string") throw new Error("Contact label is required");
  const label = value.trim();
  if (!label) throw new Error("Contact label is required");
  if (label.length > ADDRESS_CONTACT_LABEL_LIMIT) {
    throw new Error(`Contact labels must be ${ADDRESS_CONTACT_LABEL_LIMIT} characters or fewer`);
  }
  if (/\p{Cc}/u.test(label)) throw new Error("Contact label contains unsupported characters");
  return label;
}

export function normalizeContactAddress(value: unknown): `0x${string}` {
  if (typeof value !== "string" || !isAddress(value, { strict: false })) {
    throw new Error("Enter a valid EVM address");
  }
  return getAddress(value) as `0x${string}`;
}

function decodeContacts(value: unknown): AddressContact[] {
  if (!Array.isArray(value)) return [];
  const contacts: AddressContact[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    try {
      const candidate = item as { address?: unknown; label?: unknown };
      const address = normalizeContactAddress(candidate.address);
      const label = normalizeLabel(candidate.label);
      const key = address.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      contacts.push({ address, label });
      if (contacts.length === ADDRESS_CONTACTS_LIMIT) break;
    } catch {
      // Ignore malformed additive metadata instead of breaking wallet startup.
    }
  }
  return contacts;
}

export async function getAddressContacts(): Promise<AddressContact[]> {
  const stored = await chrome.storage.local.get(ADDRESS_CONTACTS_STORAGE_KEY);
  return decodeContacts(stored[ADDRESS_CONTACTS_STORAGE_KEY]);
}

async function saveAddressContacts(contacts: AddressContact[]): Promise<void> {
  await chrome.storage.local.set({ [ADDRESS_CONTACTS_STORAGE_KEY]: contacts });
}

export async function findAddressContact(address: string): Promise<AddressContact | null> {
  if (!isAddress(address, { strict: false })) return null;
  const normalized = address.toLowerCase();
  return (await getAddressContacts()).find((contact) => contact.address.toLowerCase() === normalized) ?? null;
}

export async function createAddressContact(addressValue: unknown, labelValue: unknown): Promise<AddressContact[]> {
  const address = normalizeContactAddress(addressValue);
  const label = normalizeLabel(labelValue);
  return withStorageLock(ADDRESS_CONTACTS_LOCK_KEY, async () => {
    const contacts = await getAddressContacts();
    if (contacts.some((contact) => contact.address.toLowerCase() === address.toLowerCase())) {
      throw new Error("This address is already in your contacts");
    }
    if (contacts.length >= ADDRESS_CONTACTS_LIMIT) throw new Error("Contact book is full");
    const next = [...contacts];
    const insertion = next.findIndex((contact) => contact.label.localeCompare(label, undefined, { sensitivity: "base" }) > 0);
    next.splice(insertion < 0 ? next.length : insertion, 0, { address, label });
    await saveAddressContacts(next);
    return next;
  });
}

export async function updateAddressContactLabel(addressValue: unknown, labelValue: unknown): Promise<AddressContact[]> {
  const address = normalizeContactAddress(addressValue);
  const label = normalizeLabel(labelValue);
  return withStorageLock(ADDRESS_CONTACTS_LOCK_KEY, async () => {
    const contacts = await getAddressContacts();
    const index = contacts.findIndex((contact) => contact.address.toLowerCase() === address.toLowerCase());
    if (index < 0) throw new Error("Contact not found");
    const next = contacts.slice();
    next[index] = { address: contacts[index].address, label };
    await saveAddressContacts(next);
    return next;
  });
}

export async function removeAddressContact(addressValue: unknown): Promise<AddressContact[]> {
  const address = normalizeContactAddress(addressValue);
  return withStorageLock(ADDRESS_CONTACTS_LOCK_KEY, async () => {
    const contacts = await getAddressContacts();
    const next = contacts.filter((contact) => contact.address.toLowerCase() !== address.toLowerCase());
    if (next.length === contacts.length) throw new Error("Contact not found");
    await saveAddressContacts(next);
    return next;
  });
}

export async function reorderAddressContacts(addresses: unknown): Promise<AddressContact[]> {
  if (!Array.isArray(addresses) || addresses.some((address) => typeof address !== "string")) {
    throw new Error("Invalid contact order");
  }
  return withStorageLock(ADDRESS_CONTACTS_LOCK_KEY, async () => {
    const contacts = await getAddressContacts();
    const byAddress = new Map(contacts.map((contact) => [contact.address.toLowerCase(), contact]));
    const normalized = addresses.map((address) => normalizeContactAddress(address).toLowerCase());
    if (normalized.length !== contacts.length || new Set(normalized).size !== contacts.length || normalized.some((address) => !byAddress.has(address))) {
      throw new Error("Contact order is out of date");
    }
    const next = normalized.map((address) => byAddress.get(address)!);
    await saveAddressContacts(next);
    return next;
  });
}
