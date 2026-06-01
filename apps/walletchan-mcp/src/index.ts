#!/usr/bin/env node

import { ManagedRpcProcess } from "./managedRpc.js";
import { BasePluginCliRunner } from "./basePluginCli.js";
import { parseCli } from "./cli.js";
import { McpServer } from "./mcpServer.js";
import { RemoteMcpRegistry } from "./remoteMcp.js";
import { WalletChanRpcClient } from "./rpcClient.js";
import { RequestTracker } from "./requestTracker.js";
import { WalletChanTools } from "./tools.js";
import { DEFAULT_WEB_REQUEST_HOSTS, WebRequestTool } from "./webRequest.js";
import { WalletChanActionBuilder } from "./walletchanActions.js";
import { WalletChanApiClient } from "./walletchanApi.js";

try {
  const config = parseCli(process.argv);
  const rpc = new WalletChanRpcClient(config.rpcUrl);
  const walletchanApi = new WalletChanApiClient(config.walletchanApiBaseUrl);
  const rpcManager = new ManagedRpcProcess(
    {
      enabled: config.managedRpcEnabled,
      rpcUrl: config.rpcUrl,
      rpcHost: config.rpcHost,
      chains: config.rpcChains,
      rpcOverrides: config.rpcOverrides,
      forceNewSession: config.forceNewSession,
      includeBatching: config.includeBatching,
      walletConnectProjectId: config.walletConnectProjectId,
      requestTimeoutSeconds: config.requestTimeoutSeconds,
      upstreamTimeoutMs: config.upstreamTimeoutMs,
    },
    rpc,
  );
  const tracker = new RequestTracker();
  const webRequest = new WebRequestTool({
    enabled: config.webRequestEnabled,
    allowedHosts: [
      ...DEFAULT_WEB_REQUEST_HOSTS,
      ...config.webRequestHosts,
    ],
  });
  const basePluginCli = new BasePluginCliRunner({
    enabled: config.pluginCliEnabled,
    morphoApiUrl: config.morphoApiUrl,
    aerodromeRpcUrl: config.aerodromeRpcUrl,
  });
  const walletchanActions = new WalletChanActionBuilder(walletchanApi, rpc);
  const remoteMcp = new RemoteMcpRegistry();
  const tools = new WalletChanTools(
    rpc,
    tracker,
    rpcManager,
    webRequest,
    basePluginCli,
    walletchanActions,
    remoteMcp,
  );
  let shuttingDown = false;
  const shutdown = (): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    rpcManager.shutdown();
  };
  process.once("SIGINT", () => {
    shutdown();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    shutdown();
    process.exit(0);
  });
  process.once("exit", shutdown);
  new McpServer(tools, shutdown).start();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
}
