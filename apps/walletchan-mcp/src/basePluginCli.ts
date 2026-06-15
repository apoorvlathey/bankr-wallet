import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { WALLETCHAN_BASE_RPC_URL, WALLETCHAN_DEFAULT_RPC_HOSTS } from "./walletchanRpcDefaults.js";

export interface BasePluginCliRunInput {
  plugin: string;
  command: string;
  args?: unknown;
  timeoutMs?: number;
}

export interface BasePluginCliRunResult {
  plugin: string;
  command: string;
  package: string;
  args: string[];
  status: "ok";
  stdout: string;
  stderr?: string;
  parsed?: unknown;
}

export interface BasePluginCliCommandInfo {
  plugin: string;
  command: string;
  category: "read" | "write";
  options: Array<{
    name: string;
    required: boolean;
    kind:
      | "address"
      | "amount"
      | "amount-or-max"
      | "base-chain-id"
      | "boolean"
      | "chain"
      | "direction"
      | "fields"
      | "fraction"
      | "integer"
      | "market-id"
      | "market-sort"
      | "number"
      | "pool-type"
      | "sort"
      | "symbol"
      | "token";
    choices?: readonly string[];
  }>;
}

interface CliRunnerConfig {
  enabled: boolean;
  morphoApiUrl?: string;
  aerodromeRpcUrl?: string;
}

interface RunnerSpec {
  plugin: string;
  executable: "node-package" | "uvx";
  packageName?: string;
  packageSpec: string;
  defaultEnv: Record<string, string>;
  allowedEndpointHosts: Set<string>;
  argumentStyle: "space" | "equals";
  commands: Record<string, CommandSpec>;
}

interface CommandSpec {
  description: string;
  category: "read" | "write";
  options: OptionSpec[];
}

interface OptionSpec {
  name: string;
  flag: string;
  kind:
    | "address"
    | "amount"
    | "amount-or-max"
    | "base-chain-id"
    | "boolean"
    | "chain"
    | "direction"
    | "fields"
    | "fraction"
    | "integer"
    | "market-id"
    | "market-sort"
    | "number"
    | "pool-type"
    | "sort"
    | "symbol"
    | "token";
  required?: boolean;
  choices?: readonly string[];
}

const CLI_TIMEOUT_MS = 90_000;
const MAX_STDOUT_BYTES = 2 * 1024 * 1024;
const MAX_STDERR_BYTES = 128 * 1024;
const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const MARKET_ID_RE = /^0x[a-fA-F0-9]{64}$/;
const SYMBOL_RE = /^[A-Za-z0-9._-]{1,32}$/;
const NUMBER_RE = /^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const INTEGER_RE = /^(?:0|[1-9][0-9]*)$/;
const SAFE_TOKEN_RE = /^[A-Za-z0-9._:-]{1,66}$/;

const CHAINS = [
  "ethereum",
  "base",
  "arbitrum",
  "optimism",
  "polygon",
  "unichain",
  "worldchain",
  "katana",
  "hyperevm",
  "monad",
  "stable",
] as const;

const VAULT_FIELDS = [
  "address",
  "name",
  "symbol",
  "apyPct",
  "tvl",
  "tvlUsd",
  "feePct",
] as const;

const MARKET_FIELDS = [
  "supplyApy",
  "borrowApy",
  "totalSupply",
  "totalBorrow",
  "totalCollateral",
  "totalLiquidity",
  "supplyAssetsUsd",
  "borrowAssetsUsd",
  "collateralAssetsUsd",
  "liquidityAssetsUsd",
] as const;

const MORPHO_API_HOSTS = new Set(["api.morpho.org", "blue-api.morpho.org"]);

const MORPHO_RUNNER: RunnerSpec = {
  plugin: "morpho",
  executable: "node-package",
  packageName: "@morpho-org/cli",
  packageSpec: "@morpho-org/cli@0.2.0",
  defaultEnv: {
    MORPHO_API_URL: "https://api.morpho.org/graphql",
  },
  allowedEndpointHosts: MORPHO_API_HOSTS,
  argumentStyle: "space",
  commands: {
    "health-check": {
      category: "read",
      description: "Check Morpho CLI backend health.",
      options: [],
    },
    "get-supported-chains": {
      category: "read",
      description: "List Morpho CLI supported chains.",
      options: [],
    },
    "query-vaults": {
      category: "read",
      description: "Query Morpho vaults with filters.",
      options: [
        option("chain", "chain", true),
        option("asset-symbol", "symbol"),
        option("asset-address", "address"),
        option("sort", "sort"),
        option("limit", "number"),
        option("skip", "number"),
        option("fields", "fields", false, VAULT_FIELDS),
      ],
    },
    "get-vault": {
      category: "read",
      description: "Get one Morpho vault by address.",
      options: [option("chain", "chain", true), option("address", "address", true)],
    },
    "query-markets": {
      category: "read",
      description: "Query Morpho Blue markets with filters.",
      options: [
        option("chain", "chain", true),
        option("loan-asset", "address"),
        option("collateral-asset", "address"),
        option("sort-by", "market-sort"),
        option("sort-direction", "direction"),
        option("limit", "number"),
        option("skip", "number"),
        option("fields", "fields", false, MARKET_FIELDS),
      ],
    },
    "get-market": {
      category: "read",
      description: "Get one Morpho Blue market by market id.",
      options: [option("chain", "chain", true), option("id", "market-id", true)],
    },
    "get-positions": {
      category: "read",
      description: "Get all non-zero Morpho positions for a user.",
      options: [option("chain", "chain", true), option("user-address", "address", true)],
    },
    "get-token-balance": {
      category: "read",
      description: "Get token balance and Morpho allowance state.",
      options: [
        option("chain", "chain", true),
        option("user-address", "address", true),
        option("token-address", "address", true),
      ],
    },
    "prepare-deposit": {
      category: "write",
      description: "Prepare unsigned approval/deposit transactions for a vault deposit.",
      options: [
        option("chain", "chain", true),
        option("vault-address", "address", true),
        option("user-address", "address", true),
        option("amount", "amount", true),
      ],
    },
    "prepare-withdraw": {
      category: "write",
      description: "Prepare unsigned vault withdrawal transactions.",
      options: [
        option("chain", "chain", true),
        option("vault-address", "address", true),
        option("user-address", "address", true),
        option("amount", "amount-or-max", true),
      ],
    },
    "prepare-supply": {
      category: "write",
      description: "Prepare unsigned Morpho Blue supply transactions.",
      options: [
        option("chain", "chain", true),
        option("market-id", "market-id", true),
        option("user-address", "address", true),
        option("amount", "amount", true),
      ],
    },
    "prepare-borrow": {
      category: "write",
      description: "Prepare unsigned Morpho Blue borrow transactions.",
      options: [
        option("chain", "chain", true),
        option("market-id", "market-id", true),
        option("user-address", "address", true),
        option("borrow-amount", "amount", true),
      ],
    },
    "prepare-repay": {
      category: "write",
      description: "Prepare unsigned Morpho Blue repay transactions.",
      options: [
        option("chain", "chain", true),
        option("market-id", "market-id", true),
        option("user-address", "address", true),
        option("amount", "amount-or-max", true),
      ],
    },
    "prepare-supply-collateral": {
      category: "write",
      description: "Prepare unsigned collateral supply transactions.",
      options: [
        option("chain", "chain", true),
        option("market-id", "market-id", true),
        option("user-address", "address", true),
        option("amount", "amount", true),
      ],
    },
    "prepare-withdraw-collateral": {
      category: "write",
      description: "Prepare unsigned collateral withdrawal transactions.",
      options: [
        option("chain", "chain", true),
        option("market-id", "market-id", true),
        option("user-address", "address", true),
        option("amount", "amount-or-max", true),
      ],
    },
    "prepare-claim-rewards": {
      category: "write",
      description: "Prepare unsigned Merkl reward claim transaction.",
      options: [option("chain", "chain", true), option("user-address", "address", true)],
    },
  },
};

const AERODROME_RUNNER: RunnerSpec = {
  plugin: "aerodrome",
  executable: "uvx",
  packageSpec: "git+https://github.com/velodrome-finance/sugar-sdk.git@v0.4.0",
  defaultEnv: {
    SUGAR_RPC_URI_8453: WALLETCHAN_BASE_RPC_URL,
  },
  allowedEndpointHosts: new Set([
    "github.com",
    ...WALLETCHAN_DEFAULT_RPC_HOSTS,
  ]),
  argumentStyle: "equals",
  commands: {
    pools: {
      category: "read",
      description: "Query Aerodrome pools with Sugar SDK.",
      options: [
        option("chain", "base-chain-id", true),
        option("token0", "token"),
        option("token1", "token"),
        option("limit", "number"),
      ],
    },
    swap: {
      category: "write",
      description: "Prepare unsigned Aerodrome swap calls with Sugar SDK.",
      options: [
        option("chain", "base-chain-id", true),
        option("wallet", "address", true),
        option("from-token", "token", true),
        option("to-token", "token", true),
        option("amount", "amount", true),
        option("use-decimals", "boolean"),
        option("slippage", "fraction"),
      ],
    },
    positions: {
      category: "read",
      description: "List Aerodrome positions for a wallet.",
      options: [
        option("chain", "base-chain-id", true),
        option("wallet", "address", true),
      ],
    },
    deposit: {
      category: "write",
      description: "Prepare unsigned Aerodrome liquidity deposit calls.",
      options: [
        option("chain", "base-chain-id", true),
        option("wallet", "address", true),
        option("pool", "address"),
        option("token0", "token"),
        option("token1", "token"),
        option("pool-type", "pool-type"),
        option("tick-spacing", "integer"),
        option("amount0", "amount"),
        option("amount1", "amount"),
        option("use-decimals", "boolean"),
        option("slippage", "fraction"),
      ],
    },
    withdraw: {
      category: "write",
      description: "Prepare unsigned Aerodrome liquidity withdrawal calls.",
      options: [
        option("chain", "base-chain-id", true),
        option("wallet", "address", true),
        option("pool", "address"),
        option("position", "integer"),
        option("fraction", "fraction", true),
        option("slippage", "fraction"),
      ],
    },
    stake: {
      category: "write",
      description: "Prepare unsigned Aerodrome stake calls.",
      options: [
        option("chain", "base-chain-id", true),
        option("wallet", "address", true),
        option("pool", "address"),
        option("position", "integer"),
      ],
    },
    unstake: {
      category: "write",
      description: "Prepare unsigned Aerodrome unstake calls.",
      options: [
        option("chain", "base-chain-id", true),
        option("wallet", "address", true),
        option("pool", "address"),
        option("position", "integer"),
      ],
    },
    claim_emissions: {
      category: "write",
      description: "Prepare unsigned Aerodrome emissions claim calls.",
      options: [
        option("chain", "base-chain-id", true),
        option("wallet", "address", true),
        option("pool", "address"),
        option("position", "integer"),
      ],
    },
    claim_fees: {
      category: "write",
      description: "Prepare unsigned Aerodrome fee claim calls.",
      options: [
        option("chain", "base-chain-id", true),
        option("wallet", "address", true),
        option("pool", "address"),
        option("position", "integer"),
      ],
    },
  },
};

const RUNNERS: Record<string, RunnerSpec> = {
  morpho: MORPHO_RUNNER,
  aerodrome: AERODROME_RUNNER,
};

export class BasePluginCliRunner {
  private readonly runners: Record<string, RunnerSpec>;

  constructor(private readonly config: CliRunnerConfig) {
    this.runners = {
      ...RUNNERS,
      morpho: withMorphoEndpoint(MORPHO_RUNNER, config.morphoApiUrl),
      aerodrome: withAerodromeRpc(AERODROME_RUNNER, config.aerodromeRpcUrl),
    };
  }

  list(): unknown {
    return {
      enabled: this.config.enabled,
      runners: Object.values(this.runners).map((runner) => ({
        plugin: runner.plugin,
        package: runner.packageSpec,
        commands: Object.entries(runner.commands).map(([name, spec]) => ({
          name,
          category: spec.category,
          description: spec.description,
          options: spec.options.map((opt) => ({
            name: opt.name,
            required: opt.required === true,
            kind: opt.kind,
            choices: opt.choices,
          })),
        })),
      })),
    };
  }

  async run(input: BasePluginCliRunInput): Promise<BasePluginCliRunResult> {
    if (!this.config.enabled) {
      throw new Error("Base plugin CLI runner is disabled.");
    }

    const { plugin, runner, command, commandSpec } = this.requireCommand(input.plugin, input.command);

    const commandArgs = buildCommandArgs(commandSpec, input.args, runner.argumentStyle);
    const { executable, processArgs } = buildProcessInvocation(runner, command, commandArgs);
    const output = await runProcess(executable, processArgs, {
      env: buildEnv(runner),
      timeoutMs: normalizeTimeout(input.timeoutMs),
    });
    const parsed = parseJson(output.stdout);

    return {
      plugin,
      command,
      package: runner.packageSpec,
      args: [command, ...commandArgs],
      status: "ok",
      stdout: output.stdout,
      ...(output.stderr ? { stderr: output.stderr } : {}),
      ...(parsed === undefined ? {} : { parsed }),
    };
  }

  getCommandInfo(pluginName: string, commandName: string): BasePluginCliCommandInfo {
    const { plugin, command, commandSpec } = this.requireCommand(pluginName, commandName);
    return {
      plugin,
      command,
      category: commandSpec.category,
      options: commandSpec.options.map((opt) => ({
        name: opt.name,
        required: opt.required === true,
        kind: opt.kind,
        choices: opt.choices,
      })),
    };
  }

  private requireCommand(pluginName: string, commandName: string): {
    plugin: string;
    runner: RunnerSpec;
    command: string;
    commandSpec: CommandSpec;
  } {
    const plugin = pluginName.trim().toLowerCase();
    const runner = this.runners[plugin];
    if (!runner) {
      throw new Error(`Unsupported Base plugin CLI runner: ${pluginName}`);
    }

    const command = commandName.trim();
    const commandSpec = runner.commands[command];
    if (!commandSpec) {
      throw new Error(`Unsupported ${plugin} CLI command: ${commandName}`);
    }

    return { plugin, runner, command, commandSpec };
  }
}

function option(
  name: string,
  kind: OptionSpec["kind"],
  required = false,
  choices?: readonly string[],
): OptionSpec {
  return {
    name,
    flag: `--${name}`,
    kind,
    required,
    choices,
  };
}

function withMorphoEndpoint(runner: RunnerSpec, endpoint?: string): RunnerSpec {
  if (!endpoint) return runner;
  const parsed = new URL(endpoint);
  if (parsed.protocol !== "https:" || !runner.allowedEndpointHosts.has(parsed.hostname)) {
    throw new Error(
      `WALLETCHAN_MCP_MORPHO_API_URL must be an https URL on one of: ${Array.from(runner.allowedEndpointHosts).join(", ")}`,
    );
  }
  return {
    ...runner,
    defaultEnv: {
      ...runner.defaultEnv,
      MORPHO_API_URL: parsed.toString(),
    },
  };
}

function withAerodromeRpc(runner: RunnerSpec, rpcUrl?: string): RunnerSpec {
  if (!rpcUrl) return runner;
  const parsed = new URL(rpcUrl);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("WALLETCHAN_MCP_AERODROME_RPC_URL must be an http or https URL");
  }
  return {
    ...runner,
    defaultEnv: {
      ...runner.defaultEnv,
      SUGAR_RPC_URI_8453: parsed.toString(),
    },
    allowedEndpointHosts: new Set([
      ...runner.allowedEndpointHosts,
      parsed.hostname,
    ]),
  };
}

function buildCommandArgs(
  command: CommandSpec,
  rawArgs: unknown,
  argumentStyle: RunnerSpec["argumentStyle"],
): string[] {
  const args = isRecord(rawArgs) ? rawArgs : {};
  const cliArgs: string[] = [];

  for (const spec of command.options) {
    const value = getArgValue(args, spec.name);
    if (value === undefined || value === null || value === "") {
      if (spec.required) throw new Error(`${spec.flag} is required`);
      continue;
    }
    appendCliOption(cliArgs, spec, validateOption(spec, value), argumentStyle);
  }

  const known = new Set(command.options.flatMap((spec) => argKeys(spec.name)));
  for (const key of Object.keys(args)) {
    if (!known.has(key)) {
      throw new Error(`Unsupported CLI argument: ${key}`);
    }
  }

  return cliArgs;
}

function appendCliOption(
  cliArgs: string[],
  spec: OptionSpec,
  value: string | boolean,
  argumentStyle: RunnerSpec["argumentStyle"],
): void {
  if (typeof value === "boolean") {
    if (value) cliArgs.push(spec.flag);
    return;
  }
  if (argumentStyle === "equals") {
    cliArgs.push(`${spec.flag}=${value}`);
    return;
  }
  cliArgs.push(spec.flag, value);
}

function getArgValue(args: Record<string, unknown>, name: string): unknown {
  for (const key of argKeys(name)) {
    if (key in args) return args[key];
  }
  return undefined;
}

function argKeys(name: string): string[] {
  const camel = name.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  const snake = name.replace(/-/g, "_");
  return [name, camel, snake];
}

function validateOption(spec: OptionSpec, value: unknown): string | boolean {
  const text = String(value).trim();
  if (!text) throw new Error(`${spec.flag} cannot be empty`);

  switch (spec.kind) {
    case "address":
      if (!ADDRESS_RE.test(text)) throw new Error(`${spec.flag} must be an EVM address`);
      return text.toLowerCase();
    case "amount":
      if (!NUMBER_RE.test(text) || Number(text) <= 0) {
        throw new Error(`${spec.flag} must be a positive decimal amount`);
      }
      return text;
    case "amount-or-max":
      if (text === "max") return text;
      if (!NUMBER_RE.test(text) || Number(text) <= 0) {
        throw new Error(`${spec.flag} must be max or a positive decimal amount`);
      }
      return text;
    case "base-chain-id":
      if (text !== "8453" && text.toLowerCase() !== "base") {
        throw new Error(`${spec.flag} must be 8453 or base`);
      }
      return "8453";
    case "boolean":
      if (typeof value === "boolean") return value;
      if (text === "true") return true;
      if (text === "false") return false;
      throw new Error(`${spec.flag} must be a boolean`);
    case "chain":
      return requireChoice(spec.flag, text.toLowerCase(), CHAINS);
    case "direction":
      return requireChoice(spec.flag, text.toLowerCase(), ["asc", "desc"]);
    case "fields":
      return validateFields(spec, text);
    case "fraction": {
      if (!NUMBER_RE.test(text)) throw new Error(`${spec.flag} must be a decimal number`);
      const parsed = Number(text);
      if (parsed <= 0 || parsed > 1) throw new Error(`${spec.flag} must be greater than 0 and at most 1`);
      return text;
    }
    case "integer":
      if (!INTEGER_RE.test(text)) throw new Error(`${spec.flag} must be a non-negative integer`);
      return text;
    case "market-id":
      if (!MARKET_ID_RE.test(text)) throw new Error(`${spec.flag} must be a 32-byte market id`);
      return text;
    case "market-sort":
      return requireChoice(spec.flag, text, [
        "supplyApy",
        "borrowApy",
        "netSupplyApy",
        "netBorrowApy",
        "supplyAssetsUsd",
        "borrowAssetsUsd",
        "totalLiquidityUsd",
      ]);
    case "number": {
      const parsed = Number(text);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error(`${spec.flag} must be a non-negative integer`);
      }
      if (spec.name === "limit" && (parsed < 1 || parsed > 100)) {
        throw new Error("--limit must be between 1 and 100");
      }
      return text;
    }
    case "sort":
      return requireChoice(spec.flag, text, ["apy_desc", "apy_asc", "tvl_desc", "tvl_asc"]);
    case "symbol":
      if (!SYMBOL_RE.test(text)) throw new Error(`${spec.flag} must be a token symbol`);
      return text;
    case "pool-type":
      return requireChoice(spec.flag, text.toLowerCase(), ["volatile", "stable", "cl"]);
    case "token":
      if (ADDRESS_RE.test(text)) return text.toLowerCase();
      if (!SAFE_TOKEN_RE.test(text)) {
        throw new Error(`${spec.flag} must be an address or safe token symbol`);
      }
      return text;
  }
}

function validateFields(spec: OptionSpec, text: string): string {
  const choices = spec.choices ?? [];
  const fields = text.split(",").map((field) => field.trim()).filter(Boolean);
  if (fields.length === 0) throw new Error(`${spec.flag} must include at least one field`);
  for (const field of fields) {
    requireChoice(spec.flag, field, choices);
  }
  return fields.join(",");
}

function requireChoice(flag: string, value: string, choices: readonly string[]): string {
  if (!choices.includes(value)) {
    throw new Error(`${flag} must be one of: ${choices.join(", ")}`);
  }
  return value;
}

function buildEnv(runner: RunnerSpec): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const [key, value] of Object.entries(runner.defaultEnv)) {
    env[key] = value;
  }

  const noProxyHosts = Array.from(runner.allowedEndpointHosts).join(",");
  env.NO_PROXY = appendCsv(env.NO_PROXY || env.no_proxy, noProxyHosts);
  env.no_proxy = env.NO_PROXY;
  if (runner.executable === "uvx") {
    env.UV_TOOL_DIR = env.UV_TOOL_DIR || join(tmpdir(), "walletchan-mcp-uv-tools");
    env.UV_CACHE_DIR = env.UV_CACHE_DIR || join(tmpdir(), "walletchan-mcp-uv-cache");
  }
  return env;
}

function buildProcessInvocation(
  runner: RunnerSpec,
  command: string,
  commandArgs: string[],
): { executable: string; processArgs: string[] } {
  if (runner.executable === "uvx") {
    return {
      executable: uvxBinary(),
      processArgs: ["--from", runner.packageSpec, "sugar", command, ...commandArgs],
    };
  }

  if (!runner.packageName) {
    throw new Error(`Runner ${runner.plugin} is missing packageName`);
  }
  const localBin = resolveLocalPackageBin(runner.packageName);
  if (localBin) {
    return {
      executable: process.execPath,
      processArgs: [localBin, command, ...commandArgs],
    };
  }
  return {
    executable: npxBinary(),
    processArgs: ["-y", runner.packageSpec, command, ...commandArgs],
  };
}

function appendCsv(existing: string | undefined, addition: string): string {
  if (!existing) return addition;
  const values = new Set(
    existing
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
  for (const value of addition.split(",")) values.add(value);
  return Array.from(values).join(",");
}

function normalizeTimeout(value: number | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isInteger(value) || value < 1000 || value > 300_000) {
    throw new Error("timeoutMs must be an integer between 1000 and 300000");
  }
  return value;
}

async function runProcess(
  command: string,
  args: string[],
  options: { env: NodeJS.ProcessEnv; timeoutMs?: number },
): Promise<{ stdout: string; stderr: string }> {
  const timeoutMs = options.timeoutMs ?? CLI_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: options.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`CLI command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      try {
        stdout = appendLimited(stdout, chunk, MAX_STDOUT_BYTES, "stdout");
      } catch (error) {
        fail(error);
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      try {
        stderr = appendLimited(stderr, chunk, MAX_STDERR_BYTES, "stderr");
      } catch (error) {
        fail(error);
      }
    });
    child.on("error", (error) => {
      fail(error);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
        return;
      }
      reject(new Error(formatCliFailure(code, signal, stdout, stderr)));
    });

    function fail(error: unknown): void {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGTERM");
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

function appendLimited(
  current: string,
  chunk: Buffer,
  limit: number,
  label: string,
): string {
  const next = current + chunk.toString("utf8");
  if (Buffer.byteLength(next, "utf8") > limit) {
    throw new Error(`CLI ${label} exceeded ${limit} bytes`);
  }
  return next;
}

function formatCliFailure(
  code: number | null,
  signal: NodeJS.Signals | null,
  stdout: string,
  stderr: string,
): string {
  const status = signal ? `signal ${signal}` : `exit code ${code ?? "unknown"}`;
  const parts = [`CLI command failed with ${status}`];
  if (stderr.trim()) parts.push(`stderr: ${stderr.trim().slice(-4000)}`);
  if (stdout.trim()) parts.push(`stdout: ${stdout.trim().slice(-4000)}`);
  return parts.join("\n");
}

function parseJson(value: string): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function npxBinary(): string {
  return process.platform === "win32" ? "npx.cmd" : "npx";
}

function uvxBinary(): string {
  return process.platform === "win32" ? "uvx.exe" : "uvx";
}

const require = createRequire(import.meta.url);

function resolveLocalPackageBin(packageName: string): string | null {
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`);
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      bin?: string | Record<string, string>;
    };
    const bin = typeof packageJson.bin === "string"
      ? packageJson.bin
      : Object.values(packageJson.bin ?? {})[0];
    if (!bin) return null;
    return join(dirname(packageJsonPath), bin);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
