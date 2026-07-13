import { savePendingTxRequest } from "../requests/pendingTxStorage";
import {
  WALLET_SECRET_OPERATION_LOCK_KEY,
  withStorageLock,
} from "../storageLock";
import type { PinnedTxRequest } from "../requests/pendingTxStorage";

export interface DelegationRequestQueueDependencies {
  savePendingTxRequest: typeof savePendingTxRequest;
  withStorageLock: typeof withStorageLock;
  notifyPendingRequest: (request: PinnedTxRequest) => void;
}

const defaultDependencies: DelegationRequestQueueDependencies = {
  savePendingTxRequest,
  withStorageLock,
  notifyPendingRequest: (request) => {
    chrome.runtime
      .sendMessage({ type: "newPendingTxRequest", txRequest: request })
      .catch(() => {});
  },
};

/** Persist first; notify an already-open wallet UI only after durable intake. */
export function createDelegationRequestQueue(
  dependencies: DelegationRequestQueueDependencies,
) {
  return async function queueDelegationRequest(
    request: PinnedTxRequest,
    expectedMasterAuthEpoch?: string,
  ): Promise<void> {
    if (expectedMasterAuthEpoch) {
      await dependencies.withStorageLock(
        WALLET_SECRET_OPERATION_LOCK_KEY,
        () =>
          dependencies.savePendingTxRequest(
            request,
            expectedMasterAuthEpoch,
          ),
      );
    } else {
      await dependencies.savePendingTxRequest(request);
    }
    dependencies.notifyPendingRequest(request);
  };
}

export const queueDelegationRequest =
  createDelegationRequestQueue(defaultDependencies);
