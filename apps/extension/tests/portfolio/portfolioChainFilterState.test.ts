import assert from "node:assert/strict";
import test from "node:test";
import {
  createPortfolioChainFilterState,
  manuallySelectPortfolioChain,
  relinkPortfolioChain,
  setPortfolioDappNetworkFollowing,
  syncLinkedPortfolioChain,
} from "../../src/components/portfolioChainFilterState.ts";

test("manual portfolio filter survives leaving and returning to a dapp tab", () => {
  let state = createPortfolioChainFilterState(8453);
  state = manuallySelectPortfolioChain(state, null);

  state = syncLinkedPortfolioChain(state, 137);
  state = syncLinkedPortfolioChain(state, 8453);

  assert.equal(state.filterChainId, null);
  assert.equal(state.isLinkedToDapp, false);
});

test("linked portfolio filter follows dapp chain context", () => {
  let state = createPortfolioChainFilterState(8453);
  state = syncLinkedPortfolioChain(state, 137);

  assert.equal(state.filterChainId, 137);
  assert.equal(state.isLinkedToDapp, true);
});

test("an explicit chain switch relinks a manually detached portfolio filter", () => {
  let state = createPortfolioChainFilterState(8453);
  state = manuallySelectPortfolioChain(state, 1);
  state = relinkPortfolioChain(
    state,
    { revision: 1, tabId: 42, chainId: 137 },
    42,
  );

  assert.equal(state.filterChainId, 137);
  assert.equal(state.isLinkedToDapp, true);

  state = syncLinkedPortfolioChain(state, 130);
  assert.equal(state.filterChainId, 130);
});

test("a chain switch from another browser tab does not relink the active tab", () => {
  let state = createPortfolioChainFilterState(8453);
  state = manuallySelectPortfolioChain(state, null);
  state = relinkPortfolioChain(
    state,
    { revision: 1, tabId: 99, chainId: 137 },
    42,
  );

  assert.equal(state.filterChainId, null);
  assert.equal(state.isLinkedToDapp, false);
});

test("disabling dapp following shows all networks and ignores later chain changes", () => {
  let state = createPortfolioChainFilterState(8453);
  state = setPortfolioDappNetworkFollowing(state, false, 8453);
  state = syncLinkedPortfolioChain(state, 137);

  assert.equal(state.filterChainId, null);
  assert.equal(state.isLinkedToDapp, false);
});

test("enabling dapp following immediately applies the current dapp network", () => {
  let state = manuallySelectPortfolioChain(
    createPortfolioChainFilterState(8453),
    null,
  );
  state = setPortfolioDappNetworkFollowing(state, true, 137);

  assert.equal(state.filterChainId, 137);
  assert.equal(state.isLinkedToDapp, true);
});
