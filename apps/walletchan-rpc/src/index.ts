#!/usr/bin/env node

import qrcode from "qrcode-terminal";
import type { ServerType } from "@hono/node-server";
import { formatCliSummary, parseCli } from "./cli.js";
import { copyToClipboard } from "./clipboard.js";
import type { RuntimeChain } from "./chains.js";
import { formatChains } from "./chains.js";
import { log, stopActiveSpinner, style, withSpinner } from "./logger.js";
import { startRpcServer } from "./rpcServer.js";
import type { RpcContext } from "./rpcHandler.js";
import { WalletConnectBridge } from "./walletConnect.js";

async function main(): Promise<void> {
  const config = parseCli(process.argv);
  let activeChain: RuntimeChain = config.chains[0];
  let server: ServerType | null = null;
  let shuttingDown = false;

  const wallet = new WalletConnectBridge({
    chains: config.chains,
    forceNewSession: config.forceNewSession,
    host: config.host,
    includeBatching: config.includeBatching,
    port: config.port,
    projectId: config.projectId,
    requestTimeoutSeconds: config.requestTimeoutSeconds,
  });

  const context: RpcContext = {
    bundleChains: new Map(),
    chains: config.chains,
    getActiveChain: () => activeChain,
    includeBatching: config.includeBatching,
    setActiveChain: (chain) => {
      activeChain = chain;
      log.dim(`Active chain switched to ${chain.name} (${chain.chainId})`);
    },
    upstreamTimeoutMs: config.upstreamTimeoutMs,
    wallet,
  };

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopActiveSpinner();
    log.dim(`\n${signal} received. Stopping RPC server. WalletConnect session remains paired.`);
    server?.close();
    wallet.close();
    process.exit(0);
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  log.raw(style.bold("WalletChan RPC"));
  log.raw(formatCliSummary(config));
  log.raw("");

  server = startRpcServer(config, context);

  let session = await wallet.init();
  if (session) {
    log.success(`Reused WalletConnect session: ${session.accounts.join(", ")}`);
    if (session.peerName) {
      log.dim(`Wallet: ${session.peerName}${session.peerUrl ? ` (${session.peerUrl})` : ""}`);
    }
    log.raw(style.blue("Force a fresh pairing with --force-new-session"));
  }

  if (!session) {
    if (config.forceNewSession) {
      log.dim("Stored WalletConnect sessions cleared.");
    }

    const proposal = await wallet.createSessionProposal();
    const clipboard = await copyToClipboard(proposal.uri);

    log.info("Pair with a wallet:");
    if (clipboard.success) {
      log.info("  WalletChan extension: More -> WalletConnect -> paste");
    } else {
      log.info("  WalletChan extension: More -> WalletConnect -> paste the URI below");
    }
    log.info("  Mobile wallet: scan the QR");
    log.raw("");
    qrcode.generate(proposal.uri, { small: true }, (qr) => log.raw(qr));
    log.raw(proposal.uri);
    if (clipboard.success) {
      log.success(`Copied to clipboard (${clipboard.command})`);
    } else {
      log.warn(`Clipboard copy failed: ${clipboard.error || "unknown error"}`);
      log.warn("Copy the WalletConnect URI above manually.");
    }
    log.raw("");

    session = await withSpinner("Waiting for wallet approval", proposal.approval);
    log.success(`Connected: ${session.accounts.join(", ")}`);
    if (session.peerName) {
      log.dim(`Wallet: ${session.peerName}${session.peerUrl ? ` (${session.peerUrl})` : ""}`);
    }
  }

  log.raw("");
  log.info(`Chains: ${formatChains(config.chains)}`);
  log.info(`Active chain: ${activeChain.name} (${activeChain.chainId})`);
  log.raw("");
  log.info("Cast example:");
  log.raw(
    `  cast send 0xContractAddress "transfer(address,uint256)" 0xRecipient 1000000000000000000 --rpc-url http://${config.host}:${config.port} --unlocked --from ${session.accounts[0] || "0xYourAddress"}`,
  );
  log.raw("");
  log.info("Forge script example:");
  log.raw(
    `  forge script script/Deploy.s.sol --rpc-url http://${config.host}:${config.port} --broadcast --unlocked --sender ${session.accounts[0] || "0xYourAddress"}`,
  );
}

main().catch((error) => {
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
