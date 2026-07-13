# Background transport tests

These tests mirror `src/chrome/background/` and freeze transport behavior:

- exhaustive route audience/classification;
- trusted sender and exact tab/origin/frame forwarding;
- synchronous vs asynchronous Chrome channel lifetime;
- durable rejection/result payloads;
- dependency-injected side effects for auth, onboarding, settings, dapp,
  WalletConnect, watch-asset, chain-prompt, pending signing-request, and
  transaction-status routes;
- shared transaction-confirm claims and exact Bankr/private-key/seed handler
  arguments, plus reset-barrier ordering for swaps and sponsored submission;
- Bankr remote-signer proof, master-auth epoch, atomic account/credential
  commit, Never-session recovery, agent secret blocking, and best-effort
  post-commit mirrors;
- connected-origin read-only RPC forwarding with exact durable result payloads;
- connected provider rejection, ERC-7715 lock routing, signature-method/EIP-712
  validation, and chain-switch notification cooldown/effect ordering;
- synchronous reset-claim installation, restored master-only proof, sponsored
  intent blocking, destructive reset effect order, and exact storage manifests;
- Chrome lifecycle registration/startup order, per-listener contracts, and the
  invariant that lifecycle composition owns exactly one ordered message listener;
- five-line entrypoint purity, bootstrap purity, exact route order, audit-sized
  route-family composition, and a cycle-free composition graph;
- exact swap/bridge quote and catalog request shapes, token CRUD coercion,
  metadata/price/image helpers, and bigint allowance/balance response shapes;
- ERC-5792 durable provider routing and request claims, EIP-7702 argument
  forwarding, cross-dapp source/active-batch lease composition, ERC-7715
  provider/account scope, and exact gas/simulation argument forwarding.

Domain business logic is tested in its own folder. These tests prove that the
composition layer delegates to it without weakening the boundary.
