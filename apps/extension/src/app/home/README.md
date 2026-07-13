# Home composition audit map

- `HomeAlerts.tsx` owns the three independent home feedback surfaces: failed
  transaction, RPC issue, and reload-required alerts.

Home components receive state and callbacks from `App.tsx`. They do not own
request routing, account selection, tab resolution, or storage subscriptions.
