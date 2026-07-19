# Dapp connection UI

- `contenthashHistoryModel.ts` owns pure relative-time copy for ENS/IPFS
  provenance.
- `useEnsContenthashLastUpdated.ts` owns the trusted wallet-UI request to the
  background ENS history client. Lookup remains non-blocking while exposing
  stable loading, found, and unavailable presentation states.

`DappConnectionConfirmation.tsx` remains the public composition root. The
background service worker owns network effects; this folder only formats and
presents the result.
