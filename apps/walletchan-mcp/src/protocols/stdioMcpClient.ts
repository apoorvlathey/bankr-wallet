import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

const HEADER_DELIMITER = Buffer.from("\r\n\r\n");
const CONTENT_LENGTH_HEADER = /^content-length:\s*(\d+)$/i;

export interface StdioMcpProcessConfig {
  id: string;
  name: string;
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  messageFormat?: "newline" | "content-length";
  startupTimeoutMs: number;
  callTimeoutMs: number;
}

export interface ProtocolMcpTool {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface ProtocolToolResult {
  raw: unknown;
  parsed?: unknown;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: string | number | null;
  result?: unknown;
  error?: {
    code?: number;
    message?: string;
    data?: unknown;
  };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class StdioMcpClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private initialized = false;
  private nextId = 1;
  private stdoutBuffer = Buffer.alloc(0);
  private readonly pending = new Map<number, PendingRequest>();

  constructor(private readonly config: StdioMcpProcessConfig) {}

  async listTools(): Promise<ProtocolMcpTool[]> {
    const result = await this.request("tools/list", {});
    if (!isRecord(result) || !Array.isArray(result.tools)) return [];
    return result.tools
      .filter(isRecord)
      .map((tool) => ({
        name: typeof tool.name === "string" ? tool.name : "",
        title: typeof tool.title === "string" ? tool.title : undefined,
        description: typeof tool.description === "string" ? tool.description : undefined,
        inputSchema: isRecord(tool.inputSchema) ? tool.inputSchema : undefined,
      }))
      .filter((tool) => tool.name);
  }

  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<ProtocolToolResult> {
    const raw = await this.request("tools/call", {
      name: toolName,
      arguments: args,
    }, timeoutMs);
    return {
      raw,
      parsed: parseToolResult(raw),
    };
  }

  async request(method: string, params: Record<string, unknown>, timeoutMs?: number): Promise<unknown> {
    await this.ensureInitialized();
    return this.sendRequest(method, params, timeoutMs ?? this.config.callTimeoutMs);
  }

  shutdown(): void {
    const child = this.child;
    this.child = null;
    this.initialized = false;
    if (child && !child.killed) {
      child.kill("SIGTERM");
    }
    this.rejectPending(new Error(`${this.config.name} MCP process was stopped`));
  }

  private async ensureInitialized(): Promise<void> {
    if (this.child && !this.child.killed && this.initialized) return;
    if (!this.child || this.child.killed) {
      this.startProcess();
    }
    await this.sendRequest("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: {
        name: "walletchan-mcp",
        version: "0.2.0",
      },
    }, this.config.startupTimeoutMs);
    this.sendNotification("notifications/initialized", {});
    this.initialized = true;
  }

  private startProcess(): void {
    const child = spawn(this.config.command, this.config.args, {
      cwd: this.config.cwd,
      env: this.config.env,
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child = child;
    this.initialized = false;
    this.stdoutBuffer = Buffer.alloc(0);

    child.stdout.on("data", (chunk: Buffer) => this.handleStdout(chunk));
    child.stderr.on("data", (chunk: Buffer) => {
      process.stderr.write(`[${this.config.id}] ${chunk.toString("utf8")}`);
    });
    child.on("error", (error) => {
      this.child = null;
      this.initialized = false;
      this.rejectPending(error);
    });
    child.on("exit", (code, signal) => {
      this.child = null;
      this.initialized = false;
      this.rejectPending(new Error(
        `${this.config.name} MCP exited${signal ? ` with ${signal}` : ` with code ${code}`}`,
      ));
    });
  }

  private sendRequest(
    method: string,
    params: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<unknown> {
    const child = this.child;
    if (!child || child.killed) {
      throw new Error(`${this.config.name} MCP process is not running`);
    }

    const id = this.nextId++;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        if (method === "initialize") {
          this.shutdown();
        }
        reject(new Error(`${this.config.name} MCP ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(this.formatMessage(payload), (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  private sendNotification(method: string, params: Record<string, unknown>): void {
    const child = this.child;
    if (!child || child.killed) return;
    child.stdin.write(this.formatMessage({ jsonrpc: "2.0", method, params }));
  }

  private handleStdout(chunk: Buffer): void {
    this.stdoutBuffer = Buffer.concat([this.stdoutBuffer, chunk]);
    while (true) {
      if (this.tryHandleFramedMessage()) continue;
      if (this.startsWithMcpHeader()) return;
      if (this.tryHandleLineMessage()) continue;
      return;
    }
  }

  private tryHandleFramedMessage(): boolean {
    const headerEnd = this.stdoutBuffer.indexOf(HEADER_DELIMITER);
    if (headerEnd === -1) return false;

    const header = this.stdoutBuffer.slice(0, headerEnd).toString("utf8");
    const contentLength = parseContentLength(header);
    if (contentLength === null) {
      this.stdoutBuffer = this.stdoutBuffer.slice(headerEnd + HEADER_DELIMITER.length);
      process.stderr.write(`[${this.config.id}] Ignoring MCP child stdout block without Content-Length\n`);
      return true;
    }

    const bodyStart = headerEnd + HEADER_DELIMITER.length;
    const bodyEnd = bodyStart + contentLength;
    if (this.stdoutBuffer.length < bodyEnd) return false;

    const body = this.stdoutBuffer.slice(bodyStart, bodyEnd).toString("utf8");
    this.stdoutBuffer = this.stdoutBuffer.slice(bodyEnd);
    this.handleJsonMessage(body);
    return true;
  }

  private startsWithMcpHeader(): boolean {
    const firstLineEnd = this.stdoutBuffer.indexOf("\n");
    const sample = (firstLineEnd === -1 ? this.stdoutBuffer : this.stdoutBuffer.slice(0, firstLineEnd))
      .toString("utf8")
      .trim();
    return CONTENT_LENGTH_HEADER.test(sample);
  }

  private tryHandleLineMessage(): boolean {
    const newline = this.stdoutBuffer.indexOf("\n");
    if (newline === -1) return false;
    const line = this.stdoutBuffer.slice(0, newline).toString("utf8").trim();
    this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
    if (line) this.handleJsonMessage(line);
    return true;
  }

  private handleJsonMessage(raw: string): void {
    let message: JsonRpcResponse;
    try {
      message = JSON.parse(raw) as JsonRpcResponse;
    } catch {
      process.stderr.write(`[${this.config.id}] Ignoring non-JSON stdout line from MCP child\n`);
      return;
    }

    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);

    if (message.error) {
      const err = new Error(message.error.message || `${this.config.name} MCP request failed`);
      pending.reject(err);
      return;
    }
    pending.resolve(message.result);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private formatMessage(message: unknown): string {
    return formatMcpMessage(message, this.config.messageFormat ?? "newline");
  }
}

function formatMcpMessage(
  message: unknown,
  format: NonNullable<StdioMcpProcessConfig["messageFormat"]>,
): string {
  const body = JSON.stringify(message);
  if (format === "newline") return `${body}\n`;
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

function parseContentLength(header: string): number | null {
  for (const line of header.split(/\r?\n/)) {
    const match = line.match(CONTENT_LENGTH_HEADER);
    if (!match) continue;
    const length = Number(match[1]);
    return Number.isInteger(length) && length >= 0 ? length : null;
  }
  return null;
}

export function parseToolResult(raw: unknown): unknown {
  if (isRecord(raw) && isRecord(raw.structuredContent)) {
    return raw.structuredContent;
  }
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
