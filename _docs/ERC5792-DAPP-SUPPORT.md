# ERC-5792 for Dapps — Upgrading from Multiple Popups to a Single Popup

A practical guide for **dapp developers** who want to bundle multi-step flows (`approve → swap`, `permit → deposit`, `claim → restake`, `wrap → transfer`, …) into a **single wallet popup** using ERC-5792 + wagmi — while gracefully falling back to the old multi-popup flow for wallets that don't support batching.

This guide is **wallet-agnostic**. It works for WalletChan, but also for any wallet that implements ERC-5792 (Coinbase Smart Wallet, MetaMask 7702, Safe, Rabby, etc.).

**Spec**: https://eips.ethereum.org/EIPS/eip-5792
**Wagmi docs**: https://wagmi.sh/react/api/hooks/useSendCalls

---

## Why bother?

Today's typical "do something with an ERC-20" flow looks like this:

1. Dapp calls `approve(spender, amount)` → wallet popup #1
2. User waits for receipt
3. Dapp calls the actual action (`swap`, `deposit`, `wrap`, …) → wallet popup #2
4. User waits for receipt

That's **two signatures, two confirmations, two receipts to track, two failure modes** to handle. Users churn at every popup. With ERC-5792 you get:

- **One** wallet popup that shows both calls together
- **Atomic execution** when supported (either all calls succeed or none do — no half-broken state where the approve went through but the swap reverted)
- A single **bundle ID** to poll for status

For wallets that don't support it, your existing flow keeps working — you just feature-detect and choose.

---

## The three wagmi hooks

Wagmi v2 exposes ERC-5792 through three hooks:

| Hook | Purpose | Maps to JSON-RPC |
|---|---|---|
| `useCapabilities` | Ask the wallet what it can do on a given chain | `wallet_getCapabilities` |
| `useSendCalls` | Send a batch of calls as one bundle | `wallet_sendCalls` |
| `useCallsStatus` | Poll a bundle's status until confirmed | `wallet_getCallsStatus` |

That's the entire API surface. No new providers, no new connectors — they work with any wagmi-connected wallet.

---

## Step 1 — Detect support with `useCapabilities`

```tsx
import { useCapabilities } from "wagmi";

const { data: capabilities } = useCapabilities({
  account: address,
  chainId: 8453, // the chain you're about to send the batch on
  query: { enabled: !!address },
});

const atomicStatus = capabilities?.atomic?.status;
const supportsAtomicBatch =
  atomicStatus === "supported" || atomicStatus === "ready";
```

The `atomic.status` field is one of:

| Value | Meaning | Treat as supported? |
|---|---|---|
| `"supported"` | Wallet executes the bundle atomically | ✅ Yes |
| `"ready"` | Wallet is upgrade-eligible (e.g., EOA → 7702) and will batch atomically when triggered | ✅ Yes |
| `"unsupported"` | Wallet has no batching at all | ❌ Fall back to multi-popup |
| `undefined` | Wallet doesn't implement `wallet_getCapabilities` (legacy) | ❌ Fall back to multi-popup |

> **Tip — check per chain.** A wallet may support batching on Base but not on a custom chain. Always pass the `chainId` you're about to use.

> **Note — non-atomic batching exists too.** Some wallets (including WalletChan for EOA accounts) report `"supported"` but execute calls as **separate sequential transactions** under the hood. From your dapp's perspective this still means "one popup instead of N", which is what users care about. If you absolutely need atomicity, set `forceAtomic: true` on `sendCalls` (see Step 2) — non-atomic wallets will then reject rather than silently de-atomize.

---

## Step 2 — Send the bundle with `useSendCalls`

Each call is a `{ to, value, data }` triplet. Build them with viem's `encodeFunctionData`:

```tsx
import { useSendCalls } from "wagmi";
import { encodeFunctionData, maxUint256 } from "viem";

const { sendCalls, data: sendData, isPending, reset } = useSendCalls();

function migrate(amount: bigint) {
  const calls: { to: `0x${string}`; value: bigint; data: `0x${string}` }[] = [];

  // Conditionally include approve only when needed
  if (needsApproval) {
    calls.push({
      to: TOKEN_ADDR,
      value: 0n,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [SPENDER, maxUint256], // see "Approve patterns" below
      }),
    });
  }

  calls.push({
    to: SPENDER,
    value: 0n,
    data: encodeFunctionData({
      abi: spenderAbi,
      functionName: "wrap", // or "swap", "deposit", whatever your action is
      args: [amount],
    }),
  });

  sendCalls({
    calls,
    chainId: 8453,
    forceAtomic: true, // see notes below
  });
}

const bundleId = sendData?.id; // returned immediately, before user confirms
```

### Key arguments

| Arg | Notes |
|---|---|
| `calls` | Array of `{ to, value, data }`. Build conditionally — skip the approve if allowance is already sufficient. |
| `chainId` | Chain to execute on. Wagmi will switch the wallet if needed. |
| `forceAtomic` | Reject the request if the wallet can't guarantee atomic execution. Set to `true` when half-execution would be unsafe (e.g., approve+swap where a stranded approve is bad). Leave `false`/omitted to allow non-atomic wallets to execute sequentially. |
| `from` | Optional, defaults to the connected account. |
| `id` | Optional client-supplied bundle ID for idempotency. |

### Approve patterns inside a bundle

You have two reasonable choices:

- **`maxUint256`** — approve infinite once, future top-ups don't re-trigger a batch. Most ergonomic. Use when the spender is a trusted contract.
- **Exact amount** — re-approve every time. Safer for less-trusted spenders, but every call costs you a fresh approve in the bundle.

Either is fine — the point is that **the user only sees one popup**.

You can also skip the approve entirely if `allowance >= amount`, by checking with `useReadContract({ functionName: 'allowance' })` first and only pushing the approve into `calls` when needed.

---

## Step 3 — Track confirmation with `useCallsStatus`

`useSendCalls` returns the bundle ID **immediately** (before the user confirms). To know when the bundle actually lands on-chain, poll with `useCallsStatus`:

```tsx
import { useCallsStatus } from "wagmi";

const { data: status } = useCallsStatus({
  id: bundleId ?? "",
  query: {
    enabled: !!bundleId,
    // Poll while pending; stop polling once we have a terminal status
    refetchInterval: ({ state }) =>
      state.data?.status === "pending" || state.data?.status === undefined
        ? 1500
        : false,
  },
});

const isConfirming =
  !!bundleId && (status?.status === "pending" || status?.status === undefined);
const isConfirmed = status?.status === "success";
const isFailed = status?.status === "failure";

// First receipt's tx hash is the most useful link for atomic bundles.
// For non-atomic bundles, walk the receipts array — the meaningful one
// (e.g., the swap, not the approve) is typically the last successful tx.
const txHash = status?.receipts?.[0]?.transactionHash;
```

### Status values

| `status.status` | Meaning |
|---|---|
| `undefined` | Awaiting user confirmation or just submitted |
| `"pending"` | Submitted, waiting for inclusion |
| `"success"` | All calls landed on-chain successfully |
| `"failure"` | Bundle reverted or was rejected |

The `receipts` array contains one receipt per **on-chain transaction** in the bundle (one for atomic, multiple for non-atomic). Each receipt has the same shape as a normal `eth_getTransactionReceipt` (logs, gasUsed, status, transactionHash).

---

## Step 4 — Wire up the fallback

Here's the canonical pattern: keep your existing two-step flow, and **route through the batched flow only when supported**.

```tsx
function handleAction() {
  if (supportsAtomicBatch) {
    // One popup
    sendBatchedCalls();
  } else if (needsApproval) {
    // Old flow, popup #1
    sendApprove();
  } else {
    // Old flow, popup #2
    sendAction();
  }
}
```

Your button label collapses too:

```tsx
function getButtonLabel() {
  if (isBusy) return "Processing…";
  if (needsApproval && !supportsAtomicBatch) return "Approve";
  return "Confirm"; // single label for the batched path
}
```

Users on capable wallets see **one button click → one popup → done**. Users on legacy wallets see the same UX they had before. No regressions, strictly additive.

---

## Complete minimal example

A full approve-and-action flow with capability detection, batched send, fallback, and status tracking. This is essentially what `apps/website/app/migrate/MigrateContent.tsx` does — adapt it to your contracts.

```tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
  useCapabilities,
  useSendCalls,
  useCallsStatus,
} from "wagmi";
import { encodeFunctionData, maxUint256, parseUnits } from "viem";

const TOKEN = "0x..." as `0x${string}`;
const SPENDER = "0x..." as `0x${string}`;
const CHAIN_ID = 8453;

export function ActionButton() {
  const { address } = useAccount();
  const [amount, setAmount] = useState<bigint>(0n);

  // --- 1. Read allowance to decide if approve is needed ---
  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: TOKEN,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, SPENDER] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  });
  const needsApproval = (allowance ?? 0n) < amount;

  // --- 2. Capability detection ---
  const { data: caps } = useCapabilities({
    account: address,
    chainId: CHAIN_ID,
    query: { enabled: !!address },
  });
  const atomicStatus = caps?.atomic?.status;
  const supportsAtomicBatch =
    atomicStatus === "supported" || atomicStatus === "ready";

  // --- 3a. Legacy flow: separate approve + action ---
  const { writeContract: writeApprove, data: approveTx, isPending: isApproving } =
    useWriteContract();
  const { writeContract: writeAction, data: actionTx, isPending: isActing } =
    useWriteContract();
  const { isLoading: isApproveConfirming, isSuccess: isApproveConfirmed } =
    useWaitForTransactionReceipt({ hash: approveTx });
  const { isLoading: isActionConfirming, isSuccess: isActionConfirmed } =
    useWaitForTransactionReceipt({ hash: actionTx });

  // --- 3b. Batched flow: sendCalls + status polling ---
  const { sendCalls, data: sendData, isPending: isSending, reset: resetBatch } =
    useSendCalls();
  const bundleId = sendData?.id;
  const { data: bundleStatus } = useCallsStatus({
    id: bundleId ?? "",
    query: {
      enabled: !!bundleId,
      refetchInterval: ({ state }) =>
        state.data?.status === "pending" || state.data?.status === undefined
          ? 1500
          : false,
    },
  });
  const isBatchConfirming =
    !!bundleId &&
    (bundleStatus?.status === "pending" || bundleStatus?.status === undefined);
  const isBatchConfirmed = bundleStatus?.status === "success";

  const isBusy =
    isApproving ||
    isApproveConfirming ||
    isActing ||
    isActionConfirming ||
    isSending ||
    isBatchConfirming;

  // --- 4. Handlers ---
  const sendBatched = useCallback(() => {
    const calls: { to: `0x${string}`; value: bigint; data: `0x${string}` }[] = [];
    if (needsApproval) {
      calls.push({
        to: TOKEN,
        value: 0n,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [SPENDER, maxUint256],
        }),
      });
    }
    calls.push({
      to: SPENDER,
      value: 0n,
      data: encodeFunctionData({
        abi: spenderAbi,
        functionName: "doSomething",
        args: [amount],
      }),
    });
    sendCalls({ calls, chainId: CHAIN_ID, forceAtomic: true });
  }, [needsApproval, amount, sendCalls]);

  const onClick = () => {
    if (supportsAtomicBatch) sendBatched();
    else if (needsApproval) {
      writeApprove({
        address: TOKEN,
        abi: erc20Abi,
        functionName: "approve",
        args: [SPENDER, amount],
        chainId: CHAIN_ID,
      });
    } else {
      writeAction({
        address: SPENDER,
        abi: spenderAbi,
        functionName: "doSomething",
        args: [amount],
        chainId: CHAIN_ID,
      });
    }
  };

  // --- 5. Refresh on success (handles all three flows) ---
  const lastBundleRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (isApproveConfirmed) refetchAllowance();
    if (isActionConfirmed) {
      /* refetch balances, show toast, etc. */
    }
    if (
      isBatchConfirmed &&
      bundleId &&
      lastBundleRef.current !== bundleId
    ) {
      lastBundleRef.current = bundleId;
      refetchAllowance();
      /* refetch balances, show toast, etc. */
      resetBatch();
    }
  }, [
    isApproveConfirmed,
    isActionConfirmed,
    isBatchConfirmed,
    bundleId,
    refetchAllowance,
    resetBatch,
  ]);

  return (
    <button onClick={onClick} disabled={isBusy}>
      {isBusy
        ? "Processing…"
        : needsApproval && !supportsAtomicBatch
          ? "Approve"
          : "Confirm"}
    </button>
  );
}
```

---

## Common pitfalls

### 1. Don't forget the `query.enabled` guard on `useCallsStatus`

`useCallsStatus({ id: "" })` will throw or churn requests. Always gate it on `!!bundleId`.

```tsx
useCallsStatus({
  id: bundleId ?? "",
  query: { enabled: !!bundleId, ... },
});
```

### 2. Don't gate batching on a hardcoded wallet check

Wrong:
```tsx
if (connector?.id === "coinbaseWallet") sendBatched();
```

Right:
```tsx
if (supportsAtomicBatch) sendBatched();
```

The capability check is the source of truth — it works for any present and future wallet that implements ERC-5792. Hardcoding wallet IDs guarantees you'll miss new entrants.

### 3. Bundle ID ≠ tx hash

`useSendCalls` returns a `bundleId`, **not** a transaction hash. Don't hand the bundle ID to a block explorer URL. Get the actual `txHash` from `bundleStatus.receipts[i].transactionHash` once the bundle confirms:

```tsx
const txUrl = bundleStatus?.receipts?.[0]
  ? `https://basescan.org/tx/${bundleStatus.receipts[0].transactionHash}`
  : undefined;
```

### 4. Re-firing the success effect

`isBatchConfirmed` stays `true` after success. If your `useEffect` dispatches a toast on `isBatchConfirmed`, you'll spam toasts. Guard with a `useRef` keyed on `bundleId`:

```tsx
const lastBundleRef = useRef<string | undefined>(undefined);
useEffect(() => {
  if (isBatchConfirmed && bundleId && lastBundleRef.current !== bundleId) {
    lastBundleRef.current = bundleId;
    /* fire side effects exactly once */
  }
}, [isBatchConfirmed, bundleId]);
```

### 5. `forceAtomic: true` on a non-atomic wallet rejects

If you set `forceAtomic: true`, wallets that can only execute sequentially will reject the request. That's usually what you want (clean error rather than partial state), but **make sure your error toast is informative** — users on those wallets will see "request rejected" without context.

If sequential execution is acceptable for your flow (e.g., approve+swap where a stranded approve isn't fatal), omit `forceAtomic` and let the wallet decide.

### 6. Calls run in order, but state isn't visible until confirmation

Within a bundle, `calls[1]` runs after `calls[0]`. So you can `approve` in `calls[0]` and `transferFrom` in `calls[1]` — the allowance is set before the second call reads it.

But: **your dapp's `useReadContract` hooks won't see intermediate state mid-bundle**. They only re-read after the bundle confirms (and your `refetch` runs). Don't try to chain wagmi reads between calls in the same bundle.

### 7. Static values inside `calls`

The `calls` array is encoded **at the time of `sendCalls`**, not at execution time. If `calls[1]` depends on the *output* of `calls[0]` (e.g., "claim X tokens, then transfer exactly X"), you need to know `X` at build time. For dynamic chaining, deploy a small helper contract that reads its own balance and forwards — or use ERC-7821 directly.

---

## When NOT to use this

ERC-5792 is great for:
- ✅ approve + action (swap, deposit, wrap, stake, …)
- ✅ multiple claims in one popup (e.g., claim from N reward sources)
- ✅ permit + action (saves a signature instead of an approve, but still bundles)
- ✅ migration flows (approve old → wrap → forward, etc.)

It's not the right tool for:
- ❌ Long-lived signed intents (use EIP-712 + a relayer)
- ❌ Cross-chain flows (`sendCalls` is per-chain — bundle on each chain separately)
- ❌ Calls that need to consume mid-bundle return values (see pitfall #7)

---

## Wallet support landscape

As of early 2026, ERC-5792 is supported by:

| Wallet | Atomic | Notes |
|---|---|---|
| Coinbase Smart Wallet | ✅ | Native (smart account) |
| MetaMask (with EIP-7702 upgrade) | ✅ | Reports `"ready"` for un-upgraded EOAs |
| Safe (via SafeApps SDK) | ✅ | Native multisig batching |
| Rabby | ✅ | Smart account flows |
| WalletChan — Bankr API accounts | ✅ | ERC-7821 atomic via Bankr API |
| WalletChan — PK / Seed Phrase accounts | ⚠️ Sequential | Reports `"supported"` but executes as separate sequential txs (EIP-7702 atomic in roadmap) |
| Legacy EOA wallets without 7702 | ❌ | Use the fallback branch |

The point of capability detection is that **you don't need to keep this table up to date in your code**. Just check `caps?.atomic?.status` and let each wallet self-report.

---

## TL;DR

```tsx
// 1. Detect
const { data: caps } = useCapabilities({ account: address, chainId });
const supported = ["supported", "ready"].includes(caps?.atomic?.status ?? "");

// 2. Send (when supported)
const { sendCalls, data } = useSendCalls();
sendCalls({ calls: [approveCall, actionCall], chainId, forceAtomic: true });

// 3. Track
const { data: status } = useCallsStatus({
  id: data?.id ?? "",
  query: { enabled: !!data?.id, refetchInterval: 1500 },
});

// 4. Fall back to writeContract on !supported
```

That's it. Five hooks, one branch, single popup for everyone with a modern wallet — and zero regression for everyone else.
