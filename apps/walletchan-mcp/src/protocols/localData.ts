import { accessSync, constants, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

export function protocolDataDir(protocolId: string, overrideDir?: string): string {
  const dir = overrideDir && overrideDir.trim()
    ? resolve(overrideDir.trim())
    : join(walletChanMcpDataRoot(), sanitizeStorageSegment(protocolId));
  ensurePrivateDir(dir);
  return dir;
}

export function walletChanMcpDataRoot(): string {
  const override = process.env.WALLETCHAN_MCP_DATA_DIR;
  const root = override && override.trim()
    ? resolve(override.trim())
    : defaultDataRoot();
  ensurePrivateDir(root);
  return root;
}

export function ensurePrivateDir(dir: string): string {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  accessSync(dir, constants.R_OK | constants.W_OK | constants.X_OK);
  return dir;
}

function defaultDataRoot(): string {
  const home = homedir();
  if (home) {
    if (process.platform === "darwin") {
      return join(home, "Library", "Application Support", "WalletChan MCP");
    }
    if (process.platform === "win32") {
      return join(process.env.APPDATA || join(home, "AppData", "Roaming"), "WalletChan MCP");
    }
    return join(process.env.XDG_DATA_HOME || join(home, ".local", "share"), "walletchan-mcp");
  }
  return join(tmpdir(), `walletchan-mcp-${getStorageScope()}`);
}

function getStorageScope(): string {
  if (typeof process.getuid === "function") {
    return `uid-${process.getuid()}`;
  }
  return sanitizeStorageSegment(process.env.USER || process.env.USERNAME || "default");
}

function sanitizeStorageSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9.-]/g, "_");
}
