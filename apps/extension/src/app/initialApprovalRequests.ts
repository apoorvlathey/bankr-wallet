import type { ProviderRequestSurfaceHint } from "@/chrome/windowing/providerRequestSurface";

type Loader<T> = () => Promise<T[]>;
type ApprovalRequestLoaders<Tx, Sig, Permission, Batch> = readonly [
  Loader<Tx>,
  Loader<Sig>,
  Loader<Permission>,
  Loader<Batch>,
];
type ApprovalRequestLists<Tx, Sig, Permission, Batch> = [
  Tx[],
  Sig[],
  Permission[],
  Batch[],
];

const REQUEST_INDEX = {
  i_sendTransaction: 0,
  i_signatureRequest: 1,
  i_walletExecutionPermissions: 2,
  i_walletSendCalls: 3,
} as const;
const REQUEST_WAIT_MS = 5_000;
const REQUEST_POLL_MS = 25;

type InitialApprovalDependencies = {
  now: () => number;
  delay: (milliseconds: number) => Promise<void>;
};

const productionDependencies: InitialApprovalDependencies = {
  now: Date.now,
  delay: (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

export async function takeInitialApprovalRequestHint(): Promise<ProviderRequestSurfaceHint | null> {
  try {
    const currentWindow = await chrome.windows.getCurrent();
    if (typeof currentWindow.id !== "number") return null;
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "getProviderRequestSurfaceHint",
          windowId: currentWindow.id,
        },
        (hint: ProviderRequestSurfaceHint | null) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(hint ?? null);
        },
      );
    });
  } catch {
    return null;
  }
}

export async function loadInitialApprovalRequestsWith<
  Tx,
  Sig,
  Permission,
  Batch,
>(
  hint: ProviderRequestSurfaceHint | null,
  loaders: ApprovalRequestLoaders<Tx, Sig, Permission, Batch>,
  dependencies: InitialApprovalDependencies = productionDependencies,
): Promise<ApprovalRequestLists<Tx, Sig, Permission, Batch>> {
  const lists = (await Promise.all(
    loaders.map((load) => load()),
  )) as ApprovalRequestLists<Tx, Sig, Permission, Batch>;
  if (!hint) return lists;

  const requestIndex = REQUEST_INDEX[hint.requestType];
  if (lists[requestIndex].length > 0) return lists;

  const deadline = dependencies.now() + REQUEST_WAIT_MS;
  while (dependencies.now() < deadline) {
    await dependencies.delay(REQUEST_POLL_MS);
    switch (requestIndex) {
      case 0:
        lists[0] = await loaders[0]();
        if (lists[0].length > 0) return lists;
        break;
      case 1:
        lists[1] = await loaders[1]();
        if (lists[1].length > 0) return lists;
        break;
      case 2:
        lists[2] = await loaders[2]();
        if (lists[2].length > 0) return lists;
        break;
      case 3:
        lists[3] = await loaders[3]();
        if (lists[3].length > 0) return lists;
        break;
    }
  }
  return lists;
}

export async function loadInitialApprovalRequests<
  Tx,
  Sig,
  Permission,
  Batch,
>(
  loaders: ApprovalRequestLoaders<Tx, Sig, Permission, Batch>,
  hint?: ProviderRequestSurfaceHint | null,
): Promise<ApprovalRequestLists<Tx, Sig, Permission, Batch>> {
  const resolvedHint =
    hint === undefined ? await takeInitialApprovalRequestHint() : hint;
  return loadInitialApprovalRequestsWith(resolvedHint, loaders);
}
