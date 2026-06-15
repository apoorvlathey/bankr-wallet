import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
  randomUUID,
} from "node:crypto";
import {
  chmodSync,
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { protocolDataDir } from "./protocols/localData.js";

export type ExecutionProfileKind = "walletconnect" | "agent" | "agent-eoa";
export type ExecutionProfileId = "walletconnect" | `agent:${string}` | `agent-eoa:${string}`;

export interface AgentWalletRecord {
  id: string;
  label: string;
  address: `0x${string}`;
  createdAt: string;
  updatedAt: string;
}

export interface ExecutionProfile {
  id: ExecutionProfileId;
  kind: ExecutionProfileKind;
  label: string;
  walletId?: string;
  address?: `0x${string}`;
  approvalMode: "walletchan_popup" | "agent_auto";
  executionMode: "walletconnect" | "delegated_erc7710_oneshot" | "raw_agent_eoa";
  default: boolean;
  status: "ready" | "planned" | "locked";
}

export type AgentDelegationStatus = "pending_signature" | "active";

export interface AgentDelegationScope {
  type: string;
  tokenAddress?: `0x${string}`;
  amount?: string;
  amountUnits?: string;
  periodDurationSeconds?: number;
  startDate?: number;
  allowedTargets?: `0x${string}`[];
  allowedSelectors?: `0x${string}`[];
}

export interface AgentDelegationMetadata {
  id: string;
  walletId: string;
  profileId: `agent:${string}`;
  label: string;
  status: AgentDelegationStatus;
  chainId: number;
  chainName?: string;
  delegator: `0x${string}`;
  delegate: `0x${string}`;
  delegationManager: `0x${string}`;
  scope: AgentDelegationScope;
  signatureRequestId?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

export interface AgentDelegationRecord extends AgentDelegationMetadata {
  delegation: Record<string, unknown>;
  typedData: Record<string, unknown>;
  signature?: `0x${string}`;
}

interface AgentWalletState {
  version: 1;
  defaultProfileId?: ExecutionProfileId;
  wallets: AgentWalletRecord[];
  delegations?: AgentDelegationMetadata[];
  keyVault?: EncryptedPayload;
}

interface AgentWalletSecrets {
  version: 1;
  keys: Array<{
    walletId: string;
    privateKey: `0x${string}`;
  }>;
  delegations: AgentDelegationRecord[];
}

interface EncryptedPayload {
  algorithm: "aes-256-gcm";
  kdf: {
    name: "pbkdf2";
    hash: "sha256";
    iterations: number;
    salt: string;
  };
  iv: string;
  tag: string;
  ciphertext: string;
}

const AUTO_VAULT_SECRET_FILE = "vault-secret";

export class AgentWalletStore {
  private readonly dir: string;
  private readonly stateFile: string;

  constructor(dirOverride = process.env.WALLETCHAN_MCP_AGENT_WALLET_DIR) {
    this.dir = protocolDataDir("agent-wallets", dirOverride);
    this.stateFile = join(this.dir, "agent-wallets.json");
  }

  getStorageInfo(): Record<string, unknown> {
    const vaultSecret = getVaultSecretInfo(this.dir);
    return {
      dir: this.dir,
      stateFile: this.stateFile,
      secretConfigured: vaultSecret.configured,
      vaultSecret,
    };
  }

  listWallets(): AgentWalletRecord[] {
    return this.readState().wallets;
  }

  getWallet(walletId: string): AgentWalletRecord {
    const wallet = this.readState().wallets.find((entry) => entry.id === walletId);
    if (!wallet) throw new Error(`Unknown agent wallet: ${walletId}`);
    return wallet;
  }

  createWallet(input: { label?: string } = {}): AgentWalletRecord {
    const privateKey = generatePrivateKey();
    return this.importWallet({ privateKey, label: input.label });
  }

  importWallet(input: {
    privateKey: string;
    label?: string;
  }): AgentWalletRecord {
    const privateKey = normalizePrivateKey(input.privateKey);
    const account = privateKeyToAccount(privateKey);
    const now = new Date().toISOString();
    const state = this.readState();
    const existing = state.wallets.find(
      (wallet) => wallet.address.toLowerCase() === account.address.toLowerCase(),
    );
    if (existing) {
      throw new Error(`Agent wallet for ${account.address} already exists: ${existing.id}`);
    }

    const wallet: AgentWalletRecord = {
      id: `agent-${randomUUID()}`,
      label: normalizeLabel(input.label, `Agent ${state.wallets.length + 1}`),
      address: account.address,
      createdAt: now,
      updatedAt: now,
    };
    const secrets = this.readSecrets(state);
    secrets.keys.push({ walletId: wallet.id, privateKey });
    state.wallets.push(wallet);
    state.keyVault = encryptPayload(secrets, readVaultSecret(this.dir, { createIfMissing: true }));
    this.writeState(state);
    return wallet;
  }

  deleteWallet(walletId: string): AgentWalletRecord {
    const state = this.readState();
    const wallet = state.wallets.find((entry) => entry.id === walletId);
    if (!wallet) throw new Error(`Unknown agent wallet: ${walletId}`);
    const secrets = this.readSecrets(state);
    state.wallets = state.wallets.filter((entry) => entry.id !== walletId);
    state.delegations = (state.delegations || []).filter((entry) => entry.walletId !== walletId);
    secrets.keys = secrets.keys.filter((entry) => entry.walletId !== walletId);
    secrets.delegations = secrets.delegations.filter((entry) => entry.walletId !== walletId);
    if (state.defaultProfileId?.endsWith(`:${walletId}`)) {
      delete state.defaultProfileId;
    }
    state.keyVault = encryptPayload(secrets, readVaultSecret(this.dir, { createIfMissing: true }));
    this.writeState(state);
    return wallet;
  }

  resetVault(): Record<string, unknown> {
    let previousWalletCount: number | null = null;
    let previousDelegationCount: number | null = null;
    try {
      const state = this.readState();
      previousWalletCount = state.wallets.length;
      previousDelegationCount = (state.delegations || []).length;
    } catch {
      // Reset should remain available even if local state is corrupt or encrypted
      // with an unavailable historical vault secret.
    }

    const stateExisted = existsSync(this.stateFile);
    this.writeState({ version: 1, wallets: [] });

    const vaultSecretFile = autoVaultSecretPath(this.dir);
    let removedAutoVaultSecret = false;
    if (existsSync(vaultSecretFile)) {
      unlinkSync(vaultSecretFile);
      removedAutoVaultSecret = true;
    }

    return {
      dir: this.dir,
      stateFile: this.stateFile,
      stateExisted,
      previousWalletCount,
      previousDelegationCount,
      resetState: true,
      removedAutoVaultSecret,
      vaultSecretFile,
      message:
        "Local agent wallet state was reset. The next agent_create_wallet or agent_import_wallet call will create a fresh local vault-secret file if no env override is configured.",
    };
  }

  getPrivateKey(walletId: string): `0x${string}` {
    const state = this.readState();
    const key = this.readSecrets(state).keys.find((entry) => entry.walletId === walletId);
    if (!key) throw new Error(`No private key found for agent wallet: ${walletId}`);
    return key.privateKey;
  }

  listDelegations(input: {
    walletId?: string;
    chainId?: number;
    status?: AgentDelegationStatus;
  } = {}): AgentDelegationMetadata[] {
    return (this.readState().delegations || []).filter((delegation) => {
      if (input.walletId && delegation.walletId !== input.walletId) return false;
      if (input.chainId && delegation.chainId !== input.chainId) return false;
      if (input.status && delegation.status !== input.status) return false;
      return true;
    });
  }

  getDelegation(delegationId: string): AgentDelegationRecord {
    const state = this.readState();
    const delegation = this.readSecrets(state).delegations.find((entry) => entry.id === delegationId);
    if (!delegation) throw new Error(`Unknown agent delegation: ${delegationId}`);
    return delegation;
  }

  getActiveDelegation(input: {
    walletId: string;
    chainId?: number;
  }): AgentDelegationRecord | null {
    const state = this.readState();
    const metadata = (state.delegations || []).find((entry) =>
      entry.walletId === input.walletId &&
      entry.status === "active" &&
      (input.chainId === undefined || entry.chainId === input.chainId)
    );
    if (!metadata) return null;
    return this.getDelegation(metadata.id);
  }

  upsertDelegation(record: AgentDelegationRecord): AgentDelegationMetadata {
    this.getWallet(record.walletId);
    const state = this.readState();
    const secrets = this.readSecrets(state);
    const metadata = delegationMetadata(record);
    state.delegations = [
      ...(state.delegations || []).filter((entry) => entry.id !== record.id),
      metadata,
    ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    secrets.delegations = [
      ...secrets.delegations.filter((entry) => entry.id !== record.id),
      record,
    ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    state.keyVault = encryptPayload(secrets, readVaultSecret(this.dir, { createIfMissing: true }));
    this.writeState(state);
    return metadata;
  }

  completeDelegation(delegationId: string, signature: string): AgentDelegationMetadata {
    const record = this.getDelegation(delegationId);
    const now = new Date().toISOString();
    return this.upsertDelegation({
      ...record,
      status: "active",
      signature: normalizeHex(signature, "delegation signature"),
      delegation: {
        ...record.delegation,
        signature: normalizeHex(signature, "delegation signature"),
      },
      updatedAt: now,
    });
  }

  deleteDelegation(delegationId: string): AgentDelegationMetadata {
    const state = this.readState();
    const metadata = (state.delegations || []).find((entry) => entry.id === delegationId);
    if (!metadata) throw new Error(`Unknown agent delegation: ${delegationId}`);
    const secrets = this.readSecrets(state);
    state.delegations = (state.delegations || []).filter((entry) => entry.id !== delegationId);
    secrets.delegations = secrets.delegations.filter((entry) => entry.id !== delegationId);
    state.keyVault = encryptPayload(secrets, readVaultSecret(this.dir, { createIfMissing: true }));
    this.writeState(state);
    return metadata;
  }

  listExecutionProfiles(): ExecutionProfile[] {
    const state = this.readState();
    const defaultProfileId = state.defaultProfileId;
    const vaultSecret = getVaultSecretInfo(this.dir);
    const agentVaultLocked = !!state.keyVault && !vaultSecret.configured;
    const walletconnectDefault = defaultProfileId === "walletconnect" ||
      !defaultProfileId ||
      (agentVaultLocked && defaultProfileId.startsWith("agent"));
    const profiles: ExecutionProfile[] = [
      {
        id: "walletconnect",
        kind: "walletconnect",
        label: "WalletChan WalletConnect",
        approvalMode: "walletchan_popup",
        executionMode: "walletconnect",
        default: walletconnectDefault,
        status: "ready",
      },
    ];
    for (const wallet of state.wallets) {
      const hasActiveDelegation = (state.delegations || []).some(
        (delegation) => delegation.walletId === wallet.id && delegation.status === "active",
      );
      profiles.push({
        id: `agent:${wallet.id}`,
        kind: "agent",
        label: `${wallet.label} (delegated agent)`,
        walletId: wallet.id,
        address: wallet.address,
        approvalMode: "agent_auto",
        executionMode: "delegated_erc7710_oneshot",
        default: !agentVaultLocked && defaultProfileId === `agent:${wallet.id}`,
        status: agentVaultLocked ? "locked" : hasActiveDelegation ? "ready" : "planned",
      });
      profiles.push({
        id: `agent-eoa:${wallet.id}`,
        kind: "agent-eoa",
        label: `${wallet.label} (raw EOA)`,
        walletId: wallet.id,
        address: wallet.address,
        approvalMode: "agent_auto",
        executionMode: "raw_agent_eoa",
        default: !agentVaultLocked && defaultProfileId === `agent-eoa:${wallet.id}`,
        status: agentVaultLocked ? "locked" : "ready",
      });
    }
    return profiles;
  }

  getDefaultExecutionProfile(): ExecutionProfile {
    return this.resolveExecutionProfile();
  }

  setDefaultExecutionProfile(profileId: string): ExecutionProfile {
    const profile = this.resolveExecutionProfile(profileId);
    const state = this.readState();
    state.defaultProfileId = profile.id;
    this.writeState(state);
    return { ...profile, default: true };
  }

  clearDefaultExecutionProfile(): ExecutionProfile {
    const state = this.readState();
    delete state.defaultProfileId;
    this.writeState(state);
    return this.resolveExecutionProfile("walletconnect");
  }

  resolveExecutionProfile(profileId?: string): ExecutionProfile {
    const profiles = this.listExecutionProfiles();
    const explicitProfileId = profileId?.trim();
    const requested = explicitProfileId || profiles.find((entry) => entry.default)?.id || "walletconnect";
    if (requested === "agent" || requested === "agent-eoa") {
      const matches = profiles.filter((profile) => profile.kind === requested);
      if (matches.length === 1) {
        const profile = matches[0]!;
        if (profile.status === "locked") {
          throw new Error(
            `Execution profile ${profile.id} is locked because its agent wallet vault secret is unavailable. ` +
              "Restore the original vault secret or call agent_reset_vault to start fresh.",
          );
        }
        return profile;
      }
      if (matches.length === 0) throw new Error(`No ${requested} profile exists. Create an agent wallet first.`);
      throw new Error(
        `Multiple ${requested} profiles exist. Use one of: ${matches.map((profile) => profile.id).join(", ")}`,
      );
    }
    const profile = profiles.find((entry) => entry.id === requested);
    if (!profile) {
      throw new Error(`Unknown execution profile: ${requested}`);
    }
    if (profile.status === "locked") {
      throw new Error(
        `Execution profile ${profile.id} is locked because its agent wallet vault secret is unavailable. ` +
          "Restore the original vault secret or call agent_reset_vault to start fresh.",
      );
    }
    return profile;
  }

  private readState(): AgentWalletState {
    if (!existsSync(this.stateFile)) {
      return { version: 1, wallets: [] };
    }
    const parsed = JSON.parse(readFileSync(this.stateFile, "utf8")) as unknown;
    if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.wallets)) {
      throw new Error(`Invalid agent wallet state file: ${this.stateFile}`);
    }
    return {
      version: 1,
      defaultProfileId: normalizeProfileId(parsed.defaultProfileId),
      wallets: parsed.wallets.map(normalizeWalletRecord),
      delegations: Array.isArray(parsed.delegations)
        ? parsed.delegations.map(normalizeDelegationMetadata)
        : [],
      keyVault: normalizeEncryptedPayload(parsed.keyVault),
    };
  }

  private writeState(state: AgentWalletState): void {
    const tempFile = `${this.stateFile}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tempFile, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
    renameSync(tempFile, this.stateFile);
    try {
      chmodSync(this.stateFile, 0o600);
    } catch {
      // Best-effort on platforms where chmod is advisory.
    }
  }

  private readSecrets(state: AgentWalletState): AgentWalletSecrets {
    if (!state.keyVault) return { version: 1, keys: [], delegations: [] };
    return decryptPayload(state.keyVault, readVaultSecret(this.dir, { createIfMissing: false }));
  }
}

function encryptPayload(payload: AgentWalletSecrets, secret: string): EncryptedPayload {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = deriveVaultKey(secret, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    algorithm: "aes-256-gcm",
    kdf: {
      name: "pbkdf2",
      hash: "sha256",
      iterations: 600_000,
      salt: salt.toString("base64"),
    },
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function decryptPayload(payload: EncryptedPayload, secret: string): AgentWalletSecrets {
  const salt = Buffer.from(payload.kdf.salt, "base64");
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const key = deriveVaultKey(secret, salt, payload.kdf.iterations);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64")),
    decipher.final(),
  ]);
  const parsed = JSON.parse(plaintext.toString("utf8")) as unknown;
  if (!isRecord(parsed) || parsed.version !== 1 || !Array.isArray(parsed.keys)) {
    throw new Error("Invalid decrypted agent wallet vault payload");
  }
  return {
    version: 1,
    keys: parsed.keys.map((entry) => {
      if (!isRecord(entry) || typeof entry.walletId !== "string") {
        throw new Error("Invalid agent wallet key entry");
      }
      return {
        walletId: entry.walletId,
        privateKey: normalizePrivateKey(entry.privateKey),
      };
    }),
    delegations: Array.isArray(parsed.delegations)
      ? parsed.delegations.map(normalizeDelegationRecord)
      : [],
  };
}

function deriveVaultKey(secret: string, salt: Buffer, iterations = 600_000): Buffer {
  return pbkdf2Sync(secret, salt, iterations, 32, "sha256");
}

function readVaultSecret(
  dir: string,
  options: {
    createIfMissing: boolean;
  },
): string {
  const direct = process.env.WALLETCHAN_MCP_AGENT_VAULT_SECRET;
  if (direct) {
    if (direct.length >= 16) return direct;
    throw new Error("WALLETCHAN_MCP_AGENT_VAULT_SECRET must be at least 16 characters");
  }

  const secretFile = process.env.WALLETCHAN_MCP_AGENT_VAULT_SECRET_FILE;
  if (secretFile && secretFile.trim()) {
    const path = resolve(secretFile.trim());
    const value = readFileSync(path, "utf8").trim();
    if (value.length >= 16) return value;
    throw new Error(`WALLETCHAN_MCP_AGENT_VAULT_SECRET_FILE is too short: ${path}`);
  }

  const autoFile = autoVaultSecretPath(dir);
  if (existsSync(autoFile)) {
    const value = readFileSync(autoFile, "utf8").trim();
    if (value.length >= 16) return value;
    throw new Error(`Auto agent wallet vault secret file is invalid or too short: ${autoFile}`);
  }

  if (options.createIfMissing) {
    return createAutoVaultSecret(autoFile);
  }

  throw new Error(
    "Agent wallet vault secret is not configured. If this is an existing encrypted agent vault, restore the original secret with WALLETCHAN_MCP_AGENT_VAULT_SECRET or WALLETCHAN_MCP_AGENT_VAULT_SECRET_FILE. New agent wallets create a local vault-secret file automatically.",
  );
}

function createAutoVaultSecret(file: string): string {
  const value = randomBytes(32).toString("base64");
  try {
    writeFileSync(file, `${value}\n`, { mode: 0o600, flag: "wx" });
  } catch (error) {
    if ((error as { code?: string }).code === "EEXIST") {
      const existing = readFileSync(file, "utf8").trim();
      if (existing.length >= 16) return existing;
    }
    throw error;
  }
  try {
    chmodSync(file, 0o600);
  } catch {
    // Best-effort on platforms where chmod is advisory.
  }
  return value;
}

function getVaultSecretInfo(dir: string): {
  configured: boolean;
  mode: "env" | "env-file" | "auto-file" | "missing" | "invalid";
  path?: string;
  autoFile: string;
} {
  const autoFile = autoVaultSecretPath(dir);
  try {
    const direct = process.env.WALLETCHAN_MCP_AGENT_VAULT_SECRET;
    if (direct) {
      return direct.length >= 16
        ? { configured: true, mode: "env", autoFile }
        : { configured: false, mode: "invalid", autoFile };
    }
    const secretFile = process.env.WALLETCHAN_MCP_AGENT_VAULT_SECRET_FILE;
    if (secretFile && secretFile.trim()) {
      const path = resolve(secretFile.trim());
      const value = readFileSync(path, "utf8").trim();
      return value.length >= 16
        ? { configured: true, mode: "env-file", path, autoFile }
        : { configured: false, mode: "invalid", path, autoFile };
    }
    if (existsSync(autoFile)) {
      const value = readFileSync(autoFile, "utf8").trim();
      return value.length >= 16
        ? { configured: true, mode: "auto-file", path: autoFile, autoFile }
        : { configured: false, mode: "invalid", path: autoFile, autoFile };
    }
  } catch {
    return { configured: false, mode: "invalid", autoFile };
  }
  return { configured: false, mode: "missing", autoFile };
}

function autoVaultSecretPath(dir: string): string {
  return join(dir, AUTO_VAULT_SECRET_FILE);
}

function normalizePrivateKey(value: unknown): `0x${string}` {
  if (typeof value !== "string") throw new Error("Private key must be a string");
  const trimmed = value.trim();
  const withPrefix = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(withPrefix)) {
    throw new Error("Private key must be 32 bytes of hex");
  }
  const lower = withPrefix.toLowerCase() as `0x${string}`;
  privateKeyToAccount(lower);
  return lower;
}

function normalizeHex(value: unknown, label: string): `0x${string}` {
  if (typeof value === "string" && /^0x[0-9a-fA-F]*$/.test(value)) {
    return value as `0x${string}`;
  }
  throw new Error(`Invalid ${label} hex value`);
}

function normalizeAddress(value: unknown, label: string): `0x${string}` {
  if (typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)) {
    return value as `0x${string}`;
  }
  throw new Error(`Invalid ${label}: ${String(value)}`);
}

function normalizeWalletRecord(value: unknown): AgentWalletRecord {
  if (!isRecord(value)) throw new Error("Invalid agent wallet record");
  if (typeof value.id !== "string" || !value.id.trim()) {
    throw new Error("Agent wallet record is missing id");
  }
  if (typeof value.label !== "string" || !value.label.trim()) {
    throw new Error(`Agent wallet ${value.id} is missing label`);
  }
  if (typeof value.address !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(value.address)) {
    throw new Error(`Agent wallet ${value.id} has invalid address`);
  }
  return {
    id: value.id,
    label: value.label,
    address: value.address as `0x${string}`,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
  };
}

function normalizeDelegationScope(value: unknown): AgentDelegationScope {
  if (!isRecord(value) || typeof value.type !== "string" || !value.type.trim()) {
    throw new Error("Invalid agent delegation scope");
  }
  return {
    type: value.type,
    tokenAddress:
      value.tokenAddress === undefined
        ? undefined
        : normalizeAddress(value.tokenAddress, "delegation scope tokenAddress"),
    amount: typeof value.amount === "string" ? value.amount : undefined,
    amountUnits: typeof value.amountUnits === "string" ? value.amountUnits : undefined,
    periodDurationSeconds:
      typeof value.periodDurationSeconds === "number" && Number.isFinite(value.periodDurationSeconds)
        ? value.periodDurationSeconds
        : undefined,
    startDate:
      typeof value.startDate === "number" && Number.isFinite(value.startDate)
        ? value.startDate
        : undefined,
    allowedTargets: Array.isArray(value.allowedTargets)
      ? value.allowedTargets.map((entry) => normalizeAddress(entry, "delegation scope allowed target"))
      : undefined,
    allowedSelectors: Array.isArray(value.allowedSelectors)
      ? value.allowedSelectors.map((entry) => normalizeSelector(entry))
      : undefined,
  };
}

function normalizeDelegationMetadata(value: unknown): AgentDelegationMetadata {
  if (!isRecord(value)) throw new Error("Invalid agent delegation metadata");
  if (typeof value.id !== "string" || !value.id.trim()) {
    throw new Error("Agent delegation metadata is missing id");
  }
  if (typeof value.walletId !== "string" || !value.walletId.trim()) {
    throw new Error(`Agent delegation ${value.id} is missing walletId`);
  }
  const status = normalizeDelegationStatus(value.status);
  const chainId = Number(value.chainId);
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`Agent delegation ${value.id} has invalid chainId`);
  }
  const profileId = typeof value.profileId === "string" && value.profileId.startsWith("agent:")
    ? value.profileId as `agent:${string}`
    : `agent:${value.walletId}` as `agent:${string}`;
  return {
    id: value.id,
    walletId: value.walletId,
    profileId,
    label: typeof value.label === "string" && value.label.trim() ? value.label : value.id,
    status,
    chainId,
    chainName: typeof value.chainName === "string" ? value.chainName : undefined,
    delegator: normalizeAddress(value.delegator, "delegation delegator"),
    delegate: normalizeAddress(value.delegate, "delegation delegate"),
    delegationManager: normalizeAddress(value.delegationManager, "delegation manager"),
    scope: normalizeDelegationScope(value.scope),
    signatureRequestId:
      typeof value.signatureRequestId === "string" ? value.signatureRequestId : undefined,
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date(0).toISOString(),
    expiresAt: typeof value.expiresAt === "string" ? value.expiresAt : undefined,
  };
}

function normalizeDelegationRecord(value: unknown): AgentDelegationRecord {
  const metadata = normalizeDelegationMetadata(value);
  if (!isRecord(value)) throw new Error("Invalid agent delegation record");
  if (!isRecord(value.delegation)) {
    throw new Error(`Agent delegation ${metadata.id} is missing delegation payload`);
  }
  if (!isRecord(value.typedData)) {
    throw new Error(`Agent delegation ${metadata.id} is missing typedData payload`);
  }
  return {
    ...metadata,
    delegation: value.delegation,
    typedData: value.typedData,
    signature:
      value.signature === undefined
        ? undefined
        : normalizeHex(value.signature, "delegation signature"),
  };
}

function delegationMetadata(record: AgentDelegationRecord): AgentDelegationMetadata {
  const {
    delegation: _delegation,
    typedData: _typedData,
    signature: _signature,
    ...metadata
  } = normalizeDelegationRecord(record);
  return metadata;
}

function normalizeDelegationStatus(value: unknown): AgentDelegationStatus {
  if (value === "pending_signature" || value === "active") return value;
  throw new Error(`Invalid agent delegation status: ${String(value)}`);
}

function normalizeSelector(value: unknown): `0x${string}` {
  if (typeof value === "string" && /^0x[0-9a-fA-F]{8}$/.test(value)) {
    return value as `0x${string}`;
  }
  throw new Error(`Invalid function selector: ${String(value)}`);
}

function normalizeEncryptedPayload(value: unknown): EncryptedPayload | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || value.algorithm !== "aes-256-gcm" || !isRecord(value.kdf)) {
    throw new Error("Invalid agent wallet encrypted payload");
  }
  const kdf = value.kdf;
  if (
    kdf.name !== "pbkdf2" ||
    kdf.hash !== "sha256" ||
    typeof kdf.iterations !== "number" ||
    typeof kdf.salt !== "string" ||
    typeof value.iv !== "string" ||
    typeof value.tag !== "string" ||
    typeof value.ciphertext !== "string"
  ) {
    throw new Error("Invalid agent wallet encrypted payload parameters");
  }
  return value as unknown as EncryptedPayload;
}

function normalizeProfileId(value: unknown): ExecutionProfileId | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") throw new Error("Invalid default execution profile id");
  if (value === "walletconnect" || value.startsWith("agent:") || value.startsWith("agent-eoa:")) {
    return value as ExecutionProfileId;
  }
  throw new Error(`Invalid default execution profile id: ${value}`);
}

function normalizeLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, 80);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
