import { randomUUID } from "node:crypto";
import type { AgentDelegationManager } from "./agentDelegation.js";
import type { AgentEoaExecutor } from "./agentEoaExecutor.js";
import type { AgentDelegationMetadata, AgentWalletStore, ExecutionProfile } from "./agentWallets.js";
import type { AgentX402Client } from "./agentX402.js";
import type { BasePluginCliCommandInfo, BasePluginCliRunner } from "./basePluginCli.js";
import { loadBasePlugin, listSkillResources } from "./baseSkills.js";
import type { ManagedRpcProcess } from "./managedRpc.js";
import type { NameResolver } from "./nameResolver.js";
import type { OneShotRelayer } from "./oneShotRelayer.js";
import { extractPreparedCalls } from "./preparedCalls.js";
import type { ProtocolRegistry } from "./protocols/registry.js";
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

const BASE_PLUGIN_SENDER_ARG_NAMES = new Set(["user-address", "wallet"]);
const PENDING_AGENT_ACTION_TTL_MS = 15 * 60 * 1000;
type AgentDelegationDelegateMode = "oneshot-relayer" | "agent-wallet" | "custom";

interface SendCallBatchArgs {
  chain: unknown;
  from?: string;
  atomicRequired?: boolean;
  calls: WalletCall[];
  executionProfile?: string;
  paymentToken?: string;
  paymentAmountUnits?: string;
  metadata?: Record<string, unknown>;
}

interface PendingAgentAction {
  id: string;
  delegationId: string;
  args: SendCallBatchArgs;
  createdAt: number;
}

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

  private readonly pendingAgentActions = new Map<string, PendingAgentAction>();

  constructor(
    private readonly rpc: WalletChanRpcClient,
    private readonly tracker: RequestTracker,
    private readonly rpcManager: ManagedRpcProcess,
    private readonly webRequest: WebRequestTool,
    private readonly basePluginCli: BasePluginCliRunner,
    private readonly walletchanActions: WalletChanActionBuilder,
    private readonly nameResolver: NameResolver,
    private readonly remoteMcp: RemoteMcpRegistry,
    private readonly protocols: ProtocolRegistry,
    private readonly agentWallets: AgentWalletStore,
    private readonly agentDelegation: AgentDelegationManager,
    private readonly agentEoa: AgentEoaExecutor,
    private readonly agentX402: AgentX402Client,
    private readonly oneShotRelayer: OneShotRelayer,
  ) {}

  list(): ToolDefinition[] {
    return [
      {
        name: "get_pairing_uri",
        title: "Get Pairing URI",
        description: "Start or inspect the managed WalletChan RPC bridge and return the wallet pairing URI and local QR page URL when pairing is needed. The URI may be WalletConnect or MetaMask Connect depending on the managed RPC transport. When a pairing URI is available, the tool emits an MCP image content block with the QR code before the text fallback.",
        inputSchema: objectSchema({
          waitMs: {
            description: "How long to wait for the pairing URI when starting walletchan-rpc. Defaults to 15000.",
            type: "number",
          },
          forceNewSession: {
            description: "If true, disconnect stored wallet sessions and generate a fresh URI for pairing a different wallet.",
            type: "boolean",
          },
          force: {
            description: "Alias for forceNewSession.",
            type: "boolean",
          },
          walletTransport: {
            description: "Optional live switch for the managed RPC wallet transport. Use walletconnect or metamask-connect.",
            type: "string",
          },
          transport: {
            description: "Alias for walletTransport.",
            type: "string",
          },
          account: {
            description: "Optional MetaMask Connect account address to request. Use with forceRequest: true when asking MetaMask to switch/select a specific account.",
            type: "string",
          },
          forceRequest: {
            description: "If true, ask the active transport to show a new connection/account request even if already connected. Currently useful for MetaMask Connect account switching.",
            type: "boolean",
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
        name: "resolve_name",
        title: "Resolve Name",
        description: "Resolve a user-provided WalletChan-supported name to an EVM address. Supports ENS and subdomains, Basenames under .base.eth, WNS .wei, GNS .gwei, and MegaNames .mega. Uses MCP RPC overrides first, then WalletChan default RPCs.",
        inputSchema: objectSchema(
          {
            name: {
              description: "Name to resolve, e.g. vitalik.eth, name.base.eth, name.wei, name.gwei, or name.mega.",
              type: "string",
            },
          },
          ["name"],
        ),
      },
      {
        name: "resolve_names",
        title: "Resolve Names",
        description: "Resolve multiple user-provided WalletChan-supported names to EVM addresses. Supports ENS/subdomains, Basenames, .wei, .gwei, and .mega.",
        inputSchema: objectSchema(
          {
            names: {
              description: "Names to resolve.",
              type: "array",
              items: { type: "string" },
            },
          },
          ["names"],
        ),
      },
      {
        name: "list_execution_profiles",
        title: "List Execution Profiles",
        description: "List WalletChan execution profiles. walletconnect uses the existing WalletChan popup path; agent and agent-eoa profiles are local agent wallet profiles for delegated and raw execution.",
        inputSchema: objectSchema({}),
      },
      {
        name: "get_default_execution_profile",
        title: "Get Default Execution Profile",
        description: "Get the stored default execution profile. Defaults to walletconnect when no explicit default is stored.",
        inputSchema: objectSchema({}),
      },
      {
        name: "set_default_execution_profile",
        title: "Set Default Execution Profile",
        description: "Store the default execution profile for future mutating WalletChan MCP tools. Use walletconnect for the main WalletChan wallet, agent:<walletId> for delegated agent execution, or agent-eoa:<walletId> for raw local agent EOA execution.",
        inputSchema: objectSchema(
          {
            profileId: {
              description: "Execution profile ID. The aliases agent and agent-eoa work only when exactly one agent wallet exists.",
              type: "string",
            },
          },
          ["profileId"],
        ),
      },
      {
        name: "clear_default_execution_profile",
        title: "Clear Default Execution Profile",
        description: "Clear the stored default execution profile. Future mutating tools fall back to walletconnect.",
        inputSchema: objectSchema({}),
      },
      {
        name: "agent_create_wallet",
        title: "Create Agent Wallet",
        description: "Create a local encrypted agent wallet. Creates a local vault-secret file automatically when needed. Returns address and profile IDs, never the private key.",
        inputSchema: objectSchema({
          label: {
            description: "Optional display label for the agent wallet.",
            type: "string",
          },
        }),
      },
      {
        name: "agent_import_wallet",
        title: "Import Agent Wallet",
        description: "Import a local encrypted agent wallet private key. Creates a local vault-secret file automatically when needed. Returns address and profile IDs, never the private key.",
        inputSchema: objectSchema(
          {
            privateKey: {
              description: "Agent wallet private key. This is accepted only for import and is encrypted immediately; it is never returned by WalletChan MCP.",
              type: "string",
            },
            label: {
              description: "Optional display label for the agent wallet.",
              type: "string",
            },
          },
          ["privateKey"],
        ),
      },
      {
        name: "agent_list_wallets",
        title: "List Agent Wallets",
        description: "List local agent wallet metadata and profile IDs. Does not decrypt or return private keys.",
        inputSchema: objectSchema({}),
      },
      {
        name: "agent_get_wallet",
        title: "Get Agent Wallet",
        description: "Get one local agent wallet metadata record and its profile IDs. Does not decrypt or return the private key.",
        inputSchema: objectSchema(
          {
            walletId: {
              description: "Agent wallet ID.",
              type: "string",
            },
          },
          ["walletId"],
        ),
      },
      {
        name: "agent_delete_wallet",
        title: "Delete Agent Wallet",
        description: "Delete a local encrypted agent wallet and its private key material. Requires confirm=true.",
        inputSchema: objectSchema(
          {
            walletId: {
              description: "Agent wallet ID.",
              type: "string",
            },
            confirm: {
              description: "Must be true to delete the wallet.",
              type: "boolean",
            },
          },
          ["walletId", "confirm"],
        ),
      },
      {
        name: "agent_reset_vault",
        title: "Reset Agent Vault",
        description: "Forget all local agent wallets, delegations, and default agent profile without decrypting the vault. Use this when you intentionally want a fresh agent-wallet setup, especially after removing an old env vault secret. Requires confirm=true and confirmationText=RESET_AGENT_VAULT.",
        inputSchema: objectSchema(
          {
            confirm: {
              description: "Must be true to reset the local agent wallet vault.",
              type: "boolean",
            },
            confirmationText: {
              description: "Must equal RESET_AGENT_VAULT.",
              type: "string",
            },
          },
          ["confirm", "confirmationText"],
        ),
      },
      {
        name: "agent_prepare_delegation",
        title: "Prepare Agent Delegation",
        description: "Create a pending ERC-7710 delegation from the connected WalletChan wallet. Defaults to a 1Shot-compatible relayer delegation with a Base USDC daily spend scope. Stores the unsigned delegation payload encrypted in the agent vault.",
        inputSchema: objectSchema({
          profileId: {
            description: "Delegated agent profile ID, e.g. agent:<walletId>. The alias agent works only when exactly one agent wallet exists.",
            type: "string",
          },
          walletId: {
            description: "Agent wallet ID. Alternative to profileId.",
            type: "string",
          },
          chain: {
            description: "Configured chain name or ID. Defaults to Base when configured.",
            type: ["string", "number"],
          },
          delegator: {
            description: "Main WalletChan account granting authority. Defaults to the first approved WalletChan RPC account.",
            type: "string",
          },
          delegateAddress: {
            description: "Optional explicit delegate override. Usually omit this: delegateMode=oneshot-relayer resolves the current 1Shot targetAddress automatically.",
            type: "string",
          },
          delegateMode: {
            description: "Delegation target mode. Defaults to oneshot-relayer for agent_oneshot_relay_calls. Use agent-wallet for delegated x402 endpoints that require the local agent wallet address, or custom with delegateAddress.",
            enum: ["oneshot-relayer", "agent-wallet", "custom"],
          },
          label: {
            description: "Optional delegation label.",
            type: "string",
          },
          scopeType: {
            description: "Delegation scope. Defaults to erc20-period-transfer for daily Base USDC limits.",
            enum: [
              "erc20-period-transfer",
              "erc20-transfer-amount",
              "native-token-period-transfer",
              "native-token-transfer-amount",
              "function-call",
            ],
          },
          tokenAddress: {
            description: "ERC-20 token address. Defaults to Base USDC on Base.",
            type: "string",
          },
          tokenDecimals: {
            description: "ERC-20 decimals. Defaults to 6 for Base USDC.",
            type: "number",
          },
          amount: {
            description: "Decimal token/native amount for the spend limit, e.g. 10. Use amountUnits for raw units.",
            type: "string",
          },
          amountUnits: {
            description: "Raw integer token/native units for the spend limit.",
            type: "string",
          },
          maxAmount: {
            description: "Alias for amount.",
            type: "string",
          },
          maxAmountUnits: {
            description: "Alias for amountUnits.",
            type: "string",
          },
          periodDurationSeconds: {
            description: "Period duration for periodic scopes. Defaults to 86400.",
            type: "number",
          },
          startDate: {
            description: "Unix timestamp in seconds for periodic scopes. Defaults to now.",
            type: "number",
          },
          validForSeconds: {
            description: "Optional timestamp caveat lifetime in seconds.",
            type: "number",
          },
          allowedTargets: {
            description: "For function-call scope, allowed contract targets.",
            type: "array",
            items: { type: "string" },
          },
          allowedSelectors: {
            description: "For function-call scope, allowed 4-byte selectors.",
            type: "array",
            items: { type: "string" },
          },
          valueLimitWei: {
            description: "Optional native value cap for function-call scope as a decimal wei string.",
            type: "string",
          },
        }),
      },
      {
        name: "agent_request_delegation_signature",
        title: "Request Agent Delegation Signature",
        description: "Open a WalletChan eth_signTypedData_v4 request for a pending agent delegation. The user approves with the main WalletChan wallet in the popup.",
        inputSchema: objectSchema(
          {
            delegationId: {
              description: "Pending delegation ID returned by agent_prepare_delegation.",
              type: "string",
            },
          },
          ["delegationId"],
        ),
      },
      {
        name: "agent_complete_delegation",
        title: "Complete Agent Delegation",
        description: "Complete a pending agent delegation after the WalletChan signature request is approved, verify the signer, and store the signed delegation encrypted in the agent vault.",
        inputSchema: objectSchema(
          {
            delegationId: {
              description: "Delegation ID returned by agent_prepare_delegation.",
              type: "string",
            },
            requestId: {
              description: "Optional signature request ID. Defaults to the request stored by agent_request_delegation_signature.",
              type: "string",
            },
            signature: {
              description: "Optional direct signature override. Normally omit and let WalletChan MCP read the tracked signature request.",
              type: "string",
            },
            pendingActionId: {
              description: "Optional pending delegated action to submit after activation. Defaults to the pending action associated with this delegation, when one exists.",
              type: "string",
            },
            submitPendingAction: {
              description: "Whether to submit an MCP-created pending agent action after the delegation activates. Defaults to true when a matching pending action exists.",
              type: "boolean",
            },
          },
          ["delegationId"],
        ),
      },
      {
        name: "agent_list_delegations",
        title: "List Agent Delegations",
        description: "List local agent delegation metadata. Signed delegation payloads remain encrypted and are not returned.",
        inputSchema: objectSchema({
          walletId: {
            description: "Optional agent wallet ID filter.",
            type: "string",
          },
          chainId: {
            description: "Optional chain ID filter.",
            type: "number",
          },
          status: {
            description: "Optional status filter.",
            enum: ["pending_signature", "active"],
          },
        }),
      },
      {
        name: "agent_get_delegation",
        title: "Get Agent Delegation",
        description: "Get one local agent delegation. By default returns metadata only; pass includePayload=true to include encrypted-vault payload after decrypting locally.",
        inputSchema: objectSchema(
          {
            delegationId: {
              description: "Delegation ID.",
              type: "string",
            },
            includePayload: {
              description: "If true, include typed data and signed delegation payload. This never includes private keys.",
              type: "boolean",
            },
          },
          ["delegationId"],
        ),
      },
      {
        name: "agent_delete_delegation",
        title: "Delete Agent Delegation",
        description: "Delete a locally stored agent delegation session. This does not revoke onchain permissions; it only removes MCP's local artifact. Requires confirm=true.",
        inputSchema: objectSchema(
          {
            delegationId: {
              description: "Delegation ID.",
              type: "string",
            },
            confirm: {
              description: "Must be true to delete the local delegation.",
              type: "boolean",
            },
          },
          ["delegationId", "confirm"],
        ),
      },
      {
        name: "agent_oneshot_get_capabilities",
        title: "Get 1Shot Capabilities",
        description: "Fetch 1Shot public relayer capabilities for one or more chains. agent_prepare_delegation resolves targetAddress automatically when delegateMode is oneshot-relayer.",
        inputSchema: objectSchema({
          chainIds: {
            description: "Chain IDs to query. Defaults to Base (8453).",
            type: "array",
            items: { type: ["string", "number"] },
          },
        }),
      },
      {
        name: "agent_oneshot_get_fee_data",
        title: "Get 1Shot Fee Data",
        description: "Fetch 1Shot public relayer fee data for a chain/payment token pair.",
        inputSchema: objectSchema(
          {
            chainId: {
              description: "Chain ID. Defaults to Base (8453).",
              type: ["string", "number"],
            },
            token: {
              description: "Payment token address. Defaults to Base USDC when chainId is Base.",
              type: "string",
            },
          },
          [],
        ),
      },
      {
        name: "agent_oneshot_relay_calls",
        title: "Relay Agent Calls With 1Shot",
        description: "Build, estimate, or submit an ERC-7710 delegated transaction bundle through the 1Shot public relayer. Requires an active 1Shot-compatible agent delegation whose delegate equals the relayer targetAddress. Uses preview mode unless confirm=true.",
        inputSchema: objectSchema(
          {
            profileId: {
              description: "Delegated agent profile ID, e.g. agent:<walletId>. The alias agent works only when exactly one agent wallet exists.",
              type: "string",
            },
            walletId: {
              description: "Agent wallet ID. Alternative to profileId.",
              type: "string",
            },
            delegationId: {
              description: "Specific active delegation ID. Defaults to the active delegation for the profile and chain.",
              type: "string",
            },
            chain: {
              description: "Configured chain name or ID. Defaults to Base when configured.",
              type: ["string", "number"],
            },
            calls: {
              description: "Executions to redeem through the signed delegation.",
              type: "array",
              items: callSchema(),
            },
            paymentToken: {
              description: "Stablecoin payment token for the relayer fee. Defaults to a token from 1Shot capabilities, preferring Base USDC on Base.",
              type: "string",
            },
            paymentAmountUnits: {
              description: "Optional initial relayer fee payment in payment token base units. If omitted, MCP uses relayer_getFeeData minFee and adjusts after estimate when needed.",
              type: "string",
            },
            includeFeePayment: {
              description: "Whether to prepend the payment token transfer to the relayer feeCollector. Defaults to true.",
              type: "boolean",
            },
            estimateOnly: {
              description: "If true, estimate but do not submit.",
              type: "boolean",
            },
            submit: {
              description: "Set false to build and estimate without submitting.",
              type: "boolean",
            },
            confirm: {
              description: "Must be true to submit to the relayer.",
              type: "boolean",
            },
            skipEstimate: {
              description: "Debug only. If true with confirm=true, submit without first fetching a fresh estimate/context.",
              type: "boolean",
            },
            context: {
              description: "Optional signed 1Shot price-lock context from a recent estimate.",
              type: "string",
            },
            taskId: {
              description: "Optional 0x-prefixed 32-byte task ID.",
              type: "string",
            },
            destinationUrl: {
              description: "Optional webhook destination URL for 1Shot status updates.",
              type: "string",
            },
            memo: {
              description: "Optional opaque memo echoed by 1Shot status.",
              type: "string",
            },
            validateDelegate: {
              description: "Set false to skip relayer targetAddress validation. Defaults to true.",
              type: "boolean",
            },
          },
          ["calls"],
        ),
      },
      {
        name: "agent_oneshot_get_status",
        title: "Get 1Shot Status",
        description: "Poll 1Shot public relayer status for a submitted task ID.",
        inputSchema: objectSchema(
          {
            taskId: {
              description: "0x-prefixed 32-byte 1Shot task ID.",
              type: "string",
            },
            logs: {
              description: "Whether to include receipt logs.",
              type: "boolean",
            },
          },
          ["taskId"],
        ),
      },
      {
        name: "agent_x402_quote",
        title: "Quote x402 Resource",
        description: "Probe an x402-protected HTTPS resource without signing or submitting payment. Reports whether the endpoint offers ERC-7710 delegated x402 payment for agent profiles.",
        inputSchema: x402InputSchema(false),
      },
      {
        name: "agent_x402_pay",
        title: "Pay x402 Resource With Agent",
        description: "Pay and fetch an x402-protected HTTPS resource. The default agent profile spends through the main wallet's ERC-7710 delegation; explicitly pass agent-eoa:<walletId> only for raw agent-wallet payment.",
        inputSchema: x402InputSchema(true),
      },
      {
        name: "agent_eoa_get_balance",
        title: "Get Agent EOA Balance",
        description: "Read native or ERC-20 balance for a raw local agent EOA profile. Does not require WalletConnect pairing.",
        inputSchema: objectSchema({
          profileId: {
            description: "Raw agent EOA profile ID, e.g. agent-eoa:<walletId>. The alias agent-eoa works only when exactly one agent wallet exists.",
            type: "string",
          },
          walletId: {
            description: "Agent wallet ID. Alternative to profileId.",
            type: "string",
          },
          chain: {
            description: "Configured chain name or ID. Defaults to Base when configured.",
            type: ["string", "number"],
          },
          token: {
            description: "Optional ERC-20 token address. Omit for native balance.",
            type: "string",
          },
        }),
      },
      {
        name: "agent_eoa_send_transaction",
        title: "Send Agent EOA Transaction",
        description: "Sign and broadcast a transaction directly from a raw local agent EOA. This bypasses WalletChan popup approval and should be used only when the user explicitly chose the raw agent wallet.",
        inputSchema: objectSchema(
          {
            profileId: {
              description: "Raw agent EOA profile ID, e.g. agent-eoa:<walletId>. The alias agent-eoa works only when exactly one agent wallet exists.",
              type: "string",
            },
            walletId: {
              description: "Agent wallet ID. Alternative to profileId.",
              type: "string",
            },
            chain: {
              description: "Configured chain name or ID. Defaults to Base when configured.",
              type: ["string", "number"],
            },
            to: { type: "string" },
            value: { type: "string", description: "Hex or decimal wei string. Defaults to 0x0." },
            data: { type: "string", description: "Calldata hex. Defaults to 0x." },
            gas: { type: "string" },
            maxFeePerGas: { type: "string" },
            maxPriorityFeePerGas: { type: "string" },
            gasPrice: { type: "string" },
          },
          [],
        ),
      },
      {
        name: "agent_eoa_send_calls",
        title: "Send Agent EOA Calls",
        description: "Sign and broadcast calls sequentially from a raw local agent EOA. This path is not atomic and bypasses WalletChan popup approval.",
        inputSchema: objectSchema(
          {
            profileId: {
              description: "Raw agent EOA profile ID, e.g. agent-eoa:<walletId>. The alias agent-eoa works only when exactly one agent wallet exists.",
              type: "string",
            },
            walletId: {
              description: "Agent wallet ID. Alternative to profileId.",
              type: "string",
            },
            chain: {
              description: "Configured chain name or ID. Defaults to Base when configured.",
              type: ["string", "number"],
            },
            calls: {
              description: "Ordered raw calls to submit sequentially.",
              type: "array",
              items: callSchema(),
            },
          },
          ["calls"],
        ),
      },
      {
        name: "send_calls",
        title: "Send Calls",
        description: "Submit wallet calls through WalletChan RPC. Uses ERC-5792 wallet_sendCalls when the wallet supports it, otherwise sends the calls sequentially as individual user-approved transactions.",
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
            executionProfile: executionProfileInputDescription(),
            profileId: executionProfileAliasDescription(),
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
        description: "Normalize a Base plugin prepare response into wallet calls and submit it through WalletChan. Accepts common shapes like transactions[], calls[], {data:{to,value,data}}, and approval+action objects. Non-batching wallets get sequential transaction fallback.",
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
            executionProfile: executionProfileInputDescription(),
            profileId: executionProfileAliasDescription(),
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
            executionProfile: executionProfileInputDescription(),
            profileId: executionProfileAliasDescription(),
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
            executionProfile: executionProfileInputDescription(),
            profileId: executionProfileAliasDescription(),
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
      ...this.protocols.listToolDefinitions(),
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
            executionProfile: executionProfileInputDescription(),
            profileId: executionProfileAliasDescription(),
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
          {
            account: parseOptionalAddressInput(input.account, "account"),
            forceRequest: input.forceRequest === true,
            forceNewSession: input.forceNewSession === true || input.force === true,
            walletTransport: parseWalletTransportInput(input.walletTransport ?? input.transport),
          },
        );
      case "get_wallets":
        return this.getWallets(input);
      case "resolve_name":
        return this.nameResolver.resolveName(requiredString(input.name, "resolve_name requires name"));
      case "resolve_names":
        return {
          results: await Promise.all(
            requiredStringArray(input.names, "resolve_names requires names").map((entry) =>
              this.nameResolver.resolveName(entry),
            ),
          ),
        };
      case "list_execution_profiles":
        return this.listExecutionProfiles();
      case "get_default_execution_profile":
        return {
          profile: this.agentWallets.getDefaultExecutionProfile(),
          storage: this.agentWallets.getStorageInfo(),
        };
      case "set_default_execution_profile":
        return {
          profile: this.agentWallets.setDefaultExecutionProfile(
            requiredString(input.profileId, "set_default_execution_profile requires profileId"),
          ),
          profiles: this.agentWallets.listExecutionProfiles(),
        };
      case "clear_default_execution_profile":
        return {
          profile: this.agentWallets.clearDefaultExecutionProfile(),
          profiles: this.agentWallets.listExecutionProfiles(),
        };
      case "agent_create_wallet":
        return this.formatAgentWalletResult(
          this.agentWallets.createWallet({ label: optionalString(input.label) }),
        );
      case "agent_import_wallet":
        return this.formatAgentWalletResult(
          this.agentWallets.importWallet({
            privateKey: requiredString(input.privateKey, "agent_import_wallet requires privateKey"),
            label: optionalString(input.label),
          }),
        );
      case "agent_list_wallets":
        return {
          wallets: this.agentWallets.listWallets().map((wallet) => this.formatAgentWallet(wallet)),
          profiles: this.agentWallets.listExecutionProfiles(),
          storage: this.agentWallets.getStorageInfo(),
        };
      case "agent_get_wallet":
        return this.formatAgentWalletResult(
          this.agentWallets.getWallet(
            requiredString(input.walletId, "agent_get_wallet requires walletId"),
          ),
        );
      case "agent_delete_wallet":
        if (input.confirm !== true) {
          throw new Error("agent_delete_wallet requires confirm=true");
        }
        return {
          deleted: this.formatAgentWallet(
            this.agentWallets.deleteWallet(
              requiredString(input.walletId, "agent_delete_wallet requires walletId"),
            ),
          ),
          profiles: this.agentWallets.listExecutionProfiles(),
        };
      case "agent_reset_vault":
        if (input.confirm !== true || input.confirmationText !== "RESET_AGENT_VAULT") {
          throw new Error("agent_reset_vault requires confirm=true and confirmationText=RESET_AGENT_VAULT");
        }
        return {
          reset: this.agentWallets.resetVault(),
          profiles: this.agentWallets.listExecutionProfiles(),
          storage: this.agentWallets.getStorageInfo(),
        };
      case "agent_prepare_delegation":
        return this.prepareAgentDelegation(input);
      case "agent_request_delegation_signature":
        return this.requestAgentDelegationSignature(input);
      case "agent_complete_delegation":
        return this.completeAgentDelegation(input);
      case "agent_list_delegations":
        return {
          delegations: this.agentWallets.listDelegations({
            walletId: optionalString(input.walletId),
            chainId: optionalNumber(input.chainId),
            status: optionalDelegationStatus(input.status),
          }),
          profiles: this.agentWallets.listExecutionProfiles(),
          storage: this.agentWallets.getStorageInfo(),
        };
      case "agent_get_delegation": {
        const delegationId = requiredString(input.delegationId, "agent_get_delegation requires delegationId");
        if (input.includePayload === true) {
          const delegation = this.agentWallets.getDelegation(delegationId);
          return {
            delegation,
            message: "Delegation payload is decrypted from the local agent vault. Private keys are never returned.",
          };
        }
        const metadata = this.agentWallets.listDelegations()
          .find((delegation) => delegation.id === delegationId);
        if (!metadata) throw new Error(`Unknown agent delegation: ${delegationId}`);
        return { delegation: metadata };
      }
      case "agent_delete_delegation":
        if (input.confirm !== true) {
          throw new Error("agent_delete_delegation requires confirm=true");
        }
        return {
          deleted: this.agentWallets.deleteDelegation(
            requiredString(input.delegationId, "agent_delete_delegation requires delegationId"),
          ),
          profiles: this.agentWallets.listExecutionProfiles(),
          message:
            "Deleted the local delegation artifact. This does not revoke the delegation onchain.",
        };
      case "agent_oneshot_get_capabilities":
        return {
          relayer: this.oneShotRelayer.getInfo(),
          capabilities: await this.oneShotRelayer.getCapabilities(
            optionalChainIdArray(input.chainIds) || [8453],
          ),
          message:
            "For 1Shot delegated execution, prepare an agent delegation with delegateAddress equal to the returned targetAddress.",
        };
      case "agent_oneshot_get_fee_data":
        return {
          relayer: this.oneShotRelayer.getInfo(),
          feeData: await this.oneShotRelayer.getFeeData({
            chainId: input.chainId === undefined ? 8453 : input.chainId as string | number,
            token: optionalString(input.token) || "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
          }),
        };
      case "agent_oneshot_relay_calls":
        return this.oneShotRelayer.relayCalls({
          profileId: optionalString(input.profileId),
          walletId: optionalString(input.walletId),
          delegationId: optionalString(input.delegationId),
          chain: input.chain,
          calls: normalizeCalls(input.calls),
          paymentToken: optionalString(input.paymentToken),
          paymentAmountUnits: optionalString(input.paymentAmountUnits),
          includeFeePayment:
            typeof input.includeFeePayment === "boolean" ? input.includeFeePayment : undefined,
          estimateOnly: input.estimateOnly === true,
          submit: typeof input.submit === "boolean" ? input.submit : undefined,
          confirm: input.confirm === true,
          skipEstimate: input.skipEstimate === true,
          context: optionalString(input.context),
          taskId: optionalString(input.taskId),
          destinationUrl: optionalString(input.destinationUrl),
          memo: optionalString(input.memo),
          validateDelegate:
            typeof input.validateDelegate === "boolean" ? input.validateDelegate : undefined,
        }, await this.getConfiguredChains());
      case "agent_oneshot_get_status":
        return {
          relayer: this.oneShotRelayer.getInfo(),
          status: await this.oneShotRelayer.getStatus({
            taskId: requiredString(input.taskId, "agent_oneshot_get_status requires taskId"),
            logs: input.logs === true,
          }),
        };
      case "agent_x402_quote":
        return this.agentX402.quote(this.agentX402Input(input));
      case "agent_x402_pay":
        return this.agentX402.pay(this.agentX402Input(input));
      case "agent_eoa_get_balance":
        return this.agentEoa.getBalance({
          profileId: optionalString(input.profileId),
          walletId: optionalString(input.walletId),
          chain: input.chain,
          token: optionalString(input.token),
        }, await this.getConfiguredChains());
      case "agent_eoa_send_transaction":
        return this.agentEoa.sendTransaction({
          profileId: optionalString(input.profileId),
          walletId: optionalString(input.walletId),
          chain: input.chain,
          to: optionalString(input.to),
          value: optionalString(input.value),
          data: optionalString(input.data),
          gas: optionalString(input.gas),
          maxFeePerGas: optionalString(input.maxFeePerGas),
          maxPriorityFeePerGas: optionalString(input.maxPriorityFeePerGas),
          gasPrice: optionalString(input.gasPrice),
        }, await this.getConfiguredChains());
      case "agent_eoa_send_calls":
        return this.agentEoa.sendCallsSequentially({
          profileId: optionalString(input.profileId),
          walletId: optionalString(input.walletId),
          chain: input.chain,
          calls: normalizeCalls(input.calls),
        }, await this.getConfiguredChains());
      case "send_calls": {
        return this.sendCallBatch({
          chain: input.chain,
          from: optionalString(input.from),
          atomicRequired:
            typeof input.atomicRequired === "boolean"
              ? input.atomicRequired
              : undefined,
          calls: normalizeCalls(input.calls),
          executionProfile: optionalString(input.executionProfile) || optionalString(input.profileId),
          paymentToken: optionalString(input.paymentToken),
          paymentAmountUnits: optionalString(input.paymentAmountUnits),
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
      case "swap": {
        const routedInput = await this.withRoutedActionSender(input);
        return this.runPreparedWalletAction(
          await this.withRpc(() => this.walletchanActions.prepareSwap(routedInput)),
          input,
        );
      }
      case "get_bridge_quote":
        return this.withRpc(() => this.walletchanActions.bridgeQuote(input));
      case "bridge": {
        const routedInput = await this.withRoutedActionSender(input);
        return this.runPreparedWalletAction(
          await this.withRpc(() => this.walletchanActions.prepareBridge(routedInput)),
          input,
        );
      }
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
      case "list_protocols":
        return this.protocols.listProtocols();
      case "list_protocol_tools":
        return this.protocols.listTools(
          requiredString(input.protocol, "list_protocol_tools requires protocol"),
        );
      case "call_protocol_tool":
        return this.callProtocolTool(input);
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
        return this.sendSingleTransaction(input);
      }
      case "load_base_plugin":
        return {
          plugin: input.plugin,
          markdown: await loadBasePlugin(String(input.plugin || "")),
        };
      case "list_skill_resources":
        return { resources: listSkillResources() };
      default:
        if (this.protocols.getWrappedTool(name)) {
          return this.callWrappedProtocolTool(name, input);
        }
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

  private async getConfiguredChains(): Promise<Array<{ name: string; chainId: number }>> {
    await this.rpcManager.ensureStarted();
    return (await this.rpc.health()).chains;
  }

  private listExecutionProfiles(): Record<string, unknown> {
    const profiles = this.agentWallets.listExecutionProfiles();
    const defaultProfile = profiles.find((profile) => profile.default) ?? profiles[0];
    return {
      profiles,
      defaultProfile,
      storage: this.agentWallets.getStorageInfo(),
      message:
        "walletconnect uses WalletChan popup approval. agent profiles use stored ERC-7710 delegation. agent-eoa profiles sign locally from the raw agent wallet.",
    };
  }

  private formatAgentWalletResult(
    wallet: ReturnType<AgentWalletStore["getWallet"]>,
  ): Record<string, unknown> {
    return {
      wallet: this.formatAgentWallet(wallet),
      profiles: this.agentWallets.listExecutionProfiles().filter(
        (profile) => profile.walletId === wallet.id || profile.id === "walletconnect",
      ),
      storage: this.agentWallets.getStorageInfo(),
      message:
        "Agent wallet private key material is encrypted in the local WalletChan MCP data directory and is not returned by tools. MCP auto-creates a local vault-secret file when needed.",
    };
  }

  private formatAgentWallet(
    wallet: ReturnType<AgentWalletStore["getWallet"]>,
  ): Record<string, unknown> {
    return {
      ...wallet,
      profiles: {
        agent: `agent:${wallet.id}`,
        agentEoa: `agent-eoa:${wallet.id}`,
      },
    };
  }

  private async prepareAgentDelegation(input: Record<string, unknown>): Promise<unknown> {
    await this.ensureWalletReady();
    const chain = await this.rpc.resolveChain(input.chain || "base");
    const delegator = optionalString(input.delegator) || await this.rpc.resolveFrom(undefined);
    const explicitDelegateAddress = optionalString(input.delegateAddress);
    const delegateMode = normalizeAgentDelegationDelegateMode(input.delegateMode, explicitDelegateAddress);
    const oneShotTargetAddress = delegateMode === "oneshot-relayer" && !explicitDelegateAddress
      ? await this.oneShotRelayer.getTargetAddress(chain.chainId)
      : undefined;
    const delegateAddress = explicitDelegateAddress || oneShotTargetAddress;
    const prepared = this.agentDelegation.prepare({
      profileId: optionalString(input.profileId),
      walletId: optionalString(input.walletId),
      chain: chain.chainId,
      delegator,
      delegateAddress,
      label: optionalString(input.label),
      scopeType: optionalString(input.scopeType),
      tokenAddress: optionalString(input.tokenAddress),
      tokenDecimals: optionalNumber(input.tokenDecimals),
      amount: optionalString(input.amount),
      amountUnits: optionalString(input.amountUnits),
      maxAmount: optionalString(input.maxAmount),
      maxAmountUnits: optionalString(input.maxAmountUnits),
      periodDurationSeconds: optionalNumber(input.periodDurationSeconds),
      startDate: optionalNumber(input.startDate),
      validForSeconds: optionalNumber(input.validForSeconds),
      allowedTargets: optionalStringArray(input.allowedTargets),
      allowedSelectors: optionalStringArray(input.allowedSelectors),
      valueLimitWei: optionalString(input.valueLimitWei),
    }, await this.getConfiguredChains());
    return {
      ...prepared,
      delegateMode,
      ...(oneShotTargetAddress ? {
        targetAddress: oneShotTargetAddress,
        relayer: this.oneShotRelayer.getInfo(),
      } : {}),
      message: delegateMode === "oneshot-relayer"
        ? "Prepared a 1Shot-compatible agent delegation. Call agent_request_delegation_signature with delegationId to open the WalletChan signature request."
        : prepared.message,
    };
  }

  private async requestAgentDelegationSignature(input: Record<string, unknown>): Promise<unknown> {
    const delegationId = requiredString(
      input.delegationId,
      "agent_request_delegation_signature requires delegationId",
    );
    const delegation = this.agentWallets.getDelegation(delegationId);
    await this.ensureWalletReady();
    const request = this.tracker.start(
      "signature",
      this.withRpc(() => this.rpc.sign({
        type: "eth_signTypedData_v4",
        chain: delegation.chainId,
        address: delegation.delegator,
        data: JSON.stringify(delegation.typedData),
      })),
    );
    this.agentWallets.upsertDelegation({
      ...delegation,
      status: "pending_signature",
      signatureRequestId: request.id,
      updatedAt: new Date().toISOString(),
    });
    return {
      delegation: this.agentWallets.listDelegations()
        .find((entry) => entry.id === delegationId),
      requestId: request.id,
      status: "pending",
      approvalMode: "walletchan_popup",
      message:
        "Approve or reject the agent delegation signature in the WalletChan popup, then call agent_complete_delegation with delegationId.",
    };
  }

  private async completeAgentDelegation(input: Record<string, unknown>): Promise<unknown> {
    const delegationId = requiredString(
      input.delegationId,
      "agent_complete_delegation requires delegationId",
    );
    const delegation = this.agentWallets.getDelegation(delegationId);
    const directSignature = optionalString(input.signature);
    const requestId = optionalString(input.requestId) || delegation.signatureRequestId;
    if (directSignature) {
      const active = await this.agentDelegation.verifySignature(delegationId, directSignature);
      return this.agentDelegationActivatedResult(active, undefined, input);
    }
    if (!requestId) {
      throw new Error("agent_complete_delegation requires requestId or a stored signatureRequestId");
    }
    const tracked = this.tracker.get(requestId);
    if (!tracked || tracked.state === "pending") {
      return {
        delegation: delegationMetadataView(delegation),
        requestId,
        status: "pending_signature",
        message: "The WalletChan signature request is still pending.",
      };
    }
    if (tracked.state === "error") {
      return {
        delegation: delegationMetadataView(delegation),
        requestId,
        status: "failed",
        error: tracked.error,
        errorCode: tracked.errorCode,
        errorData: tracked.errorData,
      };
    }
    const signature = typeof tracked.result === "string" ? tracked.result : "";
    if (!signature) {
      throw new Error(`Agent delegation request ${requestId} did not return a signature`);
    }
    const active = await this.agentDelegation.verifySignature(delegationId, signature);
    return this.agentDelegationActivatedResult(active, requestId, input);
  }

  private async agentDelegationActivatedResult(
    active: AgentDelegationMetadata,
    requestId: string | undefined,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {
      delegation: active,
      ...(requestId ? { requestId } : {}),
      profiles: this.agentWallets.listExecutionProfiles(),
      status: "active",
      message: "Agent delegation signature was verified and stored encrypted in the agent vault.",
    };

    const pendingAction = this.takePendingAgentActionForDelegation(active.id, {
      pendingActionId: optionalString(input.pendingActionId),
      submitPendingAction:
        typeof input.submitPendingAction === "boolean" ? input.submitPendingAction : undefined,
    });
    if (!pendingAction) return result;

    return {
      ...result,
      pendingActionId: pendingAction.id,
      pendingActionCreatedAt: new Date(pendingAction.createdAt).toISOString(),
      submission: await this.sendCallBatch(pendingAction.args),
      message:
        "Agent delegation signature was verified and stored encrypted in the agent vault. The pending delegated action was submitted automatically.",
    };
  }

  private agentX402Input(input: Record<string, unknown>): Parameters<AgentX402Client["pay"]>[0] {
    return {
      profileId: optionalString(input.profileId),
      walletId: optionalString(input.walletId),
      url: requiredString(input.url, "agent x402 tools require url"),
      method: optionalString(input.method),
      headers: input.headers,
      body: input.body,
      chain: input.chain,
      maxPayment: optionalString(input.maxPayment),
      maxPaymentUnits: optionalString(input.maxPaymentUnits),
      tokenDecimals: optionalNumber(input.tokenDecimals),
      timeoutMs: optionalNumber(input.timeoutMs),
      maxResponseBytes: optionalNumber(input.maxResponseBytes),
    };
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

  private async callProtocolTool(input: Record<string, unknown>): Promise<unknown> {
    const result = await this.protocols.callTool(
      requiredString(input.protocol, "call_protocol_tool requires protocol"),
      requiredString(input.tool, "call_protocol_tool requires tool"),
      isRecord(input.arguments) ? input.arguments : {},
      optionalNumber(input.timeoutMs),
    );
    return result.parsed ?? result.raw;
  }

  private async callWrappedProtocolTool(
    publicToolName: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const wrapped = this.protocols.getWrappedTool(publicToolName);
    if (!wrapped) throw new Error(`Unknown protocol wrapper: ${publicToolName}`);
    if (wrapped.protocolId !== "veil") {
      throw new Error(`Unsupported wrapped protocol: ${wrapped.protocolId}`);
    }
    return this.callVeilTool(wrapped.toolName, input);
  }

  private async callVeilTool(
    toolName: string,
    input: Record<string, unknown>,
  ): Promise<unknown> {
    const args = { ...input };
    if (this.protocols.veilNeedsOwner(toolName) && !optionalString(args.owner)) {
      await this.rpcManager.ensureStarted();
      args.owner = await this.rpc.resolveFrom(undefined);
    }
    if (toolName === "veil_prepare_deposit") {
      assertVeilDepositMinimum(args);
    }

    const submitPreparedCalls = input.submitPreparedCalls === true &&
      this.protocols.isVeilPrepareTool(toolName);
    for (const key of [
      "submitPreparedCalls",
      "chain",
      "from",
      "atomicRequired",
      "previewOnly",
      "allowWarnings",
    ]) {
      delete args[key];
    }

    const result = await this.protocols.callTool(
      "veil",
      toolName,
      args,
      veilTimeoutMs(toolName, input),
    );
    const payload = result.parsed ?? result.raw;
    if (!submitPreparedCalls) return payload;

    return {
      protocol: "veil",
      tool: toolName,
      result: payload,
      submission: await this.startPreparedCallsSubmission({
        prepared: payload,
        chain: input.chain,
        from: input.from,
        executionProfile: input.executionProfile ?? input.profileId,
        profileId: input.profileId,
        atomicRequired: input.atomicRequired,
        previewOnly: input.previewOnly,
        allowWarnings: input.allowWarnings,
      }),
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
        kind: tracked.kind,
        ...(tracked.kind === "signature"
          ? { signature: tracked.result }
          : formatTrackedTransactionResult(tracked.result)),
        status: tracked.kind === "signature"
          ? "signed"
          : mapTrackedTransactionStatus(tracked.result),
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

  private resolveExecutionProfile(profileId?: string): ExecutionProfile {
    return this.agentWallets.resolveExecutionProfile(profileId);
  }

  private async withRoutedActionSender(input: Record<string, unknown>): Promise<Record<string, unknown>> {
    const profile = this.resolveExecutionProfile(
      optionalString(input.executionProfile) || optionalString(input.profileId),
    );
    if (profile.kind === "walletconnect") return input;
    const chain = input.chain ?? input.originChain ?? "base";
    const sender = profile.kind === "agent"
      ? this.resolveDelegatedActionSender(profile, chain)
      : profile.address;
    if (!sender) {
      throw new Error(`Execution profile ${profile.id} does not have an address`);
    }
    return {
      ...input,
      from: optionalString(input.from) || sender,
      taker: optionalString(input.taker) || sender,
      userAddress: optionalString(input.userAddress) || sender,
    };
  }

  private resolveDelegatedActionSender(profile: ExecutionProfile, chain: unknown): string {
    if (!profile.walletId) throw new Error(`Execution profile ${profile.id} has no walletId`);
    const chainId = typeof chain === "number"
      ? chain
      : typeof chain === "string" && /^\d+$/.test(chain)
        ? Number(chain)
        : chain === "base" || chain === undefined || chain === null || chain === ""
          ? 8453
          : undefined;
    const delegation = this.agentWallets.getActiveDelegation({
      walletId: profile.walletId,
      chainId,
    });
    if (!delegation) {
      throw new Error(
        `No active delegated agent session found for ${profile.id}${chainId ? ` on chain ${chainId}` : ""}.`,
      );
    }
    return delegation.delegator;
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
          ? "The wallet session is disconnected. Show the pairing URL or pairing URI to the user, wait for a wallet to pair, then retry the wallet action."
          : "The wallet session is disconnected. Call get_pairing_uri to create a fresh pairing URI, wait for a wallet to pair, then retry the wallet action.",
    };
  }

  private async sendPreparedCalls(input: Record<string, unknown>): Promise<unknown> {
    const submission = this.buildPreparedCallSubmission(input);
    if (submission.preview) return submission.preview;
    if (submission.args.calls.length === 0) {
      return emptyPreparedSubmissionResult(submission);
    }
    return this.sendCallBatch(submission.args);
  }

  private async sendSingleTransaction(input: Record<string, unknown>): Promise<unknown> {
    const executionProfile = optionalString(input.executionProfile) || optionalString(input.profileId);
    const profile = this.resolveExecutionProfile(executionProfile);
    if (profile.kind === "agent-eoa") {
      return this.agentEoa.sendTransaction({
        profileId: profile.id,
        chain: input.chain,
        to: optionalString(input.to),
        value: optionalString(input.value),
        data: optionalString(input.data),
      }, await this.getConfiguredChains());
    }
    if (profile.kind === "agent") {
      const to = optionalString(input.to);
      if (!to) throw new Error("send_transaction with agent profile requires to");
      return this.oneShotRelayer.relayCalls({
        profileId: profile.id,
        chain: input.chain,
        calls: [{
          to: to as `0x${string}`,
          value: optionalString(input.value) as `0x${string}` | undefined,
          data: optionalString(input.data) as `0x${string}` | undefined,
        }],
        confirm: true,
      }, await this.getConfiguredChains());
    }
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

  private async startPreparedCallsSubmission(input: Record<string, unknown>): Promise<unknown> {
    const submission = this.buildPreparedCallSubmission(input);
    if (submission.preview) return submission.preview;
    if (submission.args.calls.length === 0) {
      return emptyPreparedSubmissionResult(submission);
    }
    return this.sendCallBatch(submission.args);
  }

  private buildPreparedCallSubmission(input: Record<string, unknown>): {
    prepared: ReturnType<typeof extractPreparedCalls>;
    args: {
      chain: unknown;
      from?: string;
      atomicRequired?: boolean;
      calls: WalletCall[];
      executionProfile?: string;
      paymentToken?: string;
      paymentAmountUnits?: string;
      metadata?: Record<string, unknown>;
    };
    preview?: Record<string, unknown>;
  } {
    const prepared = extractPreparedCalls(input.prepared, input.chain);
    if (input.previewOnly === true) {
      return {
        prepared,
        args: preparedCallBatchArgs(input, prepared),
        preview: {
          ...prepared,
          status: "preview",
        },
      };
    }
    const blockingWarning = getBlockingPreparedWarning(input.prepared);
    if (blockingWarning && input.allowWarnings !== true) {
      throw new Error(
        `Prepared response contains an error-level warning; refusing to submit. Preview the calls or pass allowWarnings=true only if the user explicitly wants to continue. Warning: ${blockingWarning}`,
      );
    }
    return {
      prepared,
      args: preparedCallBatchArgs(input, prepared),
    };
  }

  private async runBasePluginCli(input: Record<string, unknown>): Promise<unknown> {
    const plugin = requiredString(input.plugin, "run_base_plugin_cli requires plugin");
    const command = requiredString(input.command, "run_base_plugin_cli requires command");
    const routed = await this.withRoutedBasePluginCliArgs({
      plugin,
      command,
      args: input.args,
      chain: input.chain,
      from: optionalString(input.from),
      executionProfile: optionalString(input.executionProfile) || optionalString(input.profileId),
    });
    const result = await this.basePluginCli.run({
      plugin,
      command,
      args: routed.args,
      timeoutMs: optionalNumber(input.timeoutMs),
    });
    const resultWithRouting = routed.routing
      ? { ...result, walletRouting: routed.routing }
      : result;

    if (input.submitPreparedCalls !== true) return resultWithRouting;

    const submission = await this.sendPreparedCalls({
      prepared: result.parsed ?? result.stdout,
      chain: input.chain,
      from: optionalString(input.from) || routed.from,
      executionProfile: input.executionProfile ?? input.profileId,
      profileId: input.profileId,
      atomicRequired: input.atomicRequired,
      previewOnly: input.previewOnly,
      allowWarnings: input.allowWarnings,
    });
    return {
      ...resultWithRouting,
      submission,
    };
  }

  private async withRoutedBasePluginCliArgs(input: {
    plugin: string;
    command: string;
    args: unknown;
    chain: unknown;
    from?: string;
    executionProfile?: string;
  }): Promise<{
    args: unknown;
    from?: string;
    routing?: Record<string, unknown>;
  }> {
    const commandInfo = this.basePluginCli.getCommandInfo(input.plugin, input.command);
    const senderOptions = commandInfo.options.filter((option) =>
      BASE_PLUGIN_SENDER_ARG_NAMES.has(option.name)
    );
    if (commandInfo.category !== "write" || senderOptions.length === 0) {
      return { args: input.args };
    }

    const profile = this.resolveExecutionProfile(input.executionProfile);
    const args = isRecord(input.args) ? { ...input.args } : {};
    if (
      profile.kind === "walletconnect" &&
      !input.from &&
      senderOptions.every((option) => getCliArgEntry(args, option.name))
    ) {
      return { args };
    }
    const chain = input.chain ?? getCliArgValue(args, "chain") ?? "base";
    const sender = await this.resolveEffectiveActionSender(profile, chain, input.from);
    const rewrites: Array<Record<string, unknown>> = [];

    for (const option of senderOptions) {
      const existing = getCliArgEntry(args, option.name);
      if (!existing) {
        setCliArgValue(args, option.name, sender);
        rewrites.push({
          option: option.name,
          action: "defaulted",
          to: sender,
        });
        continue;
      }

      if (typeof existing.value !== "string") {
        throw new Error(`${option.name} must be an EVM address string`);
      }

      const current = existing.value;
      if (sameAddress(current, sender)) continue;

      if (profile.kind === "agent" && profile.address && sameAddress(current, profile.address)) {
        setCliArgValue(args, option.name, sender, existing.key);
        rewrites.push({
          option: option.name,
          action: "rewrote_agent_eoa_to_delegator",
          from: current,
          to: sender,
        });
        continue;
      }

      if (profile.kind === "walletconnect" && !input.from) {
        continue;
      }

      throw new Error(
        `${input.plugin} ${input.command} with execution profile ${profile.id} must prepare for ` +
          `effective sender ${sender}; ${option.name} was ${current}. ` +
          "Use walletconnect for a different main wallet, or agent-eoa when you explicitly want the raw agent EOA.",
      );
    }

    if (profile.kind === "walletconnect" && rewrites.length === 0) {
      return { args, from: sender };
    }

    return {
      args,
      from: sender,
      routing: {
        profile,
        effectiveSender: sender,
        fundingSource:
          profile.kind === "agent"
            ? "delegated_main_wallet"
            : profile.kind === "agent-eoa"
              ? "raw_agent_eoa"
              : "walletconnect",
        rewrittenArgs: rewrites,
        message:
          profile.kind === "agent"
            ? "Prepared the Base plugin action with the main delegator address because delegated 1Shot execution spends from that account, not from the local agent EOA."
            : undefined,
      },
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
      executionProfile: optionalString(input.executionProfile) || optionalString(input.profileId),
      paymentToken: optionalString(input.paymentToken),
      paymentAmountUnits: optionalString(input.paymentAmountUnits),
      metadata: {
        action: action.kind,
        actionMetadata: action.metadata,
        preparedWarnings: action.warnings,
      },
    });
  }

  private async sendCallBatch(args: SendCallBatchArgs): Promise<unknown> {
    const profile = this.resolveExecutionProfile(args.executionProfile);
    if (profile.kind === "agent-eoa") {
      const result = await this.agentEoa.sendCallsSequentially({
        profileId: profile.id,
        chain: args.chain,
        calls: args.calls,
      }, await this.getConfiguredChains());
      return {
        ...result,
        ...args.metadata,
        executionProfile: profile,
      };
    }
    if (profile.kind === "agent") {
      const chains = await this.getConfiguredChains();
      const preflight = await this.oneShotRelayer.preflightDelegationForCalls({
        profileId: profile.id,
        chain: args.chain,
        calls: args.calls,
        paymentToken: args.paymentToken,
      }, chains);
      if (preflight.status === "needs_function_call_delegation") {
        return this.prepareAndRequestAgentActionDelegation(preflight, args, chains);
      }
      if (preflight.status !== "ready") {
        return {
          ...preflight,
          ...args.metadata,
          executionProfile: profile,
        };
      }
      const result = await this.oneShotRelayer.relayCalls({
        profileId: profile.id,
        chain: args.chain,
        calls: args.calls,
        paymentToken: args.paymentToken,
        paymentAmountUnits: args.paymentAmountUnits,
        confirm: true,
      }, chains);
      return {
        ...result,
        ...args.metadata,
        executionProfile: profile,
      };
    }
    const result = await this.withRpc(() => this.sendCallsWithAtomicFallback(args));
    const resultRecord = asRecord(result);
    const requestId = extractBundleId(result);
    const status = mapSubmissionStatus(resultRecord);
    return {
      ...resultRecord,
      ...args.metadata,
      requestId,
      status,
      approvalMode: "walletchan_popup",
      message: submissionMessage(resultRecord, status),
    };
  }

  private async prepareAndRequestAgentActionDelegation(
    preflight: Record<string, unknown>,
    args: SendCallBatchArgs,
    chains: Array<{ name: string; chainId: number }>,
  ): Promise<Record<string, unknown>> {
    const prepareArgs = asRecord(preflight.prepareDelegationArgs);
    await this.ensureWalletReady();
    const delegator = optionalString(args.from) || await this.rpc.resolveFrom(undefined);
    const prepared = this.agentDelegation.prepare({
      profileId: optionalString(prepareArgs.profileId) || args.executionProfile,
      walletId: optionalString(prepareArgs.walletId),
      chain: prepareArgs.chain ?? args.chain,
      delegator,
      delegateAddress: optionalString(prepareArgs.delegateAddress) || optionalString(preflight.targetAddress),
      label: optionalString(prepareArgs.label),
      scopeType: optionalString(prepareArgs.scopeType),
      allowedTargets: optionalStringArray(prepareArgs.allowedTargets),
      allowedSelectors: optionalStringArray(prepareArgs.allowedSelectors),
      valueLimitWei: optionalString(prepareArgs.valueLimitWei),
      validForSeconds: optionalNumber(prepareArgs.validForSeconds),
    }, chains);
    const delegationId = prepared.delegation.id;
    const request = this.tracker.start(
      "signature",
      this.withRpc(() => this.rpc.sign({
        type: "eth_signTypedData_v4",
        chain: prepared.delegation.chainId,
        address: prepared.delegation.delegator,
        data: JSON.stringify(prepared.typedData),
      })),
    );
    this.agentWallets.upsertDelegation({
      ...this.agentWallets.getDelegation(delegationId),
      status: "pending_signature",
      signatureRequestId: request.id,
      updatedAt: new Date().toISOString(),
    });

    const pendingActionId = `agent-action-${randomUUID()}`;
    this.pendingAgentActions.set(pendingActionId, {
      id: pendingActionId,
      delegationId,
      args: {
        ...args,
        from: delegator,
      },
      createdAt: Date.now(),
    });

    return {
      status: "needs_delegation_signature",
      approvalMode: "walletchan_popup",
      requestId: request.id,
      pendingActionId,
      delegation: this.agentWallets.listDelegations()
        .find((entry) => entry.id === delegationId),
      typedData: prepared.typedData,
      rawDelegation: prepared.rawDelegation,
      profile: prepared.profile,
      relayer: preflight.relayer,
      targetAddress: preflight.targetAddress,
      requiredScope: preflight.requiredScope,
      ...args.metadata,
      recommendedNextTool: "agent_complete_delegation",
      recommendedNextArgs: {
        delegationId,
        requestId: request.id,
        pendingActionId,
        submitPendingAction: true,
      },
      message:
        "A reusable 1Shot function-call delegation is required for these DeFi calls. " +
        "Approve the WalletChan signature request, then call agent_complete_delegation with recommendedNextArgs to submit the original action automatically.",
    };
  }

  private takePendingAgentActionForDelegation(
    delegationId: string,
    options: {
      pendingActionId?: string;
      submitPendingAction?: boolean;
    },
  ): PendingAgentAction | null {
    this.prunePendingAgentActions();
    if (options.submitPendingAction === false) return null;
    const pendingAction = options.pendingActionId
      ? this.pendingAgentActions.get(options.pendingActionId)
      : Array.from(this.pendingAgentActions.values())
          .find((action) => action.delegationId === delegationId);
    if (!pendingAction || pendingAction.delegationId !== delegationId) return null;
    this.pendingAgentActions.delete(pendingAction.id);
    return pendingAction;
  }

  private prunePendingAgentActions(): void {
    const now = Date.now();
    for (const [id, action] of this.pendingAgentActions) {
      if (now - action.createdAt > PENDING_AGENT_ACTION_TTL_MS) {
        this.pendingAgentActions.delete(id);
      }
    }
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

  private async resolveEffectiveActionSender(
    profile: ExecutionProfile,
    chain: unknown,
    from?: string,
  ): Promise<string> {
    if (profile.kind === "agent") {
      return this.resolveDelegatedActionSender(profile, chain);
    }
    if (profile.kind === "agent-eoa") {
      if (!profile.address) {
        throw new Error(`Execution profile ${profile.id} does not have an address`);
      }
      return profile.address;
    }
    return from || this.withRpc(() => this.rpc.resolveFrom(undefined));
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

function executionProfileInputDescription(): Record<string, unknown> {
  return {
    description:
      "Execution profile override. Use walletconnect for main WalletChan popup approval, agent:<walletId> for delegated 1Shot execution, or agent-eoa:<walletId> for raw local agent EOA execution. Defaults to the stored profile.",
    type: "string",
  };
}

function executionProfileAliasDescription(): Record<string, unknown> {
  return {
    description: "Alias for executionProfile.",
    type: "string",
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
            executionProfile: executionProfileInputDescription(),
            profileId: executionProfileAliasDescription(),
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

function x402InputSchema(includePaymentFields: boolean): Record<string, unknown> {
  return objectSchema(
    {
      profileId: {
        description: "Agent wallet profile ID. Defaults to agent:<walletId> delegated x402. Use agent-eoa:<walletId> only when the user explicitly wants raw local agent-wallet payment.",
        type: "string",
      },
      walletId: {
        description: "Agent wallet ID. Alternative to profileId; resolves to the delegated agent:<walletId> profile.",
        type: "string",
      },
      url: {
        description: "HTTPS x402-protected resource URL.",
        type: "string",
      },
      method: {
        description: "HTTP method. Defaults to GET; body implies POST.",
        enum: ["GET", "POST"],
      },
      headers: {
        description: "Optional string headers. Authorization, Cookie, Host, and payment headers are blocked.",
        type: "object",
        additionalProperties: { type: "string" },
      },
      body: {
        description: "Optional string or JSON body. Only allowed with POST.",
      },
      chain: {
        description: "EVM network for x402 payment. Defaults to Base.",
        type: ["string", "number"],
      },
      tokenDecimals: {
        description: "Decimals for maxPayment. Defaults to 6 for USDC.",
        type: "number",
      },
      timeoutMs: {
        description: "Request timeout in milliseconds. Defaults to 30000.",
        type: "number",
      },
      maxResponseBytes: {
        description: "Maximum response body bytes returned by MCP. Defaults to 1000000.",
        type: "number",
      },
      ...(includePaymentFields
        ? {
            maxPayment: {
              description: "Maximum payment in decimal token units, e.g. 0.10 USDC. Required unless maxPaymentUnits is provided.",
              type: "string",
            },
            maxPaymentUnits: {
              description: "Maximum payment in raw token units. Required unless maxPayment is provided.",
              type: "string",
            },
          }
        : {}),
    },
    ["url"],
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

function preparedCallBatchArgs(
  input: Record<string, unknown>,
  prepared: ReturnType<typeof extractPreparedCalls>,
): {
  chain: unknown;
  from?: string;
  atomicRequired?: boolean;
  calls: WalletCall[];
  executionProfile?: string;
  paymentToken?: string;
  paymentAmountUnits?: string;
  metadata: Record<string, unknown>;
} {
  return {
    chain: prepared.chain,
    from: optionalString(input.from),
    atomicRequired:
      typeof input.atomicRequired === "boolean" ? input.atomicRequired : undefined,
    calls: prepared.calls,
    executionProfile: optionalString(input.executionProfile) || optionalString(input.profileId),
    paymentToken: optionalString(input.paymentToken),
    paymentAmountUnits: optionalString(input.paymentAmountUnits),
    metadata: {
      preparedSourcePaths: prepared.sourcePaths,
      preparedWarnings: prepared.warnings,
    },
  };
}

function emptyPreparedSubmissionResult(
  submission: {
    prepared: ReturnType<typeof extractPreparedCalls>;
    args: { metadata?: Record<string, unknown> };
  },
): Record<string, unknown> {
  return {
    chain: submission.prepared.chain,
    calls: [],
    ...submission.args.metadata,
    status: "no_calls",
    approvalMode: "none",
    message: "Prepared response did not contain any calls to submit.",
  };
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
    toolName === "run_base_plugin_cli" ||
    toolName === "veil_prepare_register" ||
    toolName === "veil_prepare_deposit";
}

function parseWalletTransportInput(value: unknown): "walletconnect" | "metamask-connect" | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") {
    throw new Error("walletTransport must be walletconnect or metamask-connect");
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "walletconnect" || normalized === "wc") return "walletconnect";
  if (
    normalized === "metamask-connect" ||
    normalized === "metamask" ||
    normalized === "mm"
  ) {
    return "metamask-connect";
  }
  throw new Error("walletTransport must be walletconnect or metamask-connect");
}

function parseOptionalAddressInput(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value === "string" && /^0x[a-fA-F0-9]{40}$/.test(value)) {
    return value.toLowerCase();
  }
  throw new Error(`${label} must be an EVM address`);
}

function veilTimeoutMs(toolName: string, input: Record<string, unknown>): number | undefined {
  if (toolName !== "veil_wait_for_deposit") {
    return optionalNumber(input.timeoutMs);
  }
  const timeoutSeconds = typeof input.timeoutSeconds === "number" && Number.isFinite(input.timeoutSeconds)
    ? Math.max(1, Math.min(1800, input.timeoutSeconds))
    : 900;
  return (timeoutSeconds + 30) * 1000;
}

const VEIL_DEPOSIT_MINIMUMS = {
  ETH: {
    decimals: 18,
    minUnits: 10_000_000_000_000_000n,
    minLabel: "0.01 ETH",
  },
  USDC: {
    decimals: 6,
    minUnits: 20_000_000n,
    minLabel: "20 USDC",
  },
} as const;

function assertVeilDepositMinimum(input: Record<string, unknown>): void {
  const rawAsset = requiredString(input.asset, "veil_prepare_deposit requires asset").toUpperCase();
  if (rawAsset !== "ETH" && rawAsset !== "USDC") {
    throw new Error("veil_prepare_deposit asset must be ETH or USDC");
  }
  const amount = requiredString(input.amount, "veil_prepare_deposit requires amount");
  const minimum = VEIL_DEPOSIT_MINIMUMS[rawAsset];
  const amountUnits = parseDecimalUnits(amount, minimum.decimals);
  if (amountUnits >= minimum.minUnits) return;

  const minimumGrossUnits = minimum.minUnits + (minimum.minUnits * 30n) / 10_000n;
  throw new Error(
    `Minimum Veil ${rawAsset} deposit is ${minimum.minLabel} net before the 0.3% fee. ` +
      `Requested ${amount} ${rawAsset}; Veil would revert with MinimumDepositNotMet. ` +
      `Use at least ${minimum.minLabel} net. The wallet needs about ${formatDecimalUnits(minimumGrossUnits, minimum.decimals)} ${rawAsset} including fee.`,
  );
}

function parseDecimalUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  const match = /^(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) {
    throw new Error(`Invalid decimal amount: ${value}`);
  }
  const whole = match[1];
  const fraction = match[2] ?? "";
  if (fraction.length > decimals) {
    throw new Error(`Amount ${value} has too many decimal places; max is ${decimals}`);
  }
  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

function formatDecimalUnits(value: bigint, decimals: number): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const padded = absolute.toString().padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
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

function mapSubmissionStatus(value: Record<string, unknown>): string {
  const status = mapBundleStatus(value);
  return status === "unknown" ? "pending" : status;
}

function mapTrackedTransactionStatus(value: unknown): string {
  if (typeof value === "string" && value) return "confirmed";
  return mapSubmissionStatus(asRecord(value));
}

function formatTrackedTransactionResult(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    return { txHash: value };
  }
  const record = asRecord(value);
  return {
    ...record,
    transactionResult: value,
  };
}

function submissionMessage(value: Record<string, unknown>, status: string): string {
  if (value.mode === "sequential_fallback") {
    if (status === "confirmed") {
      return "Wallet did not support ERC-5792 batching, so WalletChan submitted each transaction sequentially and confirmed each receipt.";
    }
    if (status === "failed") {
      return "Wallet did not support ERC-5792 batching, so WalletChan used sequential transactions, but the sequence failed. Inspect the bundle for the failed call.";
    }
    return "Wallet does not support ERC-5792 batching. Approve each transaction in order in the WalletChan popup.";
  }
  return "Approve or reject this batch in the WalletChan popup.";
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

function getCliArgEntry(
  args: Record<string, unknown>,
  name: string,
): { key: string; value: unknown } | null {
  for (const key of cliArgKeys(name)) {
    if (key in args) return { key, value: args[key] };
  }
  return null;
}

function getCliArgValue(args: Record<string, unknown>, name: string): unknown {
  return getCliArgEntry(args, name)?.value;
}

function setCliArgValue(
  args: Record<string, unknown>,
  name: string,
  value: string,
  existingKey?: string,
): void {
  args[existingKey || name] = value;
}

function cliArgKeys(name: string): string[] {
  const camel = name.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  const snake = name.replace(/-/g, "_");
  return [name, camel, snake];
}

function sameAddress(a: string, b: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(a) &&
    /^0x[a-fA-F0-9]{40}$/.test(b) &&
    a.toLowerCase() === b.toLowerCase();
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error("Expected an array of strings");
  return value.map((entry) => {
    if (typeof entry !== "string" || entry.length === 0) {
      throw new Error("Expected an array of non-empty strings");
    }
    return entry;
  });
}

function requiredStringArray(value: unknown, message: string): string[] {
  const parsed = optionalStringArray(value);
  if (!parsed || parsed.length === 0) throw new Error(message);
  return parsed;
}

function optionalChainIdArray(value: unknown): Array<string | number> | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error("Expected an array of chain IDs");
  return value.map((entry) => {
    if (typeof entry === "string" || typeof entry === "number") return entry;
    throw new Error("Expected chain IDs to be strings or numbers");
  });
}

function requiredString(value: unknown, message: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(message);
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function optionalDelegationStatus(value: unknown): "pending_signature" | "active" | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  if (value === "pending_signature" || value === "active") return value;
  throw new Error(`Invalid delegation status: ${String(value)}`);
}

function normalizeAgentDelegationDelegateMode(
  value: unknown,
  explicitDelegateAddress?: string,
): AgentDelegationDelegateMode {
  if (value === undefined || value === null || value === "") {
    return explicitDelegateAddress ? "custom" : "oneshot-relayer";
  }
  if (value === "oneshot-relayer" || value === "agent-wallet") return value;
  if (value === "custom") {
    if (!explicitDelegateAddress) {
      throw new Error("delegateMode=custom requires delegateAddress");
    }
    return value;
  }
  throw new Error(`Invalid delegateMode: ${String(value)}`);
}

function delegationMetadataView(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const {
    delegation: _delegation,
    typedData: _typedData,
    signature: _signature,
    ...metadata
  } = value;
  return metadata;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
