# Home composition audit map

- `HomeAlerts.tsx` owns the three independent home feedback surfaces: failed
  transaction, RPC issue, and reload-required alerts.
- `rpcIssueAlertModel.ts` owns pure RPC warning delay, dismissal, per-chain
  observations, recovery hysteresis, and stale timer decisions.
- `useRpcIssueAlert.ts` owns the delayed reveal timer. Live portfolio probes
  update only the chains they actually checked, and two healthy observations
  are required to clear a confirmed warning.

Home components receive state and callbacks from `App.tsx`. They do not own
request routing, account selection, tab resolution, or storage subscriptions.
