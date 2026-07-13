/** Session proposal policy and approval/rejection effects. */

import { buildApprovedNamespaces } from "@walletconnect/utils";
import { getStoredNetworksInfo, getVisibleChains } from "@/lib/chains";
import type { WalletConnectProposalRejection } from "@/types/walletConnect";
import { getActiveAccount } from "../accountStorage";
import {
  WALLETCONNECT_SUPPORTED_EVENTS,
  WALLETCONNECT_SUPPORTED_METHODS,
  isSigningAccount,
} from "./sessionPolicy";
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
  if (!isSigningAccount(account)) {
    await kit.rejectSession({
      id: proposal.id,
      reason: { code: 4001, message: "No signing account is active" },
    });
    return;
  }

  try {
    const networksInfo = await getStoredNetworksInfo();
    const visibleChains = getVisibleChains(networksInfo, account.type);
    const chains = visibleChains.map((chain) => `eip155:${chain.chainId}`);
    const accounts = chains.map((chain) => `${chain}:${account.address}`);
    const supportedNamespaces: WalletConnectSupportedNamespaces = {
      eip155: {
        chains,
        accounts,
        methods: WALLETCONNECT_SUPPORTED_METHODS,
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
