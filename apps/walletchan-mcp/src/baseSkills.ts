import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export interface SkillResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

const BASE_RAW_ROOT =
  "https://raw.githubusercontent.com/base/skills/refs/heads/master/skills/base-mcp";

const PLUGINS = [
  ["morpho", "Morpho lending and vaults"],
  ["moonwell", "Moonwell lending"],
  ["uniswap", "Uniswap swaps and LP positions"],
  ["avantis", "Avantis perpetual futures"],
  ["aerodrome", "Aerodrome swaps and LP"],
  ["virtuals", "Virtuals SIWE auth and agent ops"],
  ["bankr", "Bankr token launch discovery"],
] as const;

const REFERENCES = [
  ["batch-calls", "Batched contract calls"],
  ["approval-mode", "Approval flow"],
  ["custom-plugins", "Custom plugin patterns"],
] as const;

const LOCAL_SKILL_RESOURCES = [
  {
    uri: "walletchan://veil-mcp/SKILL.md",
    name: "WalletChan Veil MCP Skill",
    description: "WalletChan-adapted Veil Cash MCP usage",
    mimeType: "text/markdown",
    path: "veil/SKILL.md",
  },
  {
    uri: "walletchan://veil-mcp/plugins/veil.md",
    name: "Veil plugin for WalletChan MCP",
    description: "Veil Cash register, deposit, balance, and private relay guidance for WalletChan MCP",
    mimeType: "text/markdown",
    path: "veil/plugins/veil.md",
  },
] as const;

export function listSkillResources(): SkillResource[] {
  return [
    {
      uri: "walletchan://skill/SKILL.md",
      name: "WalletChan MCP Skill",
      description: "WalletChan MCP usage and Base plugin compatibility rules",
      mimeType: "text/markdown",
    },
    ...PLUGINS.map(([slug, description]) => ({
      uri: `walletchan://base-mcp/plugins/${slug}.md`,
      name: `Base plugin: ${slug}`,
      description,
      mimeType: "text/markdown",
    })),
    ...REFERENCES.map(([slug, description]) => ({
      uri: `walletchan://base-mcp/references/${slug}.md`,
      name: `Base reference: ${slug}`,
      description,
      mimeType: "text/markdown",
    })),
    ...LOCAL_SKILL_RESOURCES.map(({ path: _path, ...resource }) => resource),
  ];
}

export async function readSkillResource(uri: string): Promise<string> {
  if (uri === "walletchan://skill/SKILL.md") {
    return WALLETCHAN_SKILL;
  }

  const local = LOCAL_SKILL_RESOURCES.find((resource) => resource.uri === uri);
  if (local) {
    return readLocalSkill(local.path);
  }

  const pluginMatch = uri.match(/^walletchan:\/\/base-mcp\/plugins\/([a-z0-9-]+)\.md$/);
  if (pluginMatch) {
    const slug = pluginMatch[1];
    ensureSafeSlug(slug);
    const raw = await fetchMarkdown(`${BASE_RAW_ROOT}/plugins/${slug}.md`);
    return `${WALLETCHAN_PLUGIN_OVERRIDE}\n\n${raw}`;
  }

  const referenceMatch = uri.match(/^walletchan:\/\/base-mcp\/references\/([a-z0-9-]+)\.md$/);
  if (referenceMatch) {
    const slug = referenceMatch[1];
    ensureKnown(slug, REFERENCES.map(([name]) => name));
    const raw = await fetchMarkdown(`${BASE_RAW_ROOT}/references/${slug}.md`);
    return `${WALLETCHAN_REFERENCE_OVERRIDE}\n\n${raw}`;
  }

  throw new Error(`Unknown resource URI: ${uri}`);
}

async function readLocalSkill(relativePath: string): Promise<string> {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFile(resolve(here, "..", "skills", relativePath), "utf8");
}

export async function loadBasePlugin(slug: string): Promise<string> {
  const normalized = slug.trim().toLowerCase();
  ensureSafeSlug(normalized);
  return readSkillResource(`walletchan://base-mcp/plugins/${normalized}.md`);
}

async function fetchMarkdown(url: string): Promise<string> {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch upstream Base skill file: ${response.status}`);
  }
  return response.text();
}

function ensureKnown(value: string, known: readonly string[]): void {
  if (!known.includes(value)) {
    throw new Error(`Unknown Base skill resource: ${value}`);
  }
}

function ensureSafeSlug(value: string): void {
  if (!/^[a-z0-9-]+$/.test(value)) {
    throw new Error(`Invalid Base skill slug: ${value}`);
  }
}

const WALLETCHAN_PLUGIN_OVERRIDE = `# WalletChan MCP Execution Override

This file is an upstream Base MCP plugin reference with WalletChan-specific execution rules prepended.

When this plugin says to use Base MCP:

- before wallet access, use WalletChan MCP \`get_pairing_uri\` if WalletChan is not paired
- \`get_wallets\` -> use WalletChan MCP \`get_wallets\`
- \`send_calls\` -> use WalletChan MCP \`send_calls\`
- prepared transaction responses -> prefer WalletChan MCP \`send_prepared_calls\` instead of manually mapping \`transactions[]\`, \`calls[]\`, approval+action, or \`{ data: { to, value, data } }\` shapes
- Base MCP \`swap\` or user swap requests -> use WalletChan MCP \`swap\`; use \`get_swap_price\` first only when the user asks for a quote/preview
- portfolio/balance requests -> use WalletChan MCP \`get_portfolio_balances\`
- bridge requests -> use WalletChan MCP \`get_bridge_quote\`, \`bridge\`, and \`get_bridge_status\`
- \`get_request_status\` -> use WalletChan MCP \`get_request_status\`
- \`sign\` -> use WalletChan MCP \`sign\`; for SIWE/EIP-4361 auth challenges, prefer WalletChan MCP \`sign_siwe\`
- \`web_request\` or external API instructions -> use WalletChan MCP \`web_request\` first when the target host is allowlisted. If the host is not allowlisted, use the harness' own web/fetch tooling or a protocol MCP.
- CLI-capable plugin paths such as \`npx @morpho-org/cli@latest ...\` -> use WalletChan MCP \`run_base_plugin_cli\` first when \`list_base_plugin_runners\` shows a supported runner. This avoids Claude shell egress allowlist failures while keeping CLI execution pinned and structured.
- remote MCP plugin paths such as Virtuals MCP -> use WalletChan MCP \`list_remote_mcp_tools\`, \`call_remote_mcp_tool\`, and the remote SIWE login helpers when the protocol profile is allowlisted. If no profile exists, use the harness' configured MCP connector.

When using a delegated \`agent:<walletId>\` execution profile for DeFi prepare flows, the protocol user is the delegation's main-wallet delegator, not the local agent EOA address. Supported \`run_base_plugin_cli\` write commands automatically bind owner arguments such as Morpho \`user-address\` and Aerodrome \`wallet\` to that delegator before simulation/preparation. Do not set those arguments to the agent EOA unless the user explicitly chose \`agent-eoa\`. Direct token-transfer limits are not enough for protocol calls; if delegated submission returns \`status: "needs_delegation_signature"\`, have the user approve the WalletChan signature request, then call \`agent_complete_delegation\` with \`recommendedNextArgs\` so MCP activates the reusable 1Shot function-call delegation and submits the pending action. Delegated 1Shot submission adds a tiny buffer to the estimated relayer fee; if it still returns \`status: "estimate_failed"\`, stop and report the estimate error, do not retry blindly or switch to \`agent-eoa\`.

WalletChan MCP does not return a Base Account approval URL. It sends the request to the local WalletChan RPC server, which forwards it through the selected wallet transport, either WalletConnect or MetaMask Connect. If no wallet is paired, call \`get_pairing_uri\` and show the returned \`pairingUrl\` browser QR page when present, or the raw pairing URI otherwise. Tell the user to approve or reject transaction and signature requests in their wallet. If a \`requestId\` is returned, poll it with \`get_request_status\` after the user acts. If the paired wallet does not support ERC-5792 batching, WalletChan RPC sends each call as an individual transaction and waits for each receipt before the next prompt.

If any WalletChan wallet tool returns \`status: "needs_pairing"\` or \`errorCode: "walletconnect_disconnected"\`, the selected wallet transport session was closed or lost. Do not keep retrying the same wallet action. Show the returned \`pairingUrl\` or \`pairingUri\` if present, otherwise call \`get_pairing_uri\`; after the user pairs a wallet again, retry the action. If \`reprepareRequired\` is true, prepare fresh calldata before resubmitting because transaction calldata or simulation output can go stale.

Fast-path orchestration:

1. For supported CLI plugins, call \`run_base_plugin_cli\` with structured args. Current default runners cover Morpho and Aerodrome. For prepare commands, set \`submitPreparedCalls: true\` after the user has selected the action/vault/market.
2. For Base MCP \`swap\`-style flows, call WalletChan MCP \`swap\`. It uses WalletChan's first-party swap API, adds ERC-20/Permit2 approvals only when needed, and sends the final call set to WalletChan.
3. For HTTP tx-builder plugins, call WalletChan MCP \`web_request\` when the host is allowlisted, then pass the full prepare response body to \`send_prepared_calls\`. Current default hosts cover Moonwell, Uniswap, Avantis, Bankr discovery, Morpho API hosts, and \`walletchan-rpc\` default upstream RPC hosts.
4. For allowlisted remote MCP plugins, call \`list_remote_mcp_tools\` / \`call_remote_mcp_tool\`. For Virtuals login, call \`start_remote_mcp_siwe_login\`, wait for WalletChan approval, then call \`complete_remote_mcp_siwe_login\`. This preserves the exact SIWE challenge; do not manually reconstruct or summarize it.
5. For managed protocol integrations such as Veil MCP, use first-class tools such as \`veil_status\`, \`veil_prepare_register\`, and \`veil_prepare_deposit\`. For Veil public register/deposit, pass \`submitPreparedCalls: true\` only after the user wants WalletChan to submit the prepared calldata.
6. Use \`send_calls\` directly only when you already have a clean \`calls\` array.

Future Base plugin HTTP hosts can be enabled by MCP configuration. Future CLI-only plugins need a pinned runner profile or a separate protocol MCP; do not run arbitrary shell commands from plugin markdown. Future remote MCP plugins need an allowlisted profile before WalletChan MCP will proxy them.

Do not submit prepared calls when the prepare response has error-level warnings, failed simulation, or insufficient-balance messages. WalletChan MCP blocks these submissions by default; only pass \`allowWarnings: true\` after the user explicitly asks to continue despite the warning.

For x402 resources, use WalletChan MCP \`agent_x402_quote\` and \`agent_x402_pay\` when the endpoint supports ERC-7710 delegated x402 payment. The default \`agent\` path consumes an active delegation to the agent wallet address; use \`agent-eoa:<walletId>\` only after the user explicitly asks for raw agent-wallet payment. Use Veil x402 tools only when the user explicitly wants the private Veil path. Skip only upstream tools that still have no WalletChan MCP equivalent.

---`;

const WALLETCHAN_REFERENCE_OVERRIDE = `# WalletChan MCP Reference Override

This upstream Base MCP reference is adapted for WalletChan MCP. Replace Base Account approval URLs with WalletChan popup approval, and replace Base MCP tool calls with the same-named WalletChan MCP tools when available.

---`;

const WALLETCHAN_SKILL = `---
name: walletchan-mcp
description: Use WalletChan MCP for WalletChan-approved transactions, signatures, and Base MCP-style DeFi plugin flows.
---

# WalletChan MCP

WalletChan MCP is a local MCP adapter backed by WalletChan RPC.

## Required Runtime

WalletChan MCP starts and manages a local WalletChan RPC bridge by default. Before using wallet tools, call \`get_pairing_uri\` and show the returned \`pairingUrl\` browser QR page when present, or the raw WalletConnect/MetaMask Connect pairing URI otherwise.

The user pairs a wallet by scanning the browser QR or pasting the URI in the selected wallet app. The default transport is WalletConnect; \`get_pairing_uri({ walletTransport: "metamask-connect", forceNewSession: true })\` switches the managed RPC to MetaMask Connect without restarting MCP.

Use \`resolve_name\` before passing a user-provided name as an address. It resolves ENS/subdomains, Basenames under \`.base.eth\`, WNS \`.wei\`, GNS \`.gwei\`, and MegaNames \`.mega\` to EVM addresses using MCP RPC overrides first and WalletChan defaults second. Use \`resolve_names\` for batches. Wallet tools still expect raw addresses.

The MCP server talks to \`http://127.0.0.1:4209\` by default.

If a wallet action returns \`status: "needs_pairing"\` or \`errorCode: "walletconnect_disconnected"\`, the selected wallet transport session was closed or lost. Show the returned \`pairingUrl\` or \`pairingUri\` when present, otherwise call \`get_pairing_uri\`. After the user pairs again, retry the action; if \`reprepareRequired\` is true, refresh calldata first.

## Tools

- \`get_pairing_uri\`: starts or inspects the managed WalletChan RPC bridge and returns the browser QR page URL plus a WalletConnect or MetaMask Connect URI when pairing is needed. It can also switch transports with \`walletTransport\`.
- \`get_wallets\`: returns approved WalletChan RPC accounts.
- \`resolve_name\`: resolves a user-provided WalletChan-supported name to an EVM address.
- \`resolve_names\`: resolves multiple WalletChan-supported names to EVM addresses.
- \`send_calls\`: sends wallet calls to WalletChan. ERC-5792 wallets receive one batch; non-batching wallets receive sequential \`eth_sendTransaction\` prompts.
- \`send_prepared_calls\`: normalizes common Base plugin prepare responses and sends the resulting calls to WalletChan.
- \`get_portfolio_balances\`: fetches first-party WalletChan portfolio balances for an address or connected account.
- \`get_swap_price\`: fetches an indicative first-party WalletChan swap price.
- \`swap\`: quotes a swap, adds needed ERC-20/Permit2 approvals, and sends the calls to WalletChan.
- \`get_bridge_quote\`: fetches a first-party WalletChan bridge quote.
- \`bridge\`: quotes a bridge, adds needed ERC-20 approvals, and sends the calls to WalletChan.
- \`get_bridge_status\`: checks bridge status by request hash or source transaction hash.
- \`web_request\`: calls allowlisted HTTPS protocol APIs from the local WalletChan MCP process.
- \`run_base_plugin_cli\`: runs pinned, allowlisted protocol CLI commands from the local WalletChan MCP process.
- \`list_base_plugin_runners\`: lists supported protocol CLI commands and structured args.
- \`list_remote_mcp_tools\`: lists tools exposed by an allowlisted protocol MCP profile.
- \`call_remote_mcp_tool\`: calls non-login tools on an allowlisted protocol MCP profile.
- \`start_remote_mcp_siwe_login\`: starts an allowlisted protocol MCP SIWE login and opens a WalletChan signature request for the exact challenge.
- \`complete_remote_mcp_siwe_login\`: completes an allowlisted protocol MCP SIWE login after WalletChan approval.
- \`list_protocols\`: lists managed protocol integrations such as Veil MCP.
- \`list_protocol_tools\`: lists raw tools exposed by a managed protocol integration.
- \`call_protocol_tool\`: calls raw allowlisted protocol tools. Prefer first-class wrappers when available.
- \`veil_status\`, \`veil_init_keypair\`, \`veil_get_balances\`, \`veil_prepare_register\`, \`veil_prepare_deposit\`: use Veil Cash on Base through managed Veil MCP. Register/deposit can submit prepared calls through WalletChan with \`submitPreparedCalls: true\`.
- \`sign_siwe\`: validates and signs an exact EIP-4361 SIWE message through WalletChan.
- \`get_request_status\`: checks a WalletChan batch, signature, or transaction request.
- \`sign\`: starts a WalletChan signature approval request.
- \`send_transaction\`: starts a single \`eth_sendTransaction\` approval request.
- \`load_base_plugin\`: loads an upstream Base MCP plugin spec with WalletChan execution overrides.

## Base Plugin Rule

When upstream Base MCP plugin docs say \`send_calls\`, \`get_wallets\`, \`sign\`, or \`get_request_status\`, use the WalletChan MCP tool with that name. If the user provides a name where an address is needed, call \`resolve_name\` first and pass the returned raw address. For SIWE/EIP-4361 auth, use \`sign_siwe\` or the remote SIWE login helpers so the exact challenge is preserved. If they return a prepare response, pass it to \`send_prepared_calls\`. If they ask for Base MCP \`swap\`, use WalletChan MCP \`swap\`. If they instruct the assistant to call an external API, use WalletChan MCP \`web_request\` for allowlisted hosts. If they instruct the assistant to run a protocol CLI, use WalletChan MCP \`run_base_plugin_cli\` when supported. If they instruct the assistant to use an allowlisted remote MCP such as Virtuals, use \`list_remote_mcp_tools\`, \`call_remote_mcp_tool\`, \`start_remote_mcp_siwe_login\`, and \`complete_remote_mcp_siwe_login\`. If they need a managed protocol integration such as Veil, use \`list_protocols\`, first-class \`veil_*\` tools, or \`call_protocol_tool\` for raw allowlisted tools. Otherwise use the harness' web/shell/tools/connectors or a separate protocol MCP and route only final wallet actions through WalletChan. If WalletChan is not paired, call \`get_pairing_uri\` first and show the returned \`pairingUrl\` or \`pairingUri\`. Do not use unsupported Base MCP tools or arbitrary protocol runners.

Wallet approvals happen in the WalletChan extension popup, not via a Base Account approval URL.

For Veil Cash, read \`walletchan://veil-mcp/SKILL.md\` or \`walletchan://veil-mcp/plugins/veil.md\`. Veil key material is local to Veil MCP in WalletChan MCP's managed Veil data directory, not in the WalletChan extension vault. Veil private relay-backed tools are disabled by default because they do not open WalletChan popup approval.
`;
