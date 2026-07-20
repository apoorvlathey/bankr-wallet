export interface PortfolioChainFilterState {
  filterChainId: number | null;
  isLinkedToDapp: boolean;
  appliedRelinkRevision: number;
}

export interface PortfolioChainRelinkRequest {
  revision: number;
  tabId: number;
  chainId: number;
}

export function createPortfolioChainFilterState(
  connectedDappChainId: number | null,
): PortfolioChainFilterState {
  return {
    filterChainId: connectedDappChainId,
    isLinkedToDapp: true,
    appliedRelinkRevision: 0,
  };
}

export function syncLinkedPortfolioChain(
  state: PortfolioChainFilterState,
  connectedDappChainId: number | null,
): PortfolioChainFilterState {
  if (!state.isLinkedToDapp || state.filterChainId === connectedDappChainId) {
    return state;
  }
  return { ...state, filterChainId: connectedDappChainId };
}

export function manuallySelectPortfolioChain(
  state: PortfolioChainFilterState,
  filterChainId: number | null,
): PortfolioChainFilterState {
  return {
    ...state,
    filterChainId,
    isLinkedToDapp: false,
  };
}

export function setPortfolioDappNetworkFollowing(
  state: PortfolioChainFilterState,
  enabled: boolean,
  connectedDappChainId: number | null,
): PortfolioChainFilterState {
  return {
    ...state,
    filterChainId: enabled ? connectedDappChainId : null,
    isLinkedToDapp: enabled,
  };
}

export function relinkPortfolioChain(
  state: PortfolioChainFilterState,
  request: PortfolioChainRelinkRequest | null | undefined,
  connectedDappTabId: number | null,
): PortfolioChainFilterState {
  if (
    !request ||
    request.revision <= state.appliedRelinkRevision ||
    request.tabId !== connectedDappTabId
  ) {
    return state;
  }
  return {
    filterChainId: request.chainId,
    isLinkedToDapp: true,
    appliedRelinkRevision: request.revision,
  };
}
