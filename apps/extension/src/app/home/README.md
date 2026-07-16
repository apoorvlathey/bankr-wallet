# Home composition audit map

- `HomeAlerts.tsx` owns the three independent home feedback surfaces: failed
  transaction, RPC issue, and reload-required alerts.
- `rpcIssueAlertModel.ts` owns pure RPC warning delay, dismissal, and stale
  timer decisions.
- `useRpcIssueAlert.ts` owns the single three-second reveal timer. Live
  successful refreshes cancel pending warnings before they paint.

Home components receive state and callbacks from `App.tsx`. They do not own
request routing, account selection, tab resolution, or storage subscriptions.
