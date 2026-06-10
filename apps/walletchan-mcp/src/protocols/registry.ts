import { VeilProtocol } from "./veil/index.js";
import type { ProtocolToolResult } from "./stdioMcpClient.js";
import type { VeilRuntimeConfig } from "./veil/env.js";

export interface ProtocolRegistryConfig {
  veil: VeilRuntimeConfig;
}

export interface ProtocolToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export class ProtocolRegistry {
  private readonly veil: VeilProtocol;

  constructor(config: ProtocolRegistryConfig) {
    this.veil = new VeilProtocol(config.veil);
  }

  listToolDefinitions(): ProtocolToolDefinition[] {
    return [
      ...genericToolDefinitions(),
      ...this.veil.listWrappedToolDefinitions(),
    ];
  }

  listProtocols(): Record<string, unknown> {
    return {
      protocols: [
        this.veil.listProfile(),
      ],
    };
  }

  async listTools(protocolId: string): Promise<Record<string, unknown>> {
    const protocol = this.getProtocol(protocolId);
    return {
      protocol: protocolId,
      tools: await protocol.listTools(),
    };
  }

  async callTool(
    protocolId: string,
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<ProtocolToolResult> {
    return this.getProtocol(protocolId).callTool(toolName, args, timeoutMs);
  }

  getWrappedTool(toolName: string): { protocolId: "veil"; toolName: string } | null {
    if (this.veil.hasWrappedTool(toolName)) {
      return { protocolId: "veil", toolName };
    }
    return null;
  }

  veilNeedsOwner(toolName: string): boolean {
    return this.veil.needsOwner(toolName);
  }

  isVeilPrepareTool(toolName: string): boolean {
    return this.veil.isPrepareTool(toolName);
  }

  shutdown(): void {
    this.veil.shutdown();
  }

  private getProtocol(protocolId: string): VeilProtocol {
    const normalized = protocolId.trim().toLowerCase();
    if (normalized === "veil") return this.veil;
    throw new Error("Unsupported protocol: " + protocolId + ". Supported protocols: veil");
  }
}

function genericToolDefinitions(): ProtocolToolDefinition[] {
  return [
    {
      name: "list_protocols",
      title: "List Protocols",
      description: "List protocol integrations managed by WalletChan MCP, including local MCPs, CLIs, HTTP APIs, or future SDK adapters.",
      inputSchema: objectSchema({}),
    },
    {
      name: "list_protocol_tools",
      title: "List Protocol Tools",
      description: "List raw tools exposed by a managed protocol integration such as Veil MCP.",
      inputSchema: objectSchema({
        protocol: {
          description: "Protocol profile id. Currently: veil.",
          type: "string",
        },
      }, ["protocol"]),
    },
    {
      name: "call_protocol_tool",
      title: "Call Protocol Tool",
      description: "Call a raw allowlisted protocol tool. Prefer first-class WalletChan wrappers when available.",
      inputSchema: objectSchema({
        protocol: {
          description: "Protocol profile id. Currently: veil.",
          type: "string",
        },
        tool: {
          description: "Raw protocol tool name.",
          type: "string",
        },
        arguments: {
          description: "Raw protocol tool arguments.",
          type: "object",
          additionalProperties: true,
        },
        timeoutMs: {
          description: "Optional call timeout in milliseconds.",
          type: "number",
        },
      }, ["protocol", "tool"]),
    },
  ];
}

function objectSchema(
  properties: Record<string, unknown>,
  required: string[] = [],
): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
}
