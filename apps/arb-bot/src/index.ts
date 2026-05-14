import { formatEther } from "viem";
import { config } from "./config.js";
import { account, publicClient, walletClient } from "./client.js";
import { log } from "./logger.js";
import { readPoolStates } from "./poolState.js";
import { detectPriceDivergence } from "./priceComparison.js";
import { findOptimalArb } from "./arbSearch.js";
import { encodeArbTx } from "./arbEncoder.js";
import { estimateGasCost } from "./gasEstimation.js";

let consecutiveErrors = 0;
const MAX_CONSECUTIVE_ERRORS = 10;

// Track nonce locally to avoid extra RPC call per tx
let currentNonce: number | null = null;

async function poll(): Promise<boolean> {
  try {
    // 1. Read pool states (single batch RPC — no balance fetch on hot path)
    const states = await readPoolStates();
    log.debug(
      `Direct sqrtPrice=${states.direct.sqrtPriceX96} tick=${states.direct.tick} | ` +
        `BNKRW sqrtPrice=${states.bnkrw.sqrtPriceX96} tick=${states.bnkrw.tick}`
    );

    // 2. Detect price divergence
    const divergence = detectPriceDivergence(states.direct, states.bnkrw);
    if (!divergence || divergence.priceDiffBps < 1) {
      log.debug("No price divergence detected");
      consecutiveErrors = 0;
      return false;
    }

    log.info(
      `Divergence: ${divergence.priceDiffBps} bps (${divergence.direction})${divergence.aboveThreshold ? " — searching..." : ""}`
    );

    if (!divergence.aboveThreshold) {
      consecutiveErrors = 0;
      return false;
    }

    // 3. Find optimal amount (batched quotes — 2 HTTP requests for coarse, 2 per ternary iter)
    const arb = await findOptimalArb(divergence.direction);
    if (!arb) {
      log.info("No profitable arb found after search");
      consecutiveErrors = 0;
      return false;
    }

    log.info(
      `Optimal arb: ${formatEther(arb.amountIn)} WETH → ${formatEther(arb.leg1Out)} intermediate → ${formatEther(arb.leg2Out)} WETH (profit: ${formatEther(arb.profit)} WETH)`
    );

    // 4. Encode the arb transaction
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 30);
    const arbTx = encodeArbTx(
      arb.direction,
      arb.amountIn,
      arb.leg1Out,
      arb.leg2Out,
      deadline
    );

    // 5. Estimate gas cost (also acts as simulation — reverts if tx would fail)
    let gasCost;
    try {
      gasCost = await estimateGasCost(
        { to: arbTx.to, data: arbTx.data, value: arbTx.value },
        account.address
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(`Gas estimation failed (tx would revert): ${msg}`);
      consecutiveErrors = 0;
      return false;
    }

    // 6. Check profitability
    const netProfit = arb.profit - gasCost.estimatedCostWei;
    if (netProfit < config.minProfitWei) {
      log.info(
        `Profit ${formatEther(arb.profit)} - gas ${formatEther(gasCost.estimatedCostWei)} = ${formatEther(netProfit)} ETH (below min ${formatEther(config.minProfitWei)})`
      );
      consecutiveErrors = 0;
      return false;
    }

    log.info(
      `Net profit: ${formatEther(netProfit)} ETH (after gas ${formatEther(gasCost.estimatedCostWei)})`
    );

    // 7. Execute — no separate simulation needed (estimateGas already validated)
    log.info("Sending arb transaction...");

    // Fetch nonce only on first tx or after failure
    if (currentNonce === null) {
      currentNonce = await publicClient.getTransactionCount({
        address: account.address,
      });
    }

    const hash = await walletClient.sendTransaction({
      account,
      chain: walletClient.chain,
      to: arbTx.to,
      data: arbTx.data,
      value: arbTx.value,
      gas: gasCost.gasLimit,
      maxFeePerGas: gasCost.maxFeePerGas,
      maxPriorityFeePerGas: gasCost.maxPriorityFeePerGas,
      nonce: currentNonce,
    });

    log.info(`Tx sent: ${hash}`);
    currentNonce++; // Increment locally for next tx

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const gasUsed = receipt.gasUsed * (receipt.effectiveGasPrice ?? 0n);

    if (receipt.status === "success") {
      log.info(
        `ARB SUCCESS! Tx: ${hash} | Gas used: ${formatEther(gasUsed)} ETH | Expected net profit: ${formatEther(netProfit)} ETH`
      );
    } else {
      log.error(`Tx reverted: ${hash}`);
      // Reset nonce on revert in case of nonce desync
      currentNonce = null;
    }

    consecutiveErrors = 0;
    return receipt.status === "success";
  } catch (e: unknown) {
    consecutiveErrors++;
    currentNonce = null; // Reset nonce on any error
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`Poll error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${msg}`);

    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      log.error("Too many consecutive errors, exiting");
      process.exit(1);
    }
    return false;
  }
}

async function main(): Promise<void> {
  log.info("Arb bot disabled — idling. Remove this line to re-enable."); await new Promise(() => {});
  log.info("=== WCHAN/BNKRW Cross-Pool Arb Bot ===");
  log.info(`Bot address: ${account.address}`);
  log.info(`Chain: ${config.chainId} (Base)`);
  log.info(`Poll interval: ${config.pollIntervalMs}ms`);
  log.info(`Min profit: ${formatEther(config.minProfitWei)} ETH`);
  log.info(`Slippage: ${config.slippageBps} bps`);
  log.info(`Min arb divergence: ${config.minArbBps} bps (sqrtPrice)`);
  log.debug(`RPC: ${config.rpcUrl.replace(/\/\/.*@/, "//***@")}`);

  // Initial balance check
  const balance = await publicClient.getBalance({
    address: account.address,
  });
  log.info(`Balance: ${formatEther(balance)} ETH`);

  if (balance === 0n) {
    log.warn("Bot has zero ETH balance — will only be able to do gas estimation, not execute");
  }

  // Poll loop
  while (true) {
    const executed = await poll();

    // Skip sleep after successful arb — pool state changed, check again immediately
    if (!executed) {
      await new Promise((resolve) => setTimeout(resolve, config.pollIntervalMs));
    }
  }
}

main().catch((e) => {
  log.error("Fatal:", e);
  process.exit(1);
});
