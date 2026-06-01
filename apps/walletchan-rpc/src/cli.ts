import { Command } from "commander";
import { formatChains, resolveRuntimeChains, type RuntimeChain } from "./chains.js";
import { style } from "./logger.js";

const DEFAULT_PROJECT_ID = "56262dba600174595278ffdf73ceb06f";

export interface CliConfig {
  chains: RuntimeChain[];
  forceNewSession: boolean;
  host: string;
  includeBatching: boolean;
  port: number;
  projectId: string;
  requestTimeoutSeconds: number;
  upstreamTimeoutMs: number;
}

interface RawOptions {
  chain: string[];
  rpc: string[];
  host: string;
  port: string;
  forceNewSession?: boolean;
  projectId?: string;
  skipBatching?: boolean;
  requestTimeout: string;
  upstreamTimeout: string;
}

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

export function parseCli(argv: string[]): CliConfig {
  const program = new Command();

  program
    .name("walletchan-rpc")
    .description("Local JSON-RPC proxy that routes wallet requests through WalletConnect")
    .option("-c, --chain <name-or-id>", "chain to expose; repeatable", collect, [])
    .option("-r, --rpc <chain=url>", "override upstream RPC for a selected chain; repeatable", collect, [])
    .option("--host <host>", "local RPC bind host", process.env.WALLETCHAN_RPC_HOST || "127.0.0.1")
    .option("-p, --port <number>", "local RPC port", "4209")
    .option("--force-new-session", "discard stored WalletConnect sessions and show a fresh pairing URI")
    .option("--project-id <id>", "WalletConnect project ID")
    .option("--skip-batching", "do not request ERC-5792 methods; wallet_sendCalls uses sequential fallback")
    .option("--request-timeout <seconds>", "WalletConnect request timeout", "300")
    .option("--upstream-timeout <milliseconds>", "upstream RPC timeout", "15000")
    .addHelpText(
      "after",
      `

Examples:
  walletchan-rpc --chain base
  walletchan-rpc --chain base --chain ethereum
  walletchan-rpc --chain base --rpc base=https://mainnet.base.org
  walletchan-rpc --chain 43114 --rpc 43114=https://api.avax.network/ext/bc/C/rpc
`,
    )
    .parse(stripForwardedSeparator(argv));

  const options = program.opts<RawOptions>();
  const projectId =
    options.projectId ||
    process.env.WALLETCONNECT_PROJECT_ID ||
    process.env.WC_PROJECT_ID ||
    process.env.VITE_WALLETCONNECT_PROJECT_ID ||
    process.env.VITE_WC_PROJECT_ID ||
    DEFAULT_PROJECT_ID;

  const requestTimeoutSeconds = parsePositiveInteger(
    options.requestTimeout,
    "--request-timeout",
  );
  if (requestTimeoutSeconds < 300) {
    throw new Error("--request-timeout must be at least 300 seconds for WalletConnect");
  }

  const config: CliConfig = {
    chains: resolveRuntimeChains(options.chain, options.rpc),
    forceNewSession: Boolean(options.forceNewSession),
    host: parseHost(options.host, "--host"),
    includeBatching: !options.skipBatching,
    port: parsePositiveInteger(options.port, "--port"),
    projectId,
    requestTimeoutSeconds,
    upstreamTimeoutMs: parsePositiveInteger(options.upstreamTimeout, "--upstream-timeout"),
  };

  if (config.port > 65535) {
    throw new Error("--port must be between 1 and 65535");
  }

  if (!config.projectId) {
    throw new Error("WalletConnect project ID is required");
  }

  return config;
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

function stripForwardedSeparator(argv: string[]): string[] {
  return argv.filter((value, index) => index < 2 || value !== "--");
}

export function formatCliSummary(config: CliConfig): string {
  return [
    style.green(`Local RPC: http://${config.host}:${config.port}`),
    style.purple(`SKILL.md:  http://${config.host}:${config.port}/SKILL.md`),
    `Chains:    ${formatChains(config.chains)}`,
    `ERC-5792:   ${config.includeBatching ? "requested if wallet supports it" : "not requested; sequential fallback only"}`,
  ].join("\n");
}
