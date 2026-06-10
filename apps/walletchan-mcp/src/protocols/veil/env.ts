import { protocolDataDir } from "../localData.js";
import type { StdioMcpProcessConfig } from "../stdioMcpClient.js";

export interface VeilRuntimeConfig {
  enabled: boolean;
  privateActionsEnabled: boolean;
  dir?: string;
  rpcUrl?: string;
  relayUrl?: string;
  x402RelayUrl?: string;
  command?: string;
  args: string[];
  startupTimeoutMs: number;
  callTimeoutMs: number;
}

const DEFAULT_VEIL_PACKAGE = "@veil-cash/mcp@0.2.1";

export function buildVeilMcpProcessConfig(config: VeilRuntimeConfig): StdioMcpProcessConfig {
  const cwd = protocolDataDir("veil", config.dir);
  const invocation = resolveVeilInvocation(config);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    npm_config_audit: process.env.npm_config_audit || "false",
    npm_config_fund: process.env.npm_config_fund || "false",
    npm_config_loglevel: process.env.npm_config_loglevel || "error",
    npm_config_update_notifier: process.env.npm_config_update_notifier || "false",
  };

  if (config.rpcUrl) env.RPC_URL = config.rpcUrl;
  if (config.relayUrl) env.RELAY_URL = config.relayUrl;
  if (config.x402RelayUrl) env.X402_RELAY_URL = config.x402RelayUrl;

  return {
    id: "veil",
    name: "Veil",
    command: invocation.command,
    args: invocation.args,
    cwd,
    env,
    messageFormat: "newline",
    startupTimeoutMs: config.startupTimeoutMs,
    callTimeoutMs: config.callTimeoutMs,
  };
}

function resolveVeilInvocation(config: VeilRuntimeConfig): { command: string; args: string[] } {
  if (config.command && config.command.trim()) {
    return {
      command: config.command.trim(),
      args: config.args,
    };
  }
  return {
    command: npxBinary(),
    args: [
      "-y",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      DEFAULT_VEIL_PACKAGE,
      ...config.args,
    ],
  };
}

function npxBinary(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}
