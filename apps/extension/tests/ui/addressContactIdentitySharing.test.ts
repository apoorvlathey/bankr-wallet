import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Address Book and Send share contact identity enrichment and contact-list controls", async () => {
  const [addressBook, recipientPicker, recipientSection, recipientHook, contactList, picker] = await Promise.all([
    readFile(new URL("../../src/components/AddressBook/AddressBookScreen.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Transfer/RecipientPicker.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Transfer/RecipientSection.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/Transfer/hooks/useTransferRecipient.ts", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/shared/AddressContactList.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../src/components/ui/FullScreenPicker.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(addressBook, /useAddressContactIdentities/u);
  assert.match(addressBook, /AddressContactList/u);
  assert.match(recipientHook, /useAddressContactIdentities/u);
  assert.match(recipientHook, /useAddressResolver\(localRecipientIdentity \? "" : recipient\)/u);
  assert.match(recipientHook, /isResolving: false/u);
  assert.match(recipientPicker, /AddressContactList/u);
  assert.match(contactList, /AddressContactAvatar/u);
  assert.match(contactList, /AddressContactEditorModal/u);
  assert.match(contactList, /onRemoveContact/u);
  assert.match(contactList, /onReorderContacts/u);
  assert.match(contactList, /aria-label="Add contact"/u);
  assert.match(contactList, /_hover=\{onSelectAddress \? \{ bg: "surface\.raisedHover" \}/u);
  assert.match(recipientPicker, /canAddContact/u);
  assert.match(picker, /trailing\?: ReactNode/u);
  assert.match(recipientSection, /AddressContactAvatar/u);
  assert.match(recipientSection, /placeholder="0x, contacts, \.eth, \.gwei"/u);
  assert.match(recipientSection, /onFocus=\{\(\) => setSuggestionsOpen\(true\)\}/u);
  assert.match(recipientSection, /onClick=\{\(\) => setSuggestionsOpen\(true\)\}/u);
  assert.match(
    recipientSection,
    /<HStack spacing=\{1\}>[\s\S]*?Recipient[\s\S]*?hasRecipientChoices && \([\s\S]*?My contacts/u,
  );
  assert.match(recipientSection, /<LabeledAddressPopover[\s\S]*?maxW="180px"/u);
  assert.match(recipientSection, /transition=\{tokens\.motion\.transitionBase\}/u);
  assert.doesNotMatch(recipientSection, /tokens\.transitions/u);
  assert.doesNotMatch(recipientSection, /placeholder="0x\.\.\., ENS/u);
  assert.doesNotMatch(recipientPicker, /blo\(/u);
});
