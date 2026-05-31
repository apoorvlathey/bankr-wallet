export interface RemoteMcpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface RemoteMcpToolResult {
  raw: unknown;
  parsed?: unknown;
}

export interface RemoteMcpProfile {
  id: string;
  name: string;
  url: string;
  login?: {
    startTool: string;
    completeTool: string;
    walletAddressArg: string;
  };
}

const PROFILES: RemoteMcpProfile[] = [
  {
    id: "virtuals",
    name: "Virtuals ACP",
    url: "https://mcp.acp.virtuals.io/",
    login: {
      startTool: "login_start",
      completeTool: "login_complete",
      walletAddressArg: "walletAddress",
    },
  },
];

export class RemoteMcpRegistry {
  listProfiles(): Array<{ id: string; name: string; url: string; hasSiweLogin: boolean }> {
    return PROFILES.map((profile) => ({
      id: profile.id,
      name: profile.name,
      url: profile.url,
      hasSiweLogin: !!profile.login,
    }));
  }

  async listTools(profileId: string): Promise<RemoteMcpTool[]> {
    const profile = this.getProfile(profileId);
    const result = await postMcp(profile.url, "tools/list", {});
    const tools = isRecord(result) && Array.isArray(result.tools) ? result.tools : [];
    return tools
      .filter(isRecord)
      .map((tool) => ({
        name: typeof tool.name === "string" ? tool.name : "",
        description: typeof tool.description === "string" ? tool.description : undefined,
        inputSchema: isRecord(tool.inputSchema) ? tool.inputSchema : undefined,
      }))
      .filter((tool) => tool.name);
  }

  async callTool(
    profileId: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<RemoteMcpToolResult> {
    const profile = this.getProfile(profileId);
    if (!/^[a-zA-Z0-9_.-]+$/.test(toolName)) {
      throw new Error(`Invalid remote MCP tool name: ${toolName}`);
    }
    if (
      profile.login &&
      (toolName === profile.login.startTool || toolName === profile.login.completeTool)
    ) {
      throw new Error(
        `Use start_remote_mcp_siwe_login / complete_remote_mcp_siwe_login for ${profile.id} login so WalletChan preserves the exact SIWE challenge.`,
      );
    }
    return this.callToolUnchecked(profile, toolName, args);
  }

  async startSiweLogin(
    profileId: string,
    walletAddress: string,
  ): Promise<{ profile: RemoteMcpProfile; result: RemoteMcpToolResult; message: string }> {
    const profile = this.getProfile(profileId);
    if (!profile.login) throw new Error(`${profile.id} does not expose a configured SIWE login flow`);
    const result = await this.callToolUnchecked(profile, profile.login.startTool, {
      [profile.login.walletAddressArg]: walletAddress,
    });
    const payload = isRecord(result.parsed) ? result.parsed : undefined;
    const message = typeof payload?.message === "string" ? payload.message : undefined;
    if (!message) {
      throw new Error(`${profile.id} ${profile.login.startTool} did not return a SIWE message`);
    }
    return { profile, result, message };
  }

  async completeSiweLogin(
    profileId: string,
    message: string,
    signature: string,
  ): Promise<RemoteMcpToolResult> {
    const profile = this.getProfile(profileId);
    if (!profile.login) throw new Error(`${profile.id} does not expose a configured SIWE login flow`);
    return this.callToolUnchecked(profile, profile.login.completeTool, {
      message,
      signature,
    });
  }

  private async callToolUnchecked(
    profile: RemoteMcpProfile,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<RemoteMcpToolResult> {
    const raw = await postMcp(profile.url, "tools/call", {
      name: toolName,
      arguments: args,
    });
    return {
      raw,
      parsed: parseToolResult(raw),
    };
  }

  private getProfile(profileId: string): RemoteMcpProfile {
    const normalized = profileId.trim().toLowerCase();
    const profile = PROFILES.find((item) => item.id === normalized);
    if (!profile) {
      throw new Error(
        `Unsupported remote MCP profile: ${profileId}. Supported profiles: ${PROFILES.map((item) => item.id).join(", ")}`,
      );
    }
    return profile;
  }
}

async function postMcp(url: string, method: string, params: Record<string, unknown>): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Remote MCP ${method} failed: ${response.status} ${text.slice(0, 300)}`);
  }
  const payload = parseMcpResponse(text);
  if (isRecord(payload) && isRecord(payload.error)) {
    const message =
      typeof payload.error.message === "string"
        ? payload.error.message
        : JSON.stringify(payload.error);
    throw new Error(`Remote MCP ${method} failed: ${message}`);
  }
  if (!isRecord(payload) || !("result" in payload)) {
    throw new Error(`Remote MCP ${method} returned an invalid response`);
  }
  return payload.result;
}

function parseMcpResponse(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) return JSON.parse(trimmed);
  const dataLines = trimmed
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim());
  const data = dataLines.find((line) => line && line !== "[DONE]");
  if (!data) throw new Error("Remote MCP returned an empty event stream");
  return JSON.parse(data);
}

function parseToolResult(raw: unknown): unknown {
  if (!isRecord(raw) || !Array.isArray(raw.content)) return undefined;
  const text = raw.content
    .filter(isRecord)
    .map((item) => (typeof item.text === "string" ? item.text : ""))
    .find((value) => value.trim());
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
