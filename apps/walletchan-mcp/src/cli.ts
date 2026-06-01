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
  --force-new-session       Clear stored WalletConnect sessions and show a fresh URI
  --project-id <id>         WalletConnect project ID for managed walletchan-rpc
  --skip-batching           Start managed walletchan-rpc without ERC-5792 methods
  --request-timeout <sec>   WalletConnect request timeout (default: 300)
  --upstream-timeout <ms>   Upstream RPC timeout (default: 15000)
  -h, --help                Show this help.
`);
  process.exit(0);
}
