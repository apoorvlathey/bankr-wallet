# WCHAN staking reads audit map

`contractReads.ts` is the only staking RPC boundary. It validates the trusted
UI's owner and bounded decimal preview amount, resolves the extension's
configured Base RPC through the existing hardened transport, and performs only
the fixed vault/token read calls declared in `abi.ts`.

`vaultMetrics.ts` is the fixed WalletChan API boundary for the website's
canonical 7-day WCHAN, WETH, and total APY projection. It enforces the shared
redirect/credential/deadline/response-size policy and a bounded numeric schema.

The stable `chrome/staking.ts` facade re-exports this domain. It has no policy,
storage, or network implementation. `background/tokenDataRouter.ts` owns the
trusted-wallet-UI transport. Staking writes never pass through this read
domain; reviewed, account-pinned writes use the reset-aware internal execution
routes documented by `components/Staking/README.md`.
