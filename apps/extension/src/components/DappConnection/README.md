# Dapp connection UI

- `contenthashHistoryModel.ts` owns pure relative-time copy for ENS/IPFS
  provenance.
- `useEnsContenthashLastUpdated.ts` owns the trusted wallet-UI request to the
  background ENS history client. Lookup remains non-blocking while exposing
  stable loading, found, and unavailable presentation states.
- `useDappConnectionReputation.ts` asks the background for the request-ID-bound
  reputation result; it never accepts a renderer-supplied hostname.
- `reputationPresentation.ts` owns the pure source-to-copy/tone projection.
- `DappConnectionReputationNotice.tsx` renders loading, custom-domain
  verification, directory recognition, unverified, outage, blocklist, and
  lookalike states plus the explicit high-risk acknowledgement.

`DappConnectionConfirmation.tsx` remains the public composition root. The
background service worker owns network effects; this folder only formats and
presents the result.
