/** Session proposal policy and approval/rejection effects. */

import { buildApprovedNamespaces } from "@walletconnect/utils";
import { getStoredNetworksInfo, getVisibleChains } from "@/lib/chains";
import type { WalletConnectProposalRejection } from "@/types/walletConnect";
import { getActiveAccount } from "../accountStorage";
import {
  WALLETCONNECT_SUPPORTED_EVENTS,
  getWalletConnectMethodsForAccount,
  isSessionAccount,
} from "./sessionPolicy";
import { getSafeAccountRecord } from "../safe/accountRepository";
import { requireSafeFeature } from "../safe/featurePolicy";
import {
  buildProposalRejection,
  hasApprovedNamespaces,
  normalizeWalletConnectProposal,
  type WalletConnectSupportedNamespaces,
} from "./proposal";

export async function handleWalletConnectSessionProposal(
  kit: any,
  proposal: any,
  onSessionsChanged: () => Promise<void>,
  onProposalRejected: (rejection: WalletConnectProposalRejection) => void,
): Promise<void> {
  const account = await getActiveAccount();
  if (!isSessionAccount(account)) {
    await kit.rejectSession({
      id: proposal.id,
      reason: { code: 4001, message: "No signing account is active" },
    });
    return;
  }

  try {
    const networksInfo = await getStoredNetworksInfo();
    const visibleChains = getVisibleChains(networksInfo, account.type);
    let eligibleChains = visibleChains;
    if (account.type === "safe") {
      requireSafeFeature("walletConnect");
      const record = await getSafeAccountRecord(account.id);
      eligibleChains = visibleChains.filter((chain) => {
        const snapshot = record?.chains[String(chain.chainId)];
        return !!snapshot && ["approve", "quorumAvailable", "readyToExecute"].includes(snapshot.capability);
      });
    }
    const chains = eligibleChains.map((chain) => `eip155:${chain.chainId}`);
    const accounts = chains.map((chain) => `${chain}:${account.address}`);
    const supportedNamespaces: WalletConnectSupportedNamespaces = {
      eip155: {
        chains,
        accounts,
        methods: getWalletConnectMethodsForAccount(account),
        events: WALLETCONNECT_SUPPORTED_EVENTS,
      },
    };
    const namespaces = buildApprovedNamespaces({
      proposal: normalizeWalletConnectProposal(
        proposal.params,
        supportedNamespaces,
      ),
      supportedNamespaces,
    });
    if (!hasApprovedNamespaces(namespaces)) {
      throw new Error(
        "No supported WalletConnect chains or methods matched this dapp",
      );
    }

    await kit.approveSession({ id: proposal.id, namespaces });
    void onSessionsChanged();
  } catch (error) {
    const rejection = await buildProposalRejection(
      proposal,
      account.type,
      error,
    );
    onProposalRejected(rejection);
    await kit.rejectSession({
      id: proposal.id,
      reason: { code: 5000, message: rejection.error },
    });
  }
}
