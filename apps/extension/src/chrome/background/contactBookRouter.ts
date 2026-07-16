import {
  createAddressContact,
  getAddressContacts,
  removeAddressContact,
  reorderAddressContacts,
  updateAddressContactLabel,
} from "../contactBook/repository";

export const BACKGROUND_CONTACT_BOOK_MESSAGE_TYPES = [
  "getAddressContacts",
  "createAddressContact",
  "updateAddressContactLabel",
  "removeAddressContact",
  "reorderAddressContacts",
] as const;

type RouteResult = { handled: false } | { handled: true; keepChannelOpen: boolean };

const dependencies = {
  getAddressContacts,
  createAddressContact,
  updateAddressContactLabel,
  removeAddressContact,
  reorderAddressContacts,
  sendRuntimeMessage: (message: Record<string, unknown>) => chrome.runtime.sendMessage(message),
};

export function createBackgroundContactBookMessageRouter(overrides: Partial<typeof dependencies> = {}) {
  const deps = { ...dependencies, ...overrides };
  return (message: any, sendResponse: (response?: any) => void): RouteResult => {
    const publish = async (work: Promise<unknown>) => {
      try {
        const contacts = await work;
        void deps.sendRuntimeMessage({ type: "addressContactsUpdated", contacts }).catch(() => {});
        sendResponse({ success: true, contacts });
      } catch (error) {
        sendResponse({ success: false, error: error instanceof Error ? error.message : "Contact update failed" });
      }
    };
    switch (message?.type) {
      case "getAddressContacts":
        deps.getAddressContacts().then(sendResponse).catch(() => sendResponse([]));
        return { handled: true, keepChannelOpen: true };
      case "createAddressContact":
        void publish(deps.createAddressContact(message.address, message.label));
        return { handled: true, keepChannelOpen: true };
      case "updateAddressContactLabel":
        void publish(deps.updateAddressContactLabel(message.address, message.label));
        return { handled: true, keepChannelOpen: true };
      case "removeAddressContact":
        void publish(deps.removeAddressContact(message.address));
        return { handled: true, keepChannelOpen: true };
      case "reorderAddressContacts":
        void publish(deps.reorderAddressContacts(message.addresses));
        return { handled: true, keepChannelOpen: true };
      default:
        return { handled: false };
    }
  };
}

export const routeBackgroundContactBookMessage = createBackgroundContactBookMessageRouter();
