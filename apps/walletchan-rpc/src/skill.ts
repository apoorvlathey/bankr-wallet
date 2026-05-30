import type { CliConfig } from "./cli.js";
import { formatChains, toHexChainId } from "./chains.js";
import type { RpcContext } from "./rpcHandler.js";
import type { SessionInfo } from "./walletConnect.js";

const APPROVAL_METHODS = [
  "eth_sendTransaction",
  "personal_sign",
  "eth_signTypedData_v3",
  "eth_signTypedData_v4",
];

const BATCH_METHODS = [
  "wallet_getCapabilities",
  "wallet_sendCalls",
  "wallet_getCallsStatus",
  "wallet_showCallsStatus",
];

export function formatRuntimeSkill(config: CliConfig, context: RpcContext): string {
  const rpcUrl = `http://${config.host}:${config.port}`;
  const activeChain = context.getActiveChain();
  const activeChainId = toHexChainId(activeChain.chainId);
  const session = getSession(context);
  const accounts = session?.accounts || [];
  const preferredAccount = accounts[0] || "0xYourApprovedAccount";
  const methods = context.includeBatching
    ? [...APPROVAL_METHODS, ...BATCH_METHODS]
    : APPROVAL_METHODS;

  return `---
name: walletchan-rpc
description: Use when sending Ethereum JSON-RPC, Foundry, or ERC-5792 wallet_sendCalls requests through a local WalletChan RPC server with user wallet approval.
---

# WalletChan RPC

This skill was served by a live WalletChan RPC instance. Use the runtime details below as authoritative for this session.

## Runtime

- RPC URL: \`${rpcUrl}\`
- Connected: \`${context.wallet.connected ? "yes" : "no"}\`
- Approved accounts: ${accounts.length > 0 ? accounts.map((account) => `\`${account}\``).join(", ") : "`none`"}
- Active chain: \`${activeChain.name}\` (${activeChain.chainId}, \`${activeChainId}\`)
- Configured chains: \`${formatChains(context.chains)}\`
- Batching: \`${context.includeBatching ? "enabled" : "disabled"}\`
- Wallet: \`${session?.peerName || "unknown"}\`${session?.peerUrl ? ` (${session.peerUrl})` : ""}

## How To Use

Send standard JSON-RPC over HTTP to \`${rpcUrl}\` or \`${rpcUrl}/rpc\`. Any JSON-RPC client can use this endpoint, including JavaScript code, shell scripts, viem, ethers, Foundry, or an AI agent.

Built-in chain aliases and default RPC URLs are copied from WalletChan's extension registry. Common aliases include \`ethereum\`, \`arbitrum\`, \`base\`, \`bnb\`, \`optimism\`, \`megaeth\`, \`polygon\`, \`unichain\`, \`gnosis\`, \`monad\`, \`sonic\`, \`sei\`, \`mantle\`, \`linea\`, \`berachain\`, and \`base-sepolia\`.

WalletChan RPC is not limited to built-in chain names. The CLI can expose any EVM chain supported by the connected wallet when the user starts it with a numeric chain ID and upstream RPC URL, for example \`--chain 43114 --rpc 43114=https://api.avax.network/ext/bc/C/rpc\`.

Use these wallet methods:

${methods.map((method) => `- \`${method}\``).join("\n")}

Read-only JSON-RPC methods may be forwarded to the configured upstream RPC. Local account and chain methods include \`eth_accounts\`, \`eth_requestAccounts\`, \`eth_chainId\`, \`net_version\`, \`web3_clientVersion\`, and \`wallet_switchEthereumChain\`.

## Safety Rules

- Use \`eth_sendTransaction\` for sends. Never use \`eth_sendRawTransaction\`, \`eth_sign\`, or \`eth_signTransaction\`.
- Every send/sign/batch request opens a user approval prompt in the connected wallet.
- If the wallet rejects a request, report the rejection to the user. Do not retry rejected sends automatically.
- Use only an approved account from \`eth_accounts\` as \`from\` or Foundry \`--sender\`.
- If a request targets a different configured chain, include the target \`chainId\` or call \`wallet_switchEthereumChain\` first.
- If the needed EVM chain is not configured, ask the user to restart the CLI with \`--chain <chainId> --rpc <chainId>=https://...\`.
- WalletConnect sessions persist across CLI restarts. Ask the user to restart with \`--force-new-session\` only when they want a fresh pairing.

## Discovery

\`\`\`bash
curl -s ${rpcUrl}/health
curl -s ${rpcUrl}/session
curl -s ${rpcUrl}/SKILL.md
\`\`\`

\`\`\`bash
curl -s ${rpcUrl} \\
  -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_accounts","params":[]}'
\`\`\`

## wallet_sendCalls

When batching is enabled, prefer \`wallet_sendCalls\` for related write actions that should be reviewed and submitted together. The goal is to reduce the number of wallet approval popups for one user intent while preserving a clear wallet confirmation.

Use \`wallet_sendCalls\` when:

- A later call depends on an earlier call in the same user intent.
- The user asks for several related sends or contract writes, such as sending tokens or ETH to multiple addresses, distributing payments, claiming several rewards, minting several NFTs from the same collection, or doing several same-protocol actions.
- The flow would otherwise require multiple approvals for one task, such as \`approve + swap\`, \`approve + stake\`, \`approve + deposit\`, \`approve + bridge\`, or \`claim + stake\`.
- The calls must target one chain and use the same approved \`from\` account.

For dependent actions such as \`approve + swap\` or \`approve + stake\`, set \`atomicRequired: true\` so the wallet must execute all calls atomically or none of the material effects should land onchain. Put calls in execution order: approval first, then the action that consumes the approval. For independent but related actions, such as sending tokens to multiple recipients, still prefer one \`wallet_sendCalls\` request so the user reviews one batch instead of several popups.

Do not use \`wallet_sendCalls\` for unrelated actions that the user should consider separately, for cross-chain flows, or as a blind retry after the user rejects a request. If the user query describes one cohesive task with multiple same-chain writes, batch it.

After \`wallet_sendCalls\`, record the returned bundle ID. WalletChan returns an object with \`id\`; some wallets may call this \`batchId\`. Poll \`wallet_getCallsStatus\` with that ID until status is terminal, or use \`wallet_showCallsStatus\` to open the bundle's explorer view.

\`\`\`json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "wallet_sendCalls",
  "params": [
    {
      "version": "2.0.0",
      "chainId": "${activeChainId}",
      "from": "${preferredAccount}",
      "atomicRequired": true,
      "calls": [
        {
          "to": "0xTokenAddress",
          "value": "0x0",
          "data": "0xApproveCalldata"
        },
        {
          "to": "0xSwapOrStakeContract",
          "value": "0x0",
          "data": "0xSwapOrStakeCalldata"
        }
      ]
    }
  ]
}
\`\`\`

## Optional Foundry Examples

These examples are optional. WalletChan RPC is a standard JSON-RPC endpoint and is not restricted to Foundry.

For a single call, \`cast send\` is often convenient because it avoids creating a full Foundry script. Use Foundry's unlocked-account path so Foundry sends \`eth_sendTransaction\` to WalletChan RPC:

\`\`\`bash
cast send 0xContractAddress \\
  "transfer(address,uint256)" 0xRecipient 1000000000000000000 \\
  --rpc-url ${rpcUrl} \\
  --unlocked \\
  --from ${preferredAccount}
\`\`\`

For larger flows that already live in a script, use the same unlocked-account path:

\`\`\`bash
forge script script/Deploy.s.sol \\
  --rpc-url ${rpcUrl} \\
  --broadcast \\
  --unlocked \\
  --sender ${preferredAccount}
\`\`\`

Do not pass a private key for this flow.
`;
}

function getSession(context: RpcContext): SessionInfo | null {
  if (!context.wallet.connected) return null;
  try {
    return context.wallet.getSessionInfo();
  } catch {
    return null;
  }
}
