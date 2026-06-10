import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { WalletChanRpcClient, WalletChanRpcHealth } from "./rpcClient.js";

export interface ManagedRpcConfig {
  enabled: boolean;
  rpcUrl: string;
  rpcHost: string;
  chains: string[];
  rpcOverrides: string[];
  forceNewSession: boolean;
  includeBatching: boolean;
  walletConnectProjectId?: string;
  requestTimeoutSeconds: number;
  upstreamTimeoutMs: number;
}

interface RpcEntrypoint {
  command: string;
  baseArgs: string[];
}

interface PairingWaiter {
  resolve: (uri: string | null) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class ManagedRpcProcess {
  private child: ChildProcess | null = null;
  private startPromise: Promise<void> | null = null;
  private pairingUri: string | null = null;
  private externalProcessDetected = false;
  private readonly pairingWaiters: PairingWaiter[] = [];

  constructor(
    private readonly config: ManagedRpcConfig,
    private readonly rpc: WalletChanRpcClient,
  ) {}

  async ensureStarted(): Promise<void> {
    if (!this.config.enabled) return;

    if (await this.isRpcReachable()) {
      this.externalProcessDetected = !this.isChildRunning();
      return;
    }

    if (this.isChildRunning()) {
      await this.waitForHealth();
      return;
    }

    if (!this.startPromise) {
      this.startPromise = this.startChild().finally(() => {
        this.startPromise = null;
      });
    }
    await this.startPromise;
  }

  async getPairingState(
    waitMs = 15000,
    options: { forceNewSession?: boolean } = {},
  ): Promise<Record<string, unknown>> {
    await this.ensureStarted();
    const health = await this.rpc.health().catch(() => null);
    const healthAccounts = normalizeAccounts(health?.accounts);
    const connected = Boolean(health?.connected && healthAccounts.length > 0);
    const pairing = (connected && !options.forceNewSession)
      ? null
      : await this.rpc.pairing({ forceNewSession: options.forceNewSession }).catch(() => null);
    if (pairing?.pairingUri) {
      this.pairingUri = pairing.pairingUri;
    }
    const pairingAccounts = normalizeAccounts(pairing?.accounts);
    const currentConnected = !options.forceNewSession &&
      (connected || Boolean(pairing?.connected && pairingAccounts.length > 0));
    const pairingUrl = pairing?.pairingUrl || formatPairingPageUrl(this.config.rpcUrl);
    const pairingUri = currentConnected
      ? null
      : this.pairingUri || await this.waitForPairingUri(waitMs);

    return {
      managed: this.config.enabled,
      running: this.config.enabled ? await this.isRpcReachable() : true,
      rpcUrl: this.config.rpcUrl,
      connected: currentConnected,
      activeChainId: pairing?.activeChainId ?? health?.activeChainId ?? null,
      batching: pairing?.batching ?? health?.batching ?? null,
      accounts: currentConnected
        ? (healthAccounts.length > 0 ? healthAccounts : pairingAccounts)
        : [],
      chains: pairing?.chains ?? health?.chains ?? [],
      pairingUri,
      pairingUrl,
      forceNewSession: options.forceNewSession === true,
      message: currentConnected
        ? "WalletChan RPC is already paired."
        : pairingUri
          ? "Open the pairing URL to scan the QR code, or paste this WalletConnect URI in any WalletConnect-capable wallet."
          : this.externalProcessDetected
            ? "An existing walletchan-rpc process is running on this URL, but this MCP process could not ask it for a fresh pairing URI. Use that process's terminal output, or restart with --force-new-session on an unused --rpc-url port."
            : "WalletChan RPC is starting, but no WalletConnect URI was observed yet. Call get_pairing_uri again.",
    };
  }

  shutdown(): void {
    for (const waiter of this.pairingWaiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.resolve(null);
    }
    if (this.isChildRunning()) {
      this.child?.kill("SIGTERM");
    }
  }

  private async startChild(): Promise<void> {
    const url = new URL(this.config.rpcUrl);
    if (url.protocol !== "http:" || !isLocalHost(url.hostname)) {
      throw new Error(
        "Managed walletchan-rpc requires a local http --rpc-url. Use --no-managed-rpc for an external RPC server.",
      );
    }

    const port = Number(url.port || "80");
    if (!Number.isInteger(port) || port <= 0 || port > 65535) {
      throw new Error(`Invalid managed walletchan-rpc port in --rpc-url: ${this.config.rpcUrl}`);
    }

    const entrypoint = resolveRpcEntrypoint();
    const args = [
      ...entrypoint.baseArgs,
      ...this.config.chains.flatMap((chain) => ["--chain", chain]),
      ...this.config.rpcOverrides.flatMap((override) => ["--rpc", override]),
      "--host",
      this.config.rpcHost,
      "--port",
      String(port),
      "--request-timeout",
      String(this.config.requestTimeoutSeconds),
      "--upstream-timeout",
      String(this.config.upstreamTimeoutMs),
    ];

    if (this.config.forceNewSession) args.push("--force-new-session");
    if (!this.config.includeBatching) args.push("--skip-batching");
    if (this.config.walletConnectProjectId) {
      args.push("--project-id", this.config.walletConnectProjectId);
    }

    this.externalProcessDetected = false;
    this.pairingUri = null;
    this.child = spawn(entrypoint.command, args, {
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    this.child.stdout?.on("data", (chunk: Buffer) => this.handleChildOutput(chunk));
    this.child.stderr?.on("data", (chunk: Buffer) => this.writeChildLog(chunk));
    this.child.once("exit", (code, signal) => {
      this.writeChildLog(
        Buffer.from(`walletchan-rpc exited${signal ? ` with ${signal}` : ` with code ${code}`}\n`),
      );
      this.child = null;
      for (const waiter of this.pairingWaiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.resolve(null);
      }
    });

    await this.waitForHealth();
  }

  private handleChildOutput(chunk: Buffer): void {
    const text = chunk.toString("utf8");
    const match = text.match(/wc:[^\s]+/);
    if (match) {
      this.pairingUri = match[0];
      for (const waiter of this.pairingWaiters.splice(0)) {
        clearTimeout(waiter.timer);
        waiter.resolve(this.pairingUri);
      }
    }
    this.writeChildLog(chunk);
  }

  private writeChildLog(chunk: Buffer): void {
    process.stderr.write(chunk);
  }

  private async waitForHealth(timeoutMs = 10000): Promise<void> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (await this.isRpcReachable()) return;
      if (this.child && this.child.exitCode !== null) {
        throw new Error(`walletchan-rpc exited before becoming ready`);
      }
      await sleep(250);
    }
    throw new Error(`Timed out waiting for walletchan-rpc at ${this.config.rpcUrl}`);
  }

  private async waitForPairingUri(timeoutMs: number): Promise<string | null> {
    if (this.pairingUri) return this.pairingUri;
    if (timeoutMs <= 0) return null;

    return new Promise((resolvePairingUri) => {
      const waiter: PairingWaiter = {
        resolve: resolvePairingUri,
        timer: setTimeout(() => {
          const index = this.pairingWaiters.indexOf(waiter);
          if (index >= 0) this.pairingWaiters.splice(index, 1);
          resolvePairingUri(this.pairingUri);
        }, timeoutMs),
      };
      waiter.timer.unref?.();
      this.pairingWaiters.push(waiter);
    });
  }

  private async isRpcReachable(): Promise<boolean> {
    return this.rpc.health().then(
      (health: WalletChanRpcHealth) => Boolean(health.ok),
      () => false,
    );
  }

  private isChildRunning(): boolean {
    return Boolean(this.child && this.child.exitCode === null);
  }
}

function resolveRpcEntrypoint(): RpcEntrypoint {
  const packageDir = resolveRpcPackageDir();
  const distEntrypoint = join(packageDir, "dist", "index.js");
  if (existsSync(distEntrypoint)) {
    return { command: process.execPath, baseArgs: [distEntrypoint] };
  }

  const sourceEntrypoint = join(packageDir, "src", "index.ts");
  if (existsSync(sourceEntrypoint)) {
    const repoRoot = resolve(packageDir, "..", "..");
    return {
      command: "pnpm",
      baseArgs: ["--dir", repoRoot, "--filter", "@walletchan/rpc", "dev", "--"],
    };
  }

  throw new Error("Could not find @walletchan/rpc entrypoint. Build or install @walletchan/rpc first.");
}

function resolveRpcPackageDir(): string {
  const require = createRequire(import.meta.url);
  try {
    return dirname(require.resolve("@walletchan/rpc/package.json"));
  } catch {
    const here = dirname(fileURLToPath(import.meta.url));
    const sibling = resolve(here, "..", "..", "walletchan-rpc");
    if (existsSync(join(sibling, "package.json"))) return sibling;
    throw new Error("Could not resolve @walletchan/rpc package");
  }
}

function isLocalHost(hostname: string): boolean {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
}

function formatPairingPageUrl(rpcUrl: string): string {
  const url = new URL(rpcUrl);
  if (url.hostname === "0.0.0.0") url.hostname = "127.0.0.1";
  url.pathname = "/qr";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function normalizeAccounts(accounts: unknown): string[] {
  return Array.isArray(accounts)
    ? accounts
      .filter((account): account is string => typeof account === "string")
      .map((account) => account.toLowerCase())
    : [];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
