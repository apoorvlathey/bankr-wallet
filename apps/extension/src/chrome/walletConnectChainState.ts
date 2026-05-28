import {
  getResolvedChainById,
  getResolvedChainByName,
  getStoredNetworksInfo,
  getVisibleChains,
  type ResolvedChain,
} from "@/lib/chains";
import { getActiveAccount } from "./accountStorage";
import {
  getWalletConnectChainId,
  saveWalletConnectChainId,
} from "./walletConnectStorage";
import {
  sessionSupportsChain,
  toHexChainId,
} from "./walletConnectHelpers";

type WalletKitChainEmitter = {
  getActiveSessions?: () => Record<string, any>;
  emitSessionEvent?: (params: any) => Promise<void>;
};

function broadcastWalletConnectChainChanged(chainId: number): void {
  chrome.runtime
    .sendMessage({ type: "walletConnectChainChanged", chainId })
    .catch(() => {});
}

async function getVisibleWalletConnectChains(): Promise<ResolvedChain[]> {
  const [account, networksInfo] = await Promise.all([
    getActiveAccount(),
    getStoredNetworksInfo(),
  ]);
  return getVisibleChains(networksInfo, account?.type);
}

async function resolveVisibleWalletConnectChain(
  chainId: number,
): Promise<ResolvedChain | null> {
  return (
    (await getVisibleWalletConnectChains()).find(
      (chain) => chain.chainId === chainId,
    ) || null
  );
}

async function resolveKnownWalletConnectChain(
  chainId: number,
): Promise<ResolvedChain | null> {
  const chain = getResolvedChainById(chainId, await getStoredNetworksInfo());
  return chain && !chain.hidden ? chain : null;
}

export async function getWalletConnectActiveChainId(): Promise<number | null> {
  const storedChainId = await getWalletConnectChainId();
  if (storedChainId && (await resolveVisibleWalletConnectChain(storedChainId))) {
    return storedChainId;
  }

  const [{ chainName }, networksInfo, visibleChains] = await Promise.all([
    chrome.storage.sync.get("chainName") as Promise<{
      chainName?: string;
    }>,
    getStoredNetworksInfo(),
    getVisibleWalletConnectChains(),
  ]);
  const globalChain = getResolvedChainByName(chainName, networksInfo);
  if (
    globalChain &&
    visibleChains.some((chain) => chain.chainId === globalChain.chainId)
  ) {
    return globalChain.chainId;
  }

  return visibleChains[0]?.chainId ?? null;
}

export async function setWalletConnectActiveChain(
  kit: WalletKitChainEmitter | null,
  chainId: number,
  options: { emitEvents?: boolean } = {},
): Promise<ResolvedChain> {
  const chain = await resolveVisibleWalletConnectChain(chainId);
  if (!chain) {
    throw new Error("Unrecognized chain");
  }

  const previousChainId = await getWalletConnectChainId();
  if (previousChainId !== chain.chainId) {
    await saveWalletConnectChainId(chain.chainId);
    broadcastWalletConnectChainChanged(chain.chainId);
  }

  if (options.emitEvents !== false) {
    await emitWalletConnectChainChanged(kit, chain.chainId);
  }

  return chain;
}

export async function setWalletConnectActiveKnownChain(
  kit: WalletKitChainEmitter | null,
  chainId: number,
  options: { emitEvents?: boolean } = {},
): Promise<ResolvedChain> {
  const chain = await resolveKnownWalletConnectChain(chainId);
  if (!chain) {
    throw new Error("Unrecognized chain");
  }

  const previousChainId = await getWalletConnectChainId();
  if (previousChainId !== chain.chainId) {
    await saveWalletConnectChainId(chain.chainId);
    broadcastWalletConnectChainChanged(chain.chainId);
  }

  if (options.emitEvents !== false) {
    await emitWalletConnectChainChanged(kit, chain.chainId);
  }

  return chain;
}

export async function setWalletConnectActiveChainByName(
  kit: WalletKitChainEmitter | null,
  chainName: string,
): Promise<ResolvedChain> {
  const networksInfo = await getStoredNetworksInfo();
  const chain = getResolvedChainByName(chainName, networksInfo);
  if (!chain) {
    throw new Error("Unrecognized chain");
  }
  return setWalletConnectActiveChain(kit, chain.chainId, { emitEvents: true });
}

export async function syncWalletConnectChainFromRequest(
  kit: WalletKitChainEmitter,
  chainId: number,
): Promise<void> {
  const previousChainId = await getWalletConnectChainId();
  if (previousChainId === chainId) return;
  await setWalletConnectActiveKnownChain(kit, chainId, { emitEvents: true });
}

async function emitWalletConnectChainChanged(
  kit: WalletKitChainEmitter | null,
  chainId: number,
): Promise<void> {
  if (!kit?.emitSessionEvent || !kit.getActiveSessions) return;
  const sessions = Object.values(kit.getActiveSessions() || {});
  await Promise.allSettled(
    sessions
      .filter((session: any) => sessionSupportsChain(session, chainId))
      .map((session: any) =>
        kit.emitSessionEvent?.({
          topic: session.topic,
          event: { name: "chainChanged", data: toHexChainId(chainId) },
          chainId: `eip155:${chainId}`,
        }),
      ),
  );
}
