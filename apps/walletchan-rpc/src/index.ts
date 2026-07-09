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
import { WalletBridgeManager } from "./walletBridgeManager.js";
import type { SessionDisconnectInfo, SessionInfo } from "./walletBridge.js";

async function main(): Promise<void> {
  const config = parseCli(process.argv);
  let activeChain: RuntimeChain = config.chains[0];
  let server: ServerType | null = null;
  let reconnecting = false;
  let shuttingDown = false;

  const wallet = new WalletBridgeManager(config);

  const context: RpcContext = {
    bundleChains: new Map(),
    chains: config.chains,
    getActiveChain: () => activeChain,
    includeBatching: config.includeBatching,
    localBundles: new Map(),
    sequentialReceiptTimeoutMs: config.requestTimeoutSeconds * 1000,
    setActiveChain: (chain) => {
      activeChain = chain;
      log.dim(`Active chain switched to ${chain.name} (${chain.chainId})`);
    },
    upstreamTimeoutMs: config.upstreamTimeoutMs,
    wallet,
    switchWalletTransport: (transport, options) => wallet.switchTransport(transport, options),
  };

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    stopActiveSpinner();
    log.dim(`\n${signal} received. Stopping RPC server. ${formatTransportName()} session remains paired.`);
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
  wallet.onDisconnect((info) => {
    if (!shuttingDown) {
      void handleWalletDisconnect(info);
    }
  });

  const session = await wallet.init();
  if (session) {
    log.success(`Reused ${formatTransportName()} session: ${session.accounts.join(", ")}`);
    if (session.peerName) {
      log.dim(`Wallet: ${session.peerName}${session.peerUrl ? ` (${session.peerUrl})` : ""}`);
    }
    log.raw(style.blue("Force a fresh pairing with --force-new-session"));
  }

  if (!session) {
    if (config.forceNewSession) {
      log.dim(`Stored ${formatTransportName()} sessions cleared.`);
    }

    try {
      const newSession = await runPairingFlow();
      printReadyInfo(newSession);
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      log.warn(
        `RPC server is still running. Generate a new URI with curl http://${config.host}:${config.port}/pairing, open http://${config.host}:${config.port}/qr, or use the MCP get_pairing_uri tool.`,
      );
    }
  } else {
    printReadyInfo(session);
  }

  async function handleWalletDisconnect(info: SessionDisconnectInfo): Promise<void> {
    if (reconnecting) return;
    reconnecting = true;
    stopActiveSpinner();
    log.raw("");
    log.error(`${formatTransportName()} disconnected: ${info.reason}`);

    if (!process.stdin.isTTY) {
      log.warn(
        `Generate a new URI with curl http://${config.host}:${config.port}/pairing, open http://${config.host}:${config.port}/qr, or use the MCP get_pairing_uri tool.`,
      );
      reconnecting = false;
      return;
    }

    while (!shuttingDown && !wallet.connected) {
      await waitForEnter(`Press Enter to generate a new ${formatTransportName()} URI...`);
      if (shuttingDown || wallet.connected) break;

      try {
        const newSession = await runPairingFlow();
        printReadyInfo(newSession);
        break;
      } catch (error) {
        log.error(error instanceof Error ? error.message : String(error));
      }
    }

    reconnecting = false;
  }

  async function runPairingFlow(): Promise<SessionInfo> {
    const proposal = await wallet.createSessionProposal();
    const clipboard = await copyToClipboard(proposal.uri);

    log.info("Pair with a wallet:");
    if (clipboard.success) {
      log.info(`  Wallet app: scan the QR or paste the copied ${formatTransportName()} URI`);
    } else {
      log.info(`  Wallet app: scan the QR or paste the ${formatTransportName()} URI below`);
    }
    log.info(`  Browser QR: http://${config.host}:${config.port}/qr`);
    log.raw("");
    qrcode.generate(proposal.uri, { small: true }, (qr) => log.raw(qr));
    log.raw(proposal.uri);
    if (clipboard.success) {
      log.success(`Copied to clipboard (${clipboard.command})`);
    } else {
      log.warn(`Clipboard copy failed: ${clipboard.error || "unknown error"}`);
      log.warn(`Copy the ${formatTransportName()} URI above manually.`);
    }
    log.raw("");

    const approvedSession = await withSpinner("Waiting for wallet approval", proposal.approval);
    log.success(`Connected: ${approvedSession.accounts.join(", ")}`);
    if (approvedSession.peerName) {
      log.dim(
        `Wallet: ${approvedSession.peerName}${approvedSession.peerUrl ? ` (${approvedSession.peerUrl})` : ""}`,
      );
    }
    return approvedSession;
  }

  function printReadyInfo(readySession: SessionInfo): void {
    log.raw("");
    log.info(`Chains: ${formatChains(config.chains)}`);
    log.info(`Active chain: ${activeChain.name} (${activeChain.chainId})`);
    log.raw("");
    log.info("Cast example:");
    log.raw(
      `  cast send 0xContractAddress "transfer(address,uint256)" 0xRecipient 1000000000000000000 --rpc-url http://${config.host}:${config.port} --unlocked --from ${readySession.accounts[0] || "0xYourAddress"}`,
    );
    log.raw("");
    log.info("Forge script example:");
    log.raw(
      `  forge script script/Deploy.s.sol --rpc-url http://${config.host}:${config.port} --broadcast --unlocked --sender ${readySession.accounts[0] || "0xYourAddress"}`,
    );
  }

  function formatTransportName(): string {
    return wallet.transport === "metamask-connect" ? "MetaMask Connect" : "WalletConnect";
  }
}

function waitForEnter(message: string): Promise<void> {
  return new Promise((resolveWait) => {
    process.stdout.write(`${style.yellow(message)} `);
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.pause();
      resolveWait();
    });
  });
}

main().catch((error) => {
  log.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
