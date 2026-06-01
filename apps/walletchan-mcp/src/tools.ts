import { randomUUID } from "node:crypto";
import type { BasePluginCliRunner } from "./basePluginCli.js";
import { loadBasePlugin, listSkillResources } from "./baseSkills.js";
import type { ManagedRpcProcess } from "./managedRpc.js";
import { extractPreparedCalls } from "./preparedCalls.js";
import type { WalletCall } from "./rpcClient.js";
import {
  isWalletConnectionError,
  walletConnectionErrorMessage,
  WalletChanRpcClient,
} from "./rpcClient.js";
import { RemoteMcpRegistry } from "./remoteMcp.js";
import { RequestTracker } from "./requestTracker.js";
import { prepareSiweMessage } from "./siwe.js";
import type { WebRequestTool } from "./webRequest.js";
import type { WalletChanActionBuilder, PreparedWalletAction } from "./walletchanActions.js";

export interface ToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export class WalletChanTools {
  private readonly remoteSiweLogins = new Map<
    string,
    {
      profile: string;
      message: string;
      signatureRequestId: string;
      createdAt: number;
    }
  >();

  constructor(
    private readonly rpc: WalletChanRpcClient,
    private readonly tracker: RequestTracker,
    private readonly rpcManager: ManagedRpcProcess,
    private readonly webRequest: WebRequestTool,
    private readonly basePluginCli: BasePluginCliRunner,
    private readonly walletchanActions: WalletChanActionBuilder,
    private readonly remoteMcp: RemoteMcpRegistry,
  ) {}

  list(): ToolDefinition[] {
    return [
      {
        name: "get_pairing_uri",
        title: "Get Pairing URI",
        description: "Start or inspect the managed WalletChan RPC bridge and return the WalletConnect pairing URI and local QR page URL when pairing is needed. Clients that render MCP image content may also show an attached QR code.",
        inputSchema: objectSchema({
          waitMs: {
            description: "How long to wait for the pairing URI when starting walletchan-rpc. Defaults to 15000.",
            type: "number",
          },
        }),
      },
      {
        name: "get_wallets",
        title: "Get Wallets",
        description: "Get approved WalletChan RPC accounts and configured chains.",
        inputSchema: objectSchema({
          chain: {
            description: "Optional chain name or chain ID to validate against the configured WalletChan RPC chains.",
            type: ["string", "number"],
          },
        }),
      },
      {
        name: "send_calls",
        title: "Send Calls",
        description: "Submit an ERC-5792 wallet_sendCalls batch through WalletChan RPC for user approval in WalletChan.",
        inputSchema: objectSchema(
          {
            chain: {
              description: "Chain name or ID, e.g. base or 8453.",
              type: ["string", "number"],
            },
            from: {
              description: "Optional approved account. Defaults to the first approved WalletChan RPC account.",
              type: "string",
            },
            atomicRequired: {
              description: "Whether the batch must execute atomically. Defaults to true.",
              type: "boolean",
            },
            calls: {
              description: "Ordered calls from a plugin prepare endpoint.",
              type: "array",
              items: callSchema(),
            },
          },
          ["chain", "calls"],
        ),
      },
      {
        name: "send_prepared_calls",
        title: "Send Prepared Calls",
        description: "Normalize a Base plugin prepare response into wallet_sendCalls and submit it through WalletChan. Accepts common shapes like transactions[], calls[], {data:{to,value,data}}, and approval+action objects.",
        inputSchema: objectSchema(
          {
            prepared: {
              description: "Raw prepare response from a harness-fetched Base plugin API, harness-run CLI, or harness-configured MCP.",
            },
            chain: {
              description: "Optional chain override. Defaults to the chain in the prepared response or base.",
              type: ["string", "number"],
            },
            from: {
              description: "Optional approved account. Defaults to the first approved WalletChan RPC account.",
              type: "string",
            },
            atomicRequired: {
              description: "Whether the batch must execute atomically. Defaults to true.",
              type: "boolean",
            },
            previewOnly: {
              description: "If true, only return normalized calls without submitting to WalletChan.",
              type: "boolean",
            },
            allowWarnings: {
              description: "If true, allow submission even when the prepared response contains error-level warnings. Defaults to false.",
              type: "boolean",
            },
          },
          ["prepared"],
        ),
      },
      {
        name: "get_portfolio_balances",
        title: "Get Portfolio Balances",
        description: "Fetch WalletChan portfolio balances for an address or the connected WalletChan account, including tokens and DeFi positions.",
        inputSchema: objectSchema({
          address: {
            description: "Optional address to inspect. Defaults to the first approved WalletChan RPC account.",
            type: "string",
          },
          from: {
            description: "Alias for address when using an approved WalletChan RPC account.",
            type: "string",
          },
          minValueUsd: {
            description: "Optional minimum token value to include. Defaults to 0.",
            type: "number",
          },
          limit: {
            description: "Optional maximum number of token balances to return.",
            type: "number",
          },
          includeDefi: {
            description: "Whether to include DeFi positions. Defaults to true.",
            type: "boolean",
          },
        }),
      },
      {
        name: "get_swap_price",
        title: "Get Swap Price",
        description: "Fetch an indicative WalletChan swap price using the same first-party swap API as the extension.",
        inputSchema: objectSchema(
          {
            chain: { description: "Chain name or ID. Defaults to the active WalletChan RPC chain.", type: ["string", "number"] },
            from: { description: "Optional taker/approved account.", type: "string" },
            taker: { description: "Alias for from.", type: "string" },
            sellToken: { description: "Sell token address, symbol from the WalletChan token list, or native/ETH.", type: "string" },
            buyToken: { description: "Buy token address, symbol from the WalletChan token list, or native/ETH.", type: "string" },
            sellAmount: { description: "Decimal sell amount in token units, e.g. 1.5. Use sellAmountWei for base units.", type: "string" },
            sellAmountWei: { description: "Optional base-unit sell amount as an integer string.", type: "string" },
            decimals: { description: "Optional token decimals when sellToken is an address not in the token list.", type: "number" },
            tokenDecimals: { description: "Alias for decimals.", type: "number" },
            slippageBps: { description: "Slippage in basis points. Defaults to 500 (5%).", type: "number" },
            recipient: { description: "Optional recipient for bought tokens.", type: "string" },
          },
          ["sellToken", "buyToken"],
        ),
      },
      {
        name: "swap",
        title: "Swap",
        description: "Quote a WalletChan swap, build needed approval plus swap calls, and submit them to WalletChan for popup approval unless previewOnly is true.",
        inputSchema: objectSchema(
          {
            chain: { description: "Chain name or ID. Defaults to the active WalletChan RPC chain.", type: ["string", "number"] },
            from: { description: "Optional approved WalletChan sender. Defaults to first approved account.", type: "string" },
            taker: { description: "Alias for from.", type: "string" },
            sellToken: { description: "Sell token address, symbol from the WalletChan token list, or native/ETH.", type: "string" },
            buyToken: { description: "Buy token address, symbol from the WalletChan token list, or native/ETH.", type: "string" },
            sellAmount: { description: "Decimal sell amount in token units, e.g. 1.5. Use sellAmountWei for base units.", type: "string" },
            sellAmountWei: { description: "Optional base-unit sell amount as an integer string.", type: "string" },
            decimals: { description: "Optional token decimals when sellToken is an address not in the token list.", type: "number" },
            tokenDecimals: { description: "Alias for decimals.", type: "number" },
            slippageBps: { description: "Slippage in basis points. Defaults to 500 (5%).", type: "number" },
            recipient: { description: "Optional recipient for bought tokens.", type: "string" },
            atomicRequired: { description: "Whether the WalletChan call batch must execute atomically. Defaults to true with automatic non-atomic fallback.", type: "boolean" },
            previewOnly: { description: "If true, return quote and prepared calls without submitting to WalletChan.", type: "boolean" },
            submit: { description: "Set false to return quote and prepared calls without submitting to WalletChan.", type: "boolean" },
            allowWarnings: { description: "If true, allow submission despite balance/liquidity warnings. Defaults to false.", type: "boolean" },
          },
          ["sellToken", "buyToken"],
        ),
      },
      {
        name: "get_bridge_quote",
        title: "Get Bridge Quote",
        description: "Fetch a WalletChan bridge quote using the same first-party Bungee proxy as the extension.",
        inputSchema: bridgeInputSchema(false),
      },
      {
        name: "bridge",
        title: "Bridge",
        description: "Quote a WalletChan bridge, build needed approval plus bridge calls, and submit them to WalletChan for popup approval unless previewOnly is true.",
        inputSchema: bridgeInputSchema(true),
      },
      {
        name: "get_bridge_status",
        title: "Get Bridge Status",
        description: "Fetch WalletChan bridge status by Bungee requestHash or source txHash.",
        inputSchema: objectSchema({
          requestHash: { type: "string" },
          txHash: { type: "string" },
        }),
      },
      {
        name: "get_request_status",
        title: "Get Request Status",
        description: "Get the status of a WalletChan MCP request or wallet_sendCalls bundle.",
        inputSchema: objectSchema(
          {
            requestId: {
              description: "Request ID returned by send_calls, sign, or send_transaction.",
              type: "string",
            },
            id: {
              description: "Alias for requestId.",
              type: "string",
            },
          },
          [],
        ),
      },
      {
        name: "web_request",
        title: "Web Request",
        description: "Call an allowlisted HTTPS protocol API from the local WalletChan MCP process. Use this for Base plugin web_request paths when the host is allowed.",
        inputSchema: objectSchema(
          {
            url: {
              description: "HTTPS URL on an allowlisted protocol host.",
              type: "string",
            },
            method: {
              description: "HTTP method. Defaults to GET.",
              enum: ["GET", "POST"],
            },
            headers: {
              description: "Optional string headers. Authorization, Cookie, Host, and proxy headers are blocked.",
              type: "object",
              additionalProperties: { type: "string" },
            },
            body: {
              description: "Optional string or JSON body for POST requests.",
            },
            timeoutMs: {
              description: "Optional request timeout in milliseconds. Defaults to 30000.",
              type: "number",
            },
          },
          ["url"],
        ),
      },
      {
        name: "run_base_plugin_cli",
        title: "Run Base Plugin CLI",
        description: "Run a pinned, allowlisted protocol CLI command from the local WalletChan MCP process. Supports configured Base plugin CLI runners and can submit prepared transaction output through WalletChan.",
        inputSchema: objectSchema(
          {
            plugin: {
              description: "Base plugin runner to use.",
              enum: ["morpho", "aerodrome"],
            },
            command: {
              description: "Allowlisted CLI command, e.g. query-vaults or prepare-deposit.",
              type: "string",
            },
            args: {
              description: "Structured CLI arguments. Use kebab-case, camelCase, or snake_case option names.",
              type: "object",
              additionalProperties: true,
            },
            timeoutMs: {
              description: "Optional CLI timeout in milliseconds. Defaults to 90000.",
              type: "number",
            },
            submitPreparedCalls: {
              description: "If true, normalize the CLI output and submit it to WalletChan with send_prepared_calls.",
              type: "boolean",
            },
            chain: {
              description: "Optional chain override for submitPreparedCalls.",
              type: ["string", "number"],
            },
            from: {
              description: "Optional approved account for submitPreparedCalls.",
              type: "string",
            },
            atomicRequired: {
              description: "Optional atomicRequired value for submitPreparedCalls.",
              type: "boolean",
            },
            previewOnly: {
              description: "If submitPreparedCalls is true, preview normalized calls without submitting.",
              type: "boolean",
            },
            allowWarnings: {
              description: "If submitPreparedCalls is true, allow submission despite error-level prepare warnings. Defaults to false.",
              type: "boolean",
            },
          },
          ["plugin", "command"],
        ),
      },
      {
        name: "list_base_plugin_runners",
        title: "List Base Plugin Runners",
        description: "List pinned protocol CLI runners and supported commands available inside WalletChan MCP.",
        inputSchema: objectSchema({}),
      },
      {
        name: "list_remote_mcp_tools",
        title: "List Remote MCP Tools",
        description: "List tools from an allowlisted protocol MCP profile. Currently supports the Virtuals ACP MCP profile.",
        inputSchema: objectSchema({
          profile: {
            description: "Allowlisted remote MCP profile. Currently: virtuals.",
            type: "string",
          },
        }, ["profile"]),
      },
      {
        name: "call_remote_mcp_tool",
        title: "Call Remote MCP Tool",
        description: "Call an allowlisted protocol MCP tool through WalletChan MCP. Login tools are blocked here; use the remote SIWE login helpers.",
        inputSchema: objectSchema(
          {
            profile: {
              description: "Allowlisted remote MCP profile. Currently: virtuals.",
              type: "string",
            },
            tool: {
              description: "Remote MCP tool name.",
              type: "string",
            },
            arguments: {
              description: "Remote MCP tool arguments.",
              type: "object",
              additionalProperties: true,
            },
          },
          ["profile", "tool"],
        ),
      },
      {
        name: "start_remote_mcp_siwe_login",
        title: "Start Remote MCP SIWE Login",
        description: "Start an allowlisted remote MCP SIWE login, preserve the exact challenge, and open a WalletChan signature request.",
        inputSchema: objectSchema({
          profile: {
            description: "Allowlisted remote MCP profile. Currently: virtuals.",
            type: "string",
          },
          address: {
            description: "Optional approved signer address. Defaults to the first approved WalletChan RPC account.",
            type: "string",
          },
          chain: {
            description: "Optional chain name or ID. Defaults to the SIWE message chain.",
            type: ["string", "number"],
          },
        }, ["profile"]),
      },
      {
        name: "complete_remote_mcp_siwe_login",
        title: "Complete Remote MCP SIWE Login",
        description: "Complete a remote MCP SIWE login after the WalletChan signature request has been approved.",
        inputSchema: objectSchema({
          loginId: {
            description: "Login ID returned by start_remote_mcp_siwe_login.",
            type: "string",
          },
        }, ["loginId"]),
      },
      {
        name: "sign_siwe",
        title: "Sign SIWE",
        description: "Validate an EIP-4361 SIWE message, then start a WalletChan personal_sign request for the exact message.",
        inputSchema: objectSchema({
          message: {
            description: "Exact SIWE message to sign. Preferred when returned by a protocol login_start tool.",
            type: "string",
          },
          domain: {
            description: "SIWE domain, used only when message is omitted.",
            type: "string",
          },
          address: {
            description: "Optional signer address. Must match the SIWE message address when message is provided.",
            type: "string",
          },
          walletAddress: {
            description: "Alias for address.",
            type: "string",
          },
          uri: {
            description: "SIWE URI, used only when message is omitted.",
            type: "string",
          },
          version: {
            description: "SIWE version. Defaults to 1 when message is omitted.",
            type: "string",
          },
          chain: {
            description: "Optional chain name or ID. Must match the SIWE Chain ID when provided.",
            type: ["string", "number"],
          },
          chainId: {
            description: "SIWE Chain ID, used only when message is omitted.",
            type: ["string", "number"],
          },
          nonce: {
            description: "SIWE nonce, used only when message is omitted.",
            type: "string",
          },
          issuedAt: {
            description: "SIWE issued-at timestamp, used only when message is omitted.",
            type: "string",
          },
          expirationTime: {
            description: "Optional SIWE expiration timestamp.",
            type: "string",
          },
          notBefore: {
            description: "Optional SIWE not-before timestamp.",
            type: "string",
          },
          requestId: {
            description: "Optional SIWE request ID.",
            type: "string",
          },
          statement: {
            description: "Optional SIWE statement.",
            type: "string",
          },
          resources: {
            description: "Optional SIWE resource URIs.",
            type: "array",
            items: { type: "string" },
          },
        }),
      },
      {
        name: "sign",
        title: "Sign",
        description: "Start a WalletChan signature request. The user approves in the WalletChan popup.",
        inputSchema: objectSchema({
          type: {
            description: "Signature method. Defaults to personal_sign.",
            enum: ["personal_sign", "eth_signTypedData_v3", "eth_signTypedData_v4"],
          },
          chain: {
            description: "Optional chain name or ID.",
            type: ["string", "number"],
          },
          address: {
            description: "Optional approved signer address. Defaults to the first approved WalletChan RPC account.",
            type: "string",
          },
          message: {
            description: "Message for personal_sign, or typed-data JSON string.",
            type: "string",
          },
          data: {
            description: "For personal_sign, may be { message }. For typed-data signing, pass the typed data object or JSON string.",
          },
        }),
      },
      {
        name: "send_transaction",
        title: "Send Transaction",
        description: "Start a single eth_sendTransaction request through WalletChan RPC for user approval.",
        inputSchema: objectSchema(
          {
            chain: {
              description: "Chain name or ID.",
              type: ["string", "number"],
            },
            from: {
              description: "Optional approved sender. Defaults to the first approved WalletChan RPC account.",
              type: "string",
            },
            to: { type: "string" },
            value: { type: "string", description: "Hex or decimal wei string. Defaults to 0x0." },
            data: { type: "string", description: "Calldata hex. Defaults to 0x." },
          },
          ["chain"],
        ),
      },
      {
        name: "load_base_plugin",
        title: "Load Base Plugin",
        description: "Load an upstream Base MCP native plugin reference with WalletChan MCP execution overrides prepended.",
        inputSchema: objectSchema(
          {
            plugin: {
              description: "Base plugin slug, e.g. morpho, moonwell, uniswap, avantis, aerodrome, virtuals, bankr. Future safe slugs are allowed.",
              type: "string",
            },
          },
          ["plugin"],
        ),
      },
      {
        name: "list_skill_resources",
        title: "List Skill Resources",
        description: "List WalletChan MCP skill and adapted Base plugin resources.",
        inputSchema: objectSchema({}),
      },
    ];
  }

  async call(name: string, args: unknown): Promise<unknown> {
    const input = isRecord(args) ? args : {};
    try {
      return await this.callUnsafe(name, input);
    } catch (error) {
      if (isWalletConnectionError(error)) {
        return this.walletConnectionRecovery(name, error);
      }
      throw error;
    }
  }

  private async callUnsafe(name: string, input: Record<string, unknown>): Promise<unknown> {
    switch (name) {
      case "get_pairing_uri":
        return this.rpcManager.getPairingState(
          typeof input.waitMs === "number" ? input.waitMs : 15000,
        );
      case "get_wallets":
        return this.getWallets(input);
      case "send_calls": {
        return this.sendCallBatch({
          chain: input.chain,
          from: optionalString(input.from),
          atomicRequired:
            typeof input.atomicRequired === "boolean"
              ? input.atomicRequired
              : undefined,
          calls: normalizeCalls(input.calls),
        });
      }
      case "send_prepared_calls":
        return this.sendPreparedCalls(input);
      case "get_portfolio_balances":
        return optionalString(input.address)
          ? this.walletchanActions.portfolio(input)
          : this.withRpc(() => this.walletchanActions.portfolio(input));
      case "get_swap_price":
        return this.withRpc(() => this.walletchanActions.swapPrice(input));
      case "swap":
        return this.runPreparedWalletAction(
          await this.withRpc(() => this.walletchanActions.prepareSwap(input)),
          input,
        );
      case "get_bridge_quote":
        return this.withRpc(() => this.walletchanActions.bridgeQuote(input));
      case "bridge":
        return this.runPreparedWalletAction(
          await this.withRpc(() => this.walletchanActions.prepareBridge(input)),
          input,
        );
      case "get_bridge_status":
        return this.walletchanActions.bridgeStatus(input);
      case "get_request_status":
        return this.getRequestStatus(requiredRequestId(input));
      case "web_request":
        return this.webRequest.request({
          url: requiredString(input.url, "web_request requires url"),
          method: optionalString(input.method),
          headers: input.headers,
          body: input.body,
          timeoutMs: optionalNumber(input.timeoutMs),
        });
      case "run_base_plugin_cli":
        return this.runBasePluginCli(input);
      case "list_base_plugin_runners":
        return this.basePluginCli.list();
      case "list_remote_mcp_tools":
        return {
          profiles: this.remoteMcp.listProfiles(),
          tools: await this.remoteMcp.listTools(
            requiredString(input.profile, "list_remote_mcp_tools requires profile"),
          ),
        };
      case "call_remote_mcp_tool":
        return this.remoteMcp.callTool(
          requiredString(input.profile, "call_remote_mcp_tool requires profile"),
          requiredString(input.tool, "call_remote_mcp_tool requires tool"),
          isRecord(input.arguments) ? input.arguments : {},
        );
      case "start_remote_mcp_siwe_login":
        return this.startRemoteMcpSiweLogin(input);
      case "complete_remote_mcp_siwe_login":
        return this.completeRemoteMcpSiweLogin(input);
      case "sign_siwe":
        return this.signSiwe(input);
      case "sign": {
        await this.ensureWalletReady();
        const request = this.tracker.start(
          "signature",
          this.withRpc(() => this.rpc.sign({
            type: optionalString(input.type),
            chain: input.chain,
            address: optionalString(input.address),
            message: input.message,
            data: input.data,
          })),
        );
        return {
          requestId: request.id,
          status: "pending",
          approvalMode: "walletchan_popup",
          message: "Approve or reject the signature request in the WalletChan popup.",
        };
      }
      case "send_transaction": {
        await this.ensureWalletReady();
        const request = this.tracker.start(
          "transaction",
          this.withRpc(() => this.rpc.sendTransaction({
            chain: input.chain,
            from: optionalString(input.from),
            to: optionalString(input.to),
            value: optionalString(input.value),
            data: optionalString(input.data),
          })),
        );
        return {
          requestId: request.id,
          status: "pending",
          approvalMode: "walletchan_popup",
          message: "Approve or reject the transaction in the WalletChan popup.",
        };
      }
      case "load_base_plugin":
        return {
          plugin: input.plugin,
          markdown: await loadBasePlugin(String(input.plugin || "")),
        };
      case "list_skill_resources":
        return { resources: listSkillResources() };
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  private async getWallets(input: Record<string, unknown>): Promise<unknown> {
    await this.rpcManager.ensureStarted();
    const [wallets, selectedChain] = await Promise.all([
      this.rpc.getWallets(),
      input.chain === undefined ? Promise.resolve(null) : this.rpc.resolveChain(input.chain),
    ]);
    return selectedChain ? { ...wallets, selectedChain } : wallets;
  }

  private async signSiwe(input: Record<string, unknown>): Promise<unknown> {
    const siwe = prepareSiweMessage(input);
    await this.ensureWalletReady();
    const request = this.tracker.start(
      "signature",
      this.withRpc(() => this.rpc.sign({
        type: "personal_sign",
        chain: input.chain ?? siwe.fields.chainId,
        address: optionalString(input.address) || optionalString(input.walletAddress) || siwe.fields.address,
        message: siwe.message,
      })),
    );
    return {
      requestId: request.id,
      status: "pending",
      approvalMode: "walletchan_popup",
      siwe: {
        domain: siwe.fields.domain,
        address: siwe.fields.address,
        uri: siwe.fields.uri,
        chainId: siwe.fields.chainId,
        nonce: siwe.fields.nonce,
        expirationTime: siwe.fields.expirationTime,
      },
      message: "Approve or reject the SIWE signature request in the WalletChan popup.",
    };
  }

  private async startRemoteMcpSiweLogin(input: Record<string, unknown>): Promise<unknown> {
    await this.rpcManager.ensureStarted();
    const address = optionalString(input.address) || (await this.rpc.resolveFrom(undefined));
    const started = await this.remoteMcp.startSiweLogin(
      requiredString(input.profile, "start_remote_mcp_siwe_login requires profile"),
      address,
    );
    const siwe = prepareSiweMessage({
      message: started.message,
      address,
      chain: input.chain,
    });
    const request = this.tracker.start(
      "signature",
      this.rpc.sign({
        type: "personal_sign",
        chain: input.chain ?? siwe.fields.chainId,
        address,
        message: siwe.message,
      }),
    );
    const loginId = `remote-siwe-${randomUUID()}`;
    this.remoteSiweLogins.set(loginId, {
      profile: started.profile.id,
      message: siwe.message,
      signatureRequestId: request.id,
      createdAt: Date.now(),
    });
    return {
      loginId,
      signatureRequestId: request.id,
      status: "pending_signature",
      profile: started.profile.id,
      approvalMode: "walletchan_popup",
      siwe: {
        domain: siwe.fields.domain,
        address: siwe.fields.address,
        uri: siwe.fields.uri,
        chainId: siwe.fields.chainId,
        nonce: siwe.fields.nonce,
        expirationTime: siwe.fields.expirationTime,
      },
      remote: started.result.parsed ?? started.result.raw,
      message: "Approve the SIWE signature in WalletChan, then call complete_remote_mcp_siwe_login with loginId.",
    };
  }

  private async completeRemoteMcpSiweLogin(input: Record<string, unknown>): Promise<unknown> {
    const loginId = requiredString(input.loginId, "complete_remote_mcp_siwe_login requires loginId");
    const login = this.remoteSiweLogins.get(loginId);
    if (!login) {
      throw new Error(`Unknown or expired remote MCP SIWE login: ${loginId}`);
    }
    const tracked = this.tracker.get(login.signatureRequestId);
    if (!tracked || tracked.state === "pending") {
      return {
        loginId,
        signatureRequestId: login.signatureRequestId,
        status: "pending_signature",
        message: "The WalletChan signature request is still pending.",
      };
    }
    if (tracked.state === "error") {
      if (isWalletConnectionError(tracked.error)) {
        return {
          ...(await this.walletConnectionRecovery("complete_remote_mcp_siwe_login", tracked.error)),
          loginId,
          signatureRequestId: login.signatureRequestId,
          previousRequestStatus: "failed",
          error: tracked.error,
          errorCode: tracked.errorCode,
          errorData: tracked.errorData,
        };
      }
      return {
        loginId,
        signatureRequestId: login.signatureRequestId,
        status: "failed",
        error: tracked.error,
        errorCode: tracked.errorCode,
        errorData: tracked.errorData,
      };
    }
    const signature = typeof tracked.result === "string" ? tracked.result : "";
    if (!signature) {
      throw new Error(`Remote MCP SIWE login ${loginId} has no signature result`);
    }
    const result = await this.remoteMcp.completeSiweLogin(
      login.profile,
      login.message,
      signature,
    );
    this.remoteSiweLogins.delete(loginId);
    return {
      loginId,
      status: "complete",
      profile: login.profile,
      result: result.parsed ?? result.raw,
    };
  }

  private async getRequestStatus(requestId: string): Promise<unknown> {
    const tracked = this.tracker.get(requestId);
    if (tracked) {
      if (tracked.state === "pending") {
        return {
          requestId,
          status: "pending",
          kind: tracked.kind,
          createdAt: tracked.createdAt,
        };
      }
      if (tracked.state === "error") {
        if (isWalletConnectionError(tracked.error)) {
          return {
            ...(await this.walletConnectionRecovery("get_request_status", tracked.error)),
            requestId,
            previousRequestStatus: "failed",
            kind: tracked.kind,
            error: tracked.error,
            errorCode: tracked.errorCode,
            errorData: tracked.errorData,
            createdAt: tracked.createdAt,
          };
        }
        return {
          requestId,
          status: "failed",
          kind: tracked.kind,
          error: tracked.error,
          errorCode: tracked.errorCode,
          errorData: tracked.errorData,
          createdAt: tracked.createdAt,
        };
      }
      return {
        requestId,
        status: tracked.kind === "signature" ? "signed" : "confirmed",
        kind: tracked.kind,
        [tracked.kind === "signature" ? "signature" : "txHash"]: tracked.result,
        createdAt: tracked.createdAt,
      };
    }

    await this.rpcManager.ensureStarted();
    const status = await this.rpc.getCallsStatus(requestId);
    return {
      requestId,
      status: mapBundleStatus(status),
      bundle: status,
    };
  }

  private async withRpc<T>(work: () => Promise<T>): Promise<T> {
    await this.rpcManager.ensureStarted();
    return work();
  }

  private async ensureWalletReady(): Promise<void> {
    await this.rpcManager.ensureStarted();
    const wallets = await this.rpc.getWallets();
    if (!wallets.connected) {
      throw new Error(wallets.message);
    }
  }

  private async walletConnectionRecovery(
    toolName: string,
    error: unknown,
  ): Promise<Record<string, unknown>> {
    const recovery = await this.rpcManager.getPairingState(0).catch((pairingError) => ({
      managed: true,
      running: false,
      connected: false,
      pairingUri: null,
      error: pairingError instanceof Error ? pairingError.message : String(pairingError),
    }));
    const recoveryRecord: Record<string, unknown> = isRecord(recovery) ? recovery : {};
    const connected = recoveryRecord.connected === true;
    const pairingUri =
      typeof recoveryRecord.pairingUri === "string"
        ? recoveryRecord.pairingUri
        : null;
    const pairingUrl =
      typeof recoveryRecord.pairingUrl === "string"
        ? recoveryRecord.pairingUrl
        : null;

    return {
      status: connected ? "retry_wallet_action" : "needs_pairing",
      errorCode: "walletconnect_disconnected",
      needsPairing: !connected,
      tool: toolName,
      error: walletConnectionErrorMessage(error),
      approvalMode: "walletchan_popup",
      reconnect: recovery,
      pairingUri,
      pairingUrl,
      recommendedNextTool: connected ? toolName : "get_pairing_uri",
      retryAfterPairingTool: toolName,
      reprepareRequired: isPreparedActionTool(toolName),
      message: connected
        ? "WalletChan RPC reports a paired wallet again. Retry the wallet action."
        : pairingUri
          ? "The WalletConnect session is disconnected. Show the pairing URL or WalletConnect URI to the user, wait for a wallet to pair, then retry the wallet action."
          : "The WalletConnect session is disconnected. Call get_pairing_uri to create a fresh WalletConnect URI, wait for a wallet to pair, then retry the wallet action.",
    };
  }

  private async sendPreparedCalls(input: Record<string, unknown>): Promise<unknown> {
    const prepared = extractPreparedCalls(input.prepared, input.chain);
    if (input.previewOnly === true) {
      return {
        ...prepared,
        status: "preview",
      };
    }
    const blockingWarning = getBlockingPreparedWarning(input.prepared);
    if (blockingWarning && input.allowWarnings !== true) {
      throw new Error(
        `Prepared response contains an error-level warning; refusing to submit. Preview the calls or pass allowWarnings=true only if the user explicitly wants to continue. Warning: ${blockingWarning}`,
      );
    }
    return this.sendCallBatch({
      chain: prepared.chain,
      from: optionalString(input.from),
      atomicRequired:
        typeof input.atomicRequired === "boolean" ? input.atomicRequired : undefined,
      calls: prepared.calls,
      metadata: {
        preparedSourcePaths: prepared.sourcePaths,
        preparedWarnings: prepared.warnings,
      },
    });
  }

  private async runBasePluginCli(input: Record<string, unknown>): Promise<unknown> {
    const result = await this.basePluginCli.run({
      plugin: requiredString(input.plugin, "run_base_plugin_cli requires plugin"),
      command: requiredString(input.command, "run_base_plugin_cli requires command"),
      args: input.args,
      timeoutMs: optionalNumber(input.timeoutMs),
    });

    if (input.submitPreparedCalls !== true) return result;

    const submission = await this.sendPreparedCalls({
      prepared: result.parsed ?? result.stdout,
      chain: input.chain,
      from: input.from,
      atomicRequired: input.atomicRequired,
      previewOnly: input.previewOnly,
      allowWarnings: input.allowWarnings,
    });
    return {
      ...result,
      submission,
    };
  }

  private async runPreparedWalletAction(
    action: PreparedWalletAction,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    if (input.previewOnly === true || input.submit === false) {
      return {
        status: "preview",
        kind: action.kind,
        chain: action.chain,
        from: action.from,
        calls: action.calls,
        warnings: action.warnings,
        metadata: action.metadata,
        raw: action.raw,
      };
    }
    return this.sendCallBatch({
      chain: action.chain.chainId,
      from: action.from,
      atomicRequired:
        typeof input.atomicRequired === "boolean" ? input.atomicRequired : undefined,
      calls: action.calls,
      metadata: {
        action: action.kind,
        actionMetadata: action.metadata,
        preparedWarnings: action.warnings,
      },
    });
  }

  private async sendCallBatch(args: {
    chain: unknown;
    from?: string;
    atomicRequired?: boolean;
    calls: WalletCall[];
    metadata?: Record<string, unknown>;
  }): Promise<unknown> {
    const result = await this.withRpc(() => this.sendCallsWithAtomicFallback(args));
    const requestId = extractBundleId(result);
    return {
      ...asRecord(result),
      ...args.metadata,
      requestId,
      status: "pending",
      approvalMode: "walletchan_popup",
      message: "Approve or reject this batch in the WalletChan popup.",
    };
  }

  private async sendCallsWithAtomicFallback(args: {
    chain: unknown;
    from?: string;
    atomicRequired?: boolean;
    calls: WalletCall[];
  }): Promise<unknown> {
    try {
      return await this.rpc.sendCalls({
        chain: args.chain,
        from: args.from,
        atomicRequired: args.atomicRequired,
        calls: args.calls,
      });
    } catch (error) {
      if (args.atomicRequired !== undefined || !isAtomicUnsupportedError(error)) {
        throw error;
      }
      return this.rpc.sendCalls({
        chain: args.chain,
        from: args.from,
        atomicRequired: false,
        calls: args.calls,
      });
    }
  }
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

function callSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      to: { type: "string" },
      value: { type: "string" },
      data: { type: "string" },
    },
    required: ["to"],
    additionalProperties: true,
  };
}

function bridgeInputSchema(includeSubmissionFields: boolean): Record<string, unknown> {
  return objectSchema(
    {
      chain: {
        description: "Alias for originChain.",
        type: ["string", "number"],
      },
      originChain: {
        description: "Origin/source chain name or ID. Defaults to the active WalletChan RPC chain.",
        type: ["string", "number"],
      },
      destinationChainId: {
        description: "Destination chain ID.",
        type: "number",
      },
      destinationChain: {
        description: "Alias for destinationChainId.",
        type: ["string", "number"],
      },
      from: {
        description: "Optional approved WalletChan sender. Defaults to first approved account.",
        type: "string",
      },
      userAddress: {
        description: "Alias for from.",
        type: "string",
      },
      receiverAddress: {
        description: "Optional destination receiver. Defaults to from.",
        type: "string",
      },
      inputToken: {
        description: "Origin token address, symbol from the WalletChan/Bungee token list, or native/ETH.",
        type: "string",
      },
      outputToken: {
        description: "Destination token address, symbol from the WalletChan/Bungee token list, or native/ETH.",
        type: "string",
      },
      inputAmount: {
        description: "Decimal input amount in token units, e.g. 1.5. Use inputAmountWei for base units.",
        type: "string",
      },
      inputAmountWei: {
        description: "Optional base-unit input amount as an integer string.",
        type: "string",
      },
      decimals: {
        description: "Optional token decimals when inputToken is an address not in the token list.",
        type: "number",
      },
      tokenDecimals: {
        description: "Alias for decimals.",
        type: "number",
      },
      slippageBps: {
        description: "Slippage in basis points. Defaults to 500 (5%).",
        type: "number",
      },
      slippage: {
        description: "Bungee slippage percentage, e.g. 0.5. Overrides slippageBps.",
        type: "number",
      },
      ...(includeSubmissionFields
        ? {
            atomicRequired: {
              description: "Whether the WalletChan call batch must execute atomically. Defaults to true with automatic non-atomic fallback.",
              type: "boolean",
            },
            previewOnly: {
              description: "If true, return quote and prepared calls without submitting to WalletChan.",
              type: "boolean",
            },
            submit: {
              description: "Set false to return quote and prepared calls without submitting to WalletChan.",
              type: "boolean",
            },
          }
        : {}),
    },
    ["inputToken", "outputToken"],
  );
}

function normalizeCalls(value: unknown): WalletCall[] {
  if (!Array.isArray(value)) {
    throw new Error("send_calls requires a calls array");
  }
  return value.map((entry) => {
    if (!isRecord(entry)) throw new Error("Each call must be an object");
    return {
      to: String(entry.to || "") as `0x${string}`,
      value: optionalString(entry.value) as `0x${string}` | undefined,
      data: optionalString(entry.data) as `0x${string}` | undefined,
    };
  });
}

function extractBundleId(result: unknown): string {
  if (typeof result === "string" && result.length > 0) return result;
  if (isRecord(result)) {
    if (typeof result.id === "string") return result.id;
    if (typeof result.batchId === "string") return result.batchId;
  }
  throw new Error("WalletChan RPC did not return a wallet_sendCalls bundle ID");
}

function isAtomicUnsupportedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /atomic/i.test(message) && /not (available|supported)|unsupported/i.test(message);
}

function isPreparedActionTool(toolName: string): boolean {
  return toolName === "send_calls" ||
    toolName === "send_prepared_calls" ||
    toolName === "send_transaction" ||
    toolName === "swap" ||
    toolName === "bridge" ||
    toolName === "run_base_plugin_cli";
}

function requiredRequestId(input: Record<string, unknown>): string {
  const requestId = optionalString(input.requestId) || optionalString(input.id);
  if (!requestId) throw new Error("get_request_status requires requestId");
  return requestId;
}

function mapBundleStatus(value: unknown): string {
  const status = isRecord(value) && typeof value.status === "number"
    ? value.status
    : null;
  if (status === null) return "unknown";
  if (status >= 100 && status < 200) return "pending";
  if (status >= 200 && status < 300) return "confirmed";
  if (status >= 400) return "failed";
  return "unknown";
}

function getBlockingPreparedWarning(value: unknown): string | null {
  const parsed = parseMaybeJson(value);
  if (!isRecord(parsed)) return null;

  if (parsed.simulationOk === false) {
    return "Prepared response reports simulationOk=false.";
  }

  if (!Array.isArray(parsed.warnings)) return null;
  for (const warning of parsed.warnings) {
    if (typeof warning === "string") continue;
    if (!isRecord(warning)) continue;
    const level = typeof warning.level === "string" ? warning.level.toLowerCase() : "";
    const code = typeof warning.code === "string" ? warning.code.toUpperCase() : "";
    if (level === "error" || code.includes("REVERT") || code.includes("ERROR")) {
      return typeof warning.message === "string"
        ? warning.message
        : JSON.stringify(warning);
    }
  }
  return null;
}

function parseMaybeJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return value;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(message);
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
