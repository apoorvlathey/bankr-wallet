import readline from "node:readline";
import { readSkillResource, listSkillResources } from "./baseSkills.js";
import { WalletChanTools } from "./tools.js";

type JsonRpcId = string | number | null;

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
}

interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcError;
}

const PROTOCOL_VERSION = "2025-06-18";

export class McpServer {
  private closed = false;
  private pendingRequests = 0;

  constructor(
    private readonly tools: WalletChanTools,
    private readonly onClose?: () => void,
  ) {}

  start(): void {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr,
      terminal: false,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      this.pendingRequests += 1;
      void this.handleLine(line).finally(() => {
        this.pendingRequests -= 1;
        this.maybeClose();
      });
    });
    rl.on("close", () => {
      this.closed = true;
      this.maybeClose();
    });
  }

  private maybeClose(): void {
    if (this.closed && this.pendingRequests === 0) {
      this.onClose?.();
    }
  }

  private async handleLine(line: string): Promise<void> {
    const trimmed = line.trim();
    if (!trimmed) return;

    let request: JsonRpcRequest;
    try {
      request = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      this.sendError(null, -32700, "Parse error");
      return;
    }

    if (!request.method) {
      if (request.id !== undefined) {
        this.sendError(request.id, -32600, "Invalid request");
      }
      return;
    }

    try {
      const result = await this.handleRequest(request);
      if (request.id !== undefined) {
        this.send({ jsonrpc: "2.0", id: request.id, result });
      }
    } catch (error) {
      if (request.id !== undefined) {
        this.sendError(
          request.id,
          -32000,
          error instanceof Error ? error.message : String(error),
        );
      }
    }
  }

  private async handleRequest(request: JsonRpcRequest): Promise<unknown> {
    const params = isRecord(request.params) ? request.params : {};

    switch (request.method) {
      case "initialize":
        return {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {
            tools: {},
            resources: {},
          },
          serverInfo: {
            name: "walletchan-mcp",
            title: "WalletChan",
            version: "0.1.0",
          },
          instructions:
            "WalletChan MCP routes wallet requests through the local WalletChan extension. If pairing is needed, call get_pairing_uri and show the WalletConnect URI to the user.",
        };
      case "notifications/initialized":
      case "notifications/cancelled":
        return null;
      case "ping":
        return {};
      case "tools/list":
        return { tools: this.tools.list() };
      case "tools/call":
        return this.callTool(params);
      case "resources/list":
        return { resources: listSkillResources() };
      case "resources/read":
        return this.readResource(params);
      case "resources/templates/list":
        return { resourceTemplates: [] };
      case "prompts/list":
        return { prompts: [] };
      default:
        throw new Error(`Unsupported MCP method: ${request.method}`);
    }
  }

  private async callTool(params: Record<string, unknown>): Promise<unknown> {
    const name = typeof params.name === "string" ? params.name : "";
    if (!name) throw new Error("tools/call requires params.name");

    const result = await this.tools.call(name, params.arguments);
    return {
      content: [
        {
          type: "text",
          text: formatToolResult(result),
        },
      ],
      structuredContent: result,
      isError: false,
    };
  }

  private async readResource(params: Record<string, unknown>): Promise<unknown> {
    const uri = typeof params.uri === "string" ? params.uri : "";
    if (!uri) throw new Error("resources/read requires params.uri");
    return {
      contents: [
        {
          uri,
          mimeType: "text/markdown",
          text: await readSkillResource(uri),
        },
      ],
    };
  }

  private sendError(
    id: JsonRpcId | undefined,
    code: number,
    message: string,
    data?: unknown,
  ): void {
    this.send({
      jsonrpc: "2.0",
      id: id ?? null,
      error: data === undefined ? { code, message } : { code, message, data },
    });
  }

  private send(message: JsonRpcResponse): void {
    process.stdout.write(`${JSON.stringify(message)}\n`);
  }
}

function formatToolResult(result: unknown): string {
  return typeof result === "string" ? result : JSON.stringify(result, null, 2);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
