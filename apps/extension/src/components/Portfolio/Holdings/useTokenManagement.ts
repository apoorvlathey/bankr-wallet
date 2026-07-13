import { useState } from "react";
import { useDisclosure } from "@chakra-ui/react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import {
  getPortfolioTokenKey,
  hidePortfolioToken,
} from "@/chrome/portfolio/hiddenTokens";
import { clearHoldingsCaches } from "./cache";
import type { PortfolioLoader } from "./useHoldingsLifecycle";
import type { HoldingsState } from "./useHoldingsState";

interface UseTokenManagementOptions {
  loadPortfolio: PortfolioLoader;
  state: HoldingsState;
}

export function useTokenManagement({
  loadPortfolio,
  state,
}: UseTokenManagementOptions) {
  const [editingToken, setEditingToken] = useState<PortfolioToken | null>(null);
  const [tokenToHide, setTokenToHide] = useState<PortfolioToken | null>(null);
  const [hidingToken, setHidingToken] = useState(false);
  const editModal = useDisclosure();

  const openEditTokenModal = (token: PortfolioToken) => {
    setEditingToken(token);
    editModal.onOpen();
  };

  const closeHideTokenModal = () => {
    if (hidingToken) return;
    setTokenToHide(null);
  };

  const confirmHideToken = async () => {
    if (!tokenToHide) return;
    const tokenKey = getPortfolioTokenKey(
      tokenToHide.chainId,
      tokenToHide.contractAddress,
    );
    setHidingToken(true);
    try {
      await hidePortfolioToken(tokenToHide);
      await clearHoldingsCaches();
      state.setTokens((previous) =>
        previous.filter(
          (token) =>
            getPortfolioTokenKey(token.chainId, token.contractAddress) !==
            tokenKey,
        ),
      );
      state.setHiddenTokenKeys((previous) => new Set(previous).add(tokenKey));
      state.setOnchainFetchedTokenKeys((previous) => {
        const next = new Set(previous);
        next.delete(tokenKey);
        return next;
      });
      state.setTotalValueUsd((previous) =>
        Math.max(0, previous - Math.max(0, tokenToHide.valueUsd || 0)),
      );
      setTokenToHide(null);
      await loadPortfolio(true, { forceSnapshot: true });
    } finally {
      setHidingToken(false);
    }
  };

  return {
    editingToken,
    tokenToHide,
    hidingToken,
    editModal,
    openEditTokenModal,
    openHideTokenModal: setTokenToHide,
    closeHideTokenModal,
    confirmHideToken,
  };
}

export type TokenManagement = ReturnType<typeof useTokenManagement>;
