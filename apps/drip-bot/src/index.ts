import { formatEther, formatUnits } from "viem";
import { config } from "./config.js";
import { account, publicClient, walletClient } from "./client.js";
import { log } from "./logger.js";
import { dripRewardsAbi } from "./abi.js";

const contract = {
  address: config.dripContract,
  abi: dripRewardsAbi,
} as const;

let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 10;

// BUG FIX: Local cooldown to prevent duplicate drip txs from stale RPC reads.
//
// Problem: After a successful drip, the bot loops and immediately re-reads
// canDrip() + estimateGas(). These eth_call requests can be routed to a
// different node in the RPC provider's load-balanced cluster — one that hasn't
// processed the block containing our drip yet. So canDrip() returns true
// (stale pre-drip state), estimateGas simulates against the same stale block
// and passes, and the bot sends a duplicate tx that reverts with NothingToDrip().
//
// waitForTransactionReceipt only guarantees the node that RETURNED the receipt
// has the block — not that every subsequent eth_call hits that same node.
//
// Fix: Track last successful drip time locally and enforce minDripInterval as
// a sleep floor, ignoring potentially stale onchain reads.
let lastDripSuccessAt = 0n; // unix seconds

interface StreamState {
  startTimestamp: bigint;
  endTimestamp: bigint;
  lastDripTimestamp: bigint;
  amountRemaining: bigint;
}

function formatStream(name: string, s: StreamState): string {
  if (s.amountRemaining === 0n) return `${name}: inactive`;
  const end = new Date(Number(s.endTimestamp) * 1000).toISOString();
  const lastDrip = new Date(Number(s.lastDripTimestamp) * 1000).toISOString();
  return `${name}: ${formatEther(s.amountRemaining)} remaining, end=${end}, lastDrip=${lastDrip}`;
}

function computeNextDripTime(stream: StreamState, minInterval: bigint): bigint | null {
  // Inactive stream
  if (stream.amountRemaining === 0n) return null;

  const now = BigInt(Math.floor(Date.now() / 1000));

  // Past end — drip now (drain remaining)
  if (now >= stream.endTimestamp) return now;

  // Next drip = lastDripTimestamp + minDripInterval
  return stream.lastDripTimestamp + minInterval;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  log.info("=== WCHAN Drip Bot ===");
  log.info(`Bot address: ${account.address}`);
  log.info(`Contract: ${config.dripContract}`);
  log.info(`Max sleep: ${config.maxSleepMs / 1000}s`);

  const balance = await publicClient.getBalance({ address: account.address });
  log.info(`Balance: ${formatEther(balance)} ETH`);

  if (balance === 0n) {
    log.warn("Bot has zero ETH balance — cannot send transactions");
  }

  while (true) {
    try {
      // 1. Read stream states + minDripInterval
      const [wchanStreamRaw, wethStreamRaw, minInterval] = await Promise.all([
        publicClient.readContract({ ...contract, functionName: "wchanStream" }),
        publicClient.readContract({ ...contract, functionName: "wethStream" }),
        publicClient.readContract({ ...contract, functionName: "minDripInterval" }),
      ]);

      const wchanState: StreamState = {
        startTimestamp: wchanStreamRaw[0],
        endTimestamp: wchanStreamRaw[1],
        lastDripTimestamp: wchanStreamRaw[2],
        amountRemaining: wchanStreamRaw[3],
      };
      const wethState: StreamState = {
        startTimestamp: wethStreamRaw[0],
        endTimestamp: wethStreamRaw[1],
        lastDripTimestamp: wethStreamRaw[2],
        amountRemaining: wethStreamRaw[3],
      };

      log.info(formatStream("WCHAN", wchanState));
      log.info(formatStream("WETH", wethState));
      log.info(`minDripInterval: ${minInterval}s`);

      // 2. Compute next drip time for each stream
      const nextWchan = computeNextDripTime(wchanState, minInterval);
      const nextWeth = computeNextDripTime(wethState, minInterval);

      let sleepUntil: bigint;
      const now = BigInt(Math.floor(Date.now() / 1000));

      if (nextWchan === null && nextWeth === null) {
        // Both streams inactive — sleep MAX_SLEEP and re-check
        log.info("Both streams inactive. Sleeping for max interval...");
        sleepUntil = now + BigInt(Math.floor(config.maxSleepMs / 1000));
      } else if (nextWchan === null) {
        sleepUntil = nextWeth!;
      } else if (nextWeth === null) {
        sleepUntil = nextWchan;
      } else {
        sleepUntil = nextWchan < nextWeth ? nextWchan : nextWeth;
      }

      // 3. Enforce local cooldown to prevent stale-read duplicates.
      //    Onchain reads above may return stale lastDripTimestamp (from a
      //    load-balanced RPC node that's a block behind), computing sleepUntil
      //    in the past and skipping sleep. This local floor overrides that.
      if (lastDripSuccessAt > 0n) {
        const minFromLastDrip = lastDripSuccessAt + minInterval;
        if (minFromLastDrip > sleepUntil) {
          sleepUntil = minFromLastDrip;
        }
      }

      // 4. Cap sleep at MAX_SLEEP
      const maxSleepUntil = now + BigInt(Math.floor(config.maxSleepMs / 1000));
      if (sleepUntil > maxSleepUntil) {
        sleepUntil = maxSleepUntil;
      }

      const sleepMs = Number(sleepUntil - now) * 1000;
      if (sleepMs > 1000) {
        const wakeTime = new Date(Number(sleepUntil) * 1000).toISOString();
        log.info(`Sleeping until ${wakeTime} (${Math.round(sleepMs / 1000)}s)...`);
        await sleep(sleepMs);
      }

      // 5. Check canDrip()
      const [wchanCan, wethCan] = await publicClient.readContract({
        ...contract,
        functionName: "canDrip",
      });

      if (!wchanCan && !wethCan) {
        log.debug("canDrip() returned false for both streams, looping...");
        consecutiveErrors = 0;
        continue;
      }

      log.info(`canDrip: WCHAN=${wchanCan}, WETH=${wethCan}`);

      // 6. Preview what will be dripped
      const [previewWchan, previewWeth] = await publicClient.readContract({
        ...contract,
        functionName: "previewDrip",
      });
      log.info(
        `Preview: WCHAN=${formatEther(previewWchan)}, WETH=${formatEther(previewWeth)}`
      );

      // 7. Estimate gas (also acts as simulation).
      //    NOTE: This does NOT fully protect against stale reads — if the RPC
      //    node behind eth_estimateGas is also on a stale block, the simulation
      //    passes even though the tx will revert onchain. The local cooldown
      //    above (step 3) is the primary guard; this is defense-in-depth.
      let gasLimit: bigint;
      try {
        const estimated = await publicClient.estimateContractGas({
          ...contract,
          functionName: "drip",
          account: account.address,
        });
        gasLimit = (estimated * 120n) / 100n; // 20% buffer
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        log.warn(`Gas estimation failed (drip would revert): ${msg}`);
        consecutiveErrors = 0;
        continue;
      }

      // 8. Send drip() transaction
      log.info("Sending drip() transaction...");

      const hash = await walletClient.writeContract({
        ...contract,
        functionName: "drip",
        gas: gasLimit,
      });

      log.info(`Tx sent: ${hash}`);

      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      const gasUsed = receipt.gasUsed * (receipt.effectiveGasPrice ?? 0n);

      if (receipt.status === "success") {
        log.info(
          `DRIP SUCCESS! Tx: ${hash} | Gas used: ${formatEther(gasUsed)} ETH`
        );
        lastDripSuccessAt = BigInt(Math.floor(Date.now() / 1000));
      } else {
        log.error(`Tx reverted: ${hash}`);
      }

      consecutiveErrors = 0;
    } catch (e: unknown) {
      consecutiveErrors++;
      const msg = e instanceof Error ? e.message : String(e);
      log.error(
        `Error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${msg}`
      );

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        log.error("Too many consecutive errors, exiting");
        process.exit(1);
      }

      // Back off on errors — wait 30s before retrying
      await sleep(30_000);
    }
  }
}

main().catch((e) => {
  log.error("Fatal:", e);
  process.exit(1);
});
