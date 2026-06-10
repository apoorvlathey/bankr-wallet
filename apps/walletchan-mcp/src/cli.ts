import { WALLETCHAN_BASE_RPC_URL } from "./walletchanRpcDefaults.js";

export interface CliConfig {
  rpcUrl: string;
  rpcHost: string;
  walletchanApiBaseUrl: string;
  managedRpcEnabled: boolean;
  rpcChains: string[];
  rpcOverrides: string[];
  webRequestEnabled: boolean;
  webRequestHosts: string[];
  pluginCliEnabled: boolean;
  morphoApiUrl?: string;
  aerodromeRpcUrl?: string;
  veilEnabled: boolean;
  veilPrivateActionsEnabled: boolean;
  veilDir?: string;
  baseRpcUrl: string;
  veilRelayUrl?: string;
  veilX402RelayUrl?: string;
  veilCommand?: string;
  veilArgs: string[];
  veilStartupTimeoutMs: number;
  veilCallTimeoutMs: number;
  forceNewSession: boolean;
  includeBatching: boolean;
  walletConnectProjectId?: string;
  requestTimeoutSeconds: number;
  upstreamTimeoutMs: number;
}

export function parseCli(argv: string[]): CliConfig {
  const args = stripForwardedSeparator(argv).slice(2);
  let rpcUrl = process.env.WALLETCHAN_RPC_URL || "http://127.0.0.1:4209";
  let rpcHost =
    process.env.WALLETCHAN_MCP_RPC_HOST ||
    process.env.WALLETCHAN_RPC_HOST ||
    "127.0.0.1";
  let walletchanApiBaseUrl =
    process.env.WALLETCHAN_MCP_API_BASE ||
    process.env.WALLETCHAN_API_BASE ||
    "https://walletchan.com/api";
  let managedRpcEnabled = process.env.WALLETCHAN_MCP_MANAGED_RPC !== "false";
  const rpcChains: string[] = parseEnvHosts(process.env.WALLETCHAN_MCP_CHAINS);
  const rpcOverrides: string[] = parseEnvHosts(process.env.WALLETCHAN_MCP_RPC_OVERRIDES);
  let webRequestEnabled = process.env.WALLETCHAN_MCP_WEB_REQUEST !== "false";
  const webRequestHosts: string[] = parseEnvHosts(process.env.WALLETCHAN_MCP_WEB_HOSTS);
  let pluginCliEnabled = process.env.WALLETCHAN_MCP_PLUGIN_CLI !== "false";
  const morphoApiUrl = process.env.WALLETCHAN_MCP_MORPHO_API_URL;
  const aerodromeRpcUrl = process.env.WALLETCHAN_MCP_AERODROME_RPC_URL;
  let veilEnabled = process.env.WALLETCHAN_MCP_VEIL !== "false";
  let veilPrivateActionsEnabled = process.env.WALLETCHAN_MCP_VEIL_PRIVATE_ACTIONS === "true";
  let veilDir = process.env.WALLETCHAN_MCP_VEIL_DIR;
  let veilRelayUrl = process.env.WALLETCHAN_MCP_VEIL_RELAY_URL;
  let veilX402RelayUrl = process.env.WALLETCHAN_MCP_VEIL_X402_RELAY_URL;
  let veilCommand = process.env.WALLETCHAN_MCP_VEIL_COMMAND;
  const veilArgs = parseEnvArgs(process.env.WALLETCHAN_MCP_VEIL_ARGS);
  let veilStartupTimeoutMs = parseOptionalPositiveInteger(
    process.env.WALLETCHAN_MCP_VEIL_STARTUP_TIMEOUT_MS,
    "WALLETCHAN_MCP_VEIL_STARTUP_TIMEOUT_MS",
  ) ?? 120_000;
  let veilCallTimeoutMs = parseOptionalPositiveInteger(
    process.env.WALLETCHAN_MCP_VEIL_CALL_TIMEOUT_MS,
    "WALLETCHAN_MCP_VEIL_CALL_TIMEOUT_MS",
  ) ?? 120_000;
  let forceNewSession = false;
  let includeBatching = true;
  let walletConnectProjectId =
    process.env.WALLETCHAN_MCP_WALLETCONNECT_PROJECT_ID ||
    process.env.WALLETCONNECT_PROJECT_ID ||
    process.env.WC_PROJECT_ID;
  let requestTimeoutSeconds = 300;
  let upstreamTimeoutMs = 15000;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--rpc-url") {
      rpcUrl = requireValue(args, ++i, "--rpc-url");
    } else if (arg.startsWith("--rpc-url=")) {
      rpcUrl = arg.slice("--rpc-url=".length);
    } else if (arg === "--rpc-host") {
      rpcHost = requireValue(args, ++i, "--rpc-host");
    } else if (arg.startsWith("--rpc-host=")) {
      rpcHost = arg.slice("--rpc-host=".length);
    } else if (arg === "--api-base") {
      walletchanApiBaseUrl = requireValue(args, ++i, "--api-base");
    } else if (arg.startsWith("--api-base=")) {
      walletchanApiBaseUrl = arg.slice("--api-base=".length);
    } else if (arg === "--no-managed-rpc") {
      managedRpcEnabled = false;
    } else if (arg === "--chain") {
      rpcChains.push(requireValue(args, ++i, "--chain"));
    } else if (arg.startsWith("--chain=")) {
      rpcChains.push(arg.slice("--chain=".length));
    } else if (arg === "--rpc") {
      rpcOverrides.push(requireValue(args, ++i, "--rpc"));
    } else if (arg.startsWith("--rpc=")) {
      rpcOverrides.push(arg.slice("--rpc=".length));
    } else if (arg === "--allow-web-host") {
      webRequestHosts.push(requireValue(args, ++i, "--allow-web-host"));
    } else if (arg.startsWith("--allow-web-host=")) {
      webRequestHosts.push(arg.slice("--allow-web-host=".length));
    } else if (arg === "--disable-web-request") {
      webRequestEnabled = false;
    } else if (arg === "--disable-plugin-cli") {
      pluginCliEnabled = false;
    } else if (arg === "--disable-veil") {
      veilEnabled = false;
    } else if (arg === "--enable-veil-private-actions") {
      veilPrivateActionsEnabled = true;
    } else if (arg === "--veil-dir") {
      veilDir = requireValue(args, ++i, "--veil-dir");
    } else if (arg.startsWith("--veil-dir=")) {
      veilDir = arg.slice("--veil-dir=".length);
    } else if (arg === "--veil-relay-url") {
      veilRelayUrl = requireValue(args, ++i, "--veil-relay-url");
    } else if (arg.startsWith("--veil-relay-url=")) {
      veilRelayUrl = arg.slice("--veil-relay-url=".length);
    } else if (arg === "--veil-x402-relay-url") {
      veilX402RelayUrl = requireValue(args, ++i, "--veil-x402-relay-url");
    } else if (arg.startsWith("--veil-x402-relay-url=")) {
      veilX402RelayUrl = arg.slice("--veil-x402-relay-url=".length);
    } else if (arg === "--veil-command") {
      veilCommand = requireValue(args, ++i, "--veil-command");
    } else if (arg.startsWith("--veil-command=")) {
      veilCommand = arg.slice("--veil-command=".length);
    } else if (arg === "--veil-arg") {
      veilArgs.push(requireValue(args, ++i, "--veil-arg"));
    } else if (arg.startsWith("--veil-arg=")) {
      veilArgs.push(arg.slice("--veil-arg=".length));
    } else if (arg === "--veil-startup-timeout") {
      veilStartupTimeoutMs = parsePositiveInteger(
        requireValue(args, ++i, "--veil-startup-timeout"),
        "--veil-startup-timeout",
      );
    } else if (arg.startsWith("--veil-startup-timeout=")) {
      veilStartupTimeoutMs = parsePositiveInteger(
        arg.slice("--veil-startup-timeout=".length),
        "--veil-startup-timeout",
      );
    } else if (arg === "--veil-call-timeout") {
      veilCallTimeoutMs = parsePositiveInteger(
        requireValue(args, ++i, "--veil-call-timeout"),
        "--veil-call-timeout",
      );
    } else if (arg.startsWith("--veil-call-timeout=")) {
      veilCallTimeoutMs = parsePositiveInteger(
        arg.slice("--veil-call-timeout=".length),
        "--veil-call-timeout",
      );
    } else if (arg === "--force-new-session") {
      forceNewSession = true;
    } else if (arg === "--project-id") {
      walletConnectProjectId = requireValue(args, ++i, "--project-id");
    } else if (arg.startsWith("--project-id=")) {
      walletConnectProjectId = arg.slice("--project-id=".length);
    } else if (arg === "--skip-batching") {
      includeBatching = false;
    } else if (arg === "--request-timeout") {
      requestTimeoutSeconds = parsePositiveInteger(
        requireValue(args, ++i, "--request-timeout"),
        "--request-timeout",
      );
    } else if (arg.startsWith("--request-timeout=")) {
      requestTimeoutSeconds = parsePositiveInteger(
        arg.slice("--request-timeout=".length),
        "--request-timeout",
      );
    } else if (arg === "--upstream-timeout") {
      upstreamTimeoutMs = parsePositiveInteger(
        requireValue(args, ++i, "--upstream-timeout"),
        "--upstream-timeout",
      );
    } else if (arg.startsWith("--upstream-timeout=")) {
      upstreamTimeoutMs = parsePositiveInteger(
        arg.slice("--upstream-timeout=".length),
        "--upstream-timeout",
      );
    } else if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  const parsed = new URL(rpcUrl);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("--rpc-url must use http or https");
  }
  const parsedApiBase = new URL(walletchanApiBaseUrl);
  if (parsedApiBase.protocol !== "http:" && parsedApiBase.protocol !== "https:") {
    throw new Error("--api-base must use http or https");
  }
  const baseRpcUrl = normalizeHttpUrl(resolveBaseRpcUrl(rpcOverrides), "Base RPC URL");
  veilRelayUrl = normalizeOptionalHttpUrl(veilRelayUrl, "WALLETCHAN_MCP_VEIL_RELAY_URL / --veil-relay-url");
  veilX402RelayUrl = normalizeOptionalHttpUrl(
    veilX402RelayUrl,
    "WALLETCHAN_MCP_VEIL_X402_RELAY_URL / --veil-x402-relay-url",
  );
  if (requestTimeoutSeconds < 300) {
    throw new Error("--request-timeout must be at least 300 seconds for WalletConnect");
  }

  return {
    rpcUrl: parsed.toString().replace(/\/$/, ""),
    rpcHost: parseHost(rpcHost, "--rpc-host"),
    walletchanApiBaseUrl: parsedApiBase.toString().replace(/\/$/, ""),
    managedRpcEnabled,
    rpcChains: rpcChains.length > 0 ? rpcChains : ["base"],
    rpcOverrides,
    webRequestEnabled,
    webRequestHosts,
    pluginCliEnabled,
    morphoApiUrl,
    aerodromeRpcUrl,
    veilEnabled,
    veilPrivateActionsEnabled,
    veilDir,
    baseRpcUrl,
    veilRelayUrl,
    veilX402RelayUrl,
    veilCommand,
    veilArgs,
    veilStartupTimeoutMs,
    veilCallTimeoutMs,
    forceNewSession,
    includeBatching,
    walletConnectProjectId,
    requestTimeoutSeconds,
    upstreamTimeoutMs,
  };
}

function parseHost(value: string, label: string): string {
  const host = value.trim();
  if (!host) {
    throw new Error(`${label} must not be empty`);
  }
  if (/\s/.test(host)) {
    throw new Error(`${label} must not contain whitespace`);
  }
  return host;
}

function parseEnvHosts(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);
}

function parseEnvArgs(value: string | undefined): string[] {
  if (!value) return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
      throw new Error("WALLETCHAN_MCP_VEIL_ARGS must be a JSON string array when it starts with [");
    }
    return parsed;
  }
  return trimmed.split(/\s+/).filter(Boolean);
}

function normalizeOptionalHttpUrl(value: string | undefined, label: string): string | undefined {
  if (value === undefined || value === "") return undefined;
  return normalizeHttpUrl(value, label);
}

function normalizeHttpUrl(value: string, label: string): string {
  const parsed = new URL(value);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use http or https`);
  }
  return parsed.toString().replace(/\/$/, "");
}

function resolveBaseRpcUrl(rpcOverrides: string[]): string {
  for (const override of rpcOverrides) {
    const separator = override.indexOf("=");
    if (separator === -1) continue;
    const chain = override.slice(0, separator).trim().toLowerCase();
    const rpcUrl = override.slice(separator + 1).trim();
    if (chain === "base" || chain === "base-mainnet" || chain === "8453") {
      return rpcUrl || WALLETCHAN_BASE_RPC_URL;
    }
  }
  return WALLETCHAN_BASE_RPC_URL;
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value) throw new Error(`${option} requires a value`);
  return value;
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function parseOptionalPositiveInteger(value: string | undefined, label: string): number | undefined {
  if (value === undefined || value === "") return undefined;
  return parsePositiveInteger(value, label);
}

function stripForwardedSeparator(argv: string[]): string[] {
  return argv.filter((value, index) => index < 2 || value !== "--");
}

function printHelpAndExit(): never {
  process.stderr.write(`WalletChan MCP

Usage:
  walletchan-mcp [options]

Options:
  --rpc-url <url>           WalletChan RPC URL (default: http://127.0.0.1:4209)
  --rpc-host <host>         Managed walletchan-rpc bind host (default: 127.0.0.1)
  --api-base <url>          WalletChan API base URL (default: https://walletchan.com/api)
  --no-managed-rpc          Do not auto-start walletchan-rpc; use an existing RPC server
  --chain <name-or-id>      Chain for managed walletchan-rpc; repeatable (default: base)
  --rpc <chain=url>         Override upstream RPC for a managed chain; repeatable
  --allow-web-host <host>   Allow an extra HTTPS host for web_request; repeatable
  --disable-web-request     Disable allowlisted protocol HTTP requests
  --disable-plugin-cli      Disable allowlisted protocol CLI runners
  --disable-veil            Disable managed Veil MCP tools
  --enable-veil-private-actions
                            Enable broader Veil relay-backed private tools such as withdraw and transfer
  --veil-dir <path>         Managed Veil working directory for .env.veil and receipts
  --veil-relay-url <url>    RELAY_URL passed to Veil MCP
  --veil-x402-relay-url <url>
                            X402_RELAY_URL passed to Veil MCP
  --veil-command <cmd>      Command for Veil MCP child (default: npx)
  --veil-arg <arg>          Extra arg for --veil-command; repeatable
  --veil-startup-timeout <ms>
                            Veil MCP startup timeout (default: 120000)
  --veil-call-timeout <ms>  Veil MCP call timeout (default: 120000)
  --force-new-session       Clear stored WalletConnect sessions and show a fresh URI
  --project-id <id>         WalletConnect project ID for managed walletchan-rpc
  --skip-batching           Start managed walletchan-rpc without ERC-5792 methods
  --request-timeout <sec>   WalletConnect request timeout (default: 300)
  --upstream-timeout <ms>   Upstream RPC timeout (default: 15000)
  -h, --help                Show this help.
`);
  process.exit(0);
}
