export interface ProtocolToolDefinition {
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const addressSchema = {
  type: "string",
  pattern: "^0x[a-fA-F0-9]{40}$",
};

const assetSchema = {
  enum: ["ETH", "USDC"],
};

const poolSchema = {
  enum: ["eth", "usdc"],
};

const poolOrAllSchema = {
  enum: ["eth", "usdc", "all"],
};

export const VEIL_WRAPPED_TOOLS: ProtocolToolDefinition[] = [
  {
    name: "veil_init_keypair",
    title: "Initialize Veil Keypair",
    description: "Generate a random local Veil keypair in WalletChan MCP's managed Veil data directory. Returns the public deposit key but never returns VEIL_KEY.",
    inputSchema: objectSchema({
      force: { type: "boolean", description: "Overwrite an existing managed Veil keypair." },
    }),
  },
  {
    name: "veil_status",
    title: "Veil Status",
    description: "Check local Veil key status, relay health, and optional owner registration/wallet status on Base.",
    inputSchema: objectSchema({
      owner: { ...addressSchema, description: "Optional owner address for registration and wallet status checks." },
    }),
  },
  {
    name: "veil_get_balances",
    title: "Veil Balances",
    description: "Read public wallet balances, Veil queue balances, and private balances when the managed Veil key is available.",
    inputSchema: objectSchema({
      owner: { ...addressSchema, description: "Owner address. Defaults to first approved WalletChan account." },
      pool: { ...poolOrAllSchema, description: "Pool to query. Defaults to all." },
    }),
  },
  {
    name: "veil_deposit_status",
    title: "Veil Deposit Status",
    description: "Check one queued Veil deposit by pool and nonce. Owner defaults to the first approved WalletChan account.",
    inputSchema: objectSchema({
      owner: { ...addressSchema, description: "Owner address. Defaults to first approved WalletChan account." },
      pool: poolSchema,
      nonce: { type: "string", pattern: "^\\d+$" },
    }, ["pool", "nonce"]),
  },
  {
    name: "veil_wait_for_deposit",
    title: "Wait for Veil Deposit",
    description: "Poll one queued Veil deposit until accepted, rejected, refunded, or timeout.",
    inputSchema: objectSchema({
      owner: { ...addressSchema, description: "Owner address. Defaults to first approved WalletChan account." },
      pool: poolSchema,
      nonce: { type: "string", pattern: "^\\d+$" },
      timeoutSeconds: { type: "number", description: "Timeout in seconds. Veil MCP max is 1800." },
      intervalSeconds: { type: "number", description: "Poll interval in seconds." },
    }, ["pool", "nonce"]),
  },
  {
    name: "veil_prepare_register",
    title: "Prepare Veil Register",
    description: "Prepare unsigned Base calldata to register or rotate the managed Veil deposit key. Set submitPreparedCalls=true to submit through WalletChan popup approval.",
    inputSchema: objectSchema({
      owner: { ...addressSchema, description: "Owner address. Defaults to first approved WalletChan account." },
      force: { type: "boolean", description: "Prepare changeDepositKey when already registered with a different key." },
      ...submissionFields(),
    }),
  },
  {
    name: "veil_prepare_deposit",
    title: "Prepare Veil Deposit",
    description: "Prepare unsigned Base calldata for ETH or USDC Veil deposit. Set submitPreparedCalls=true to submit through WalletChan popup approval.",
    inputSchema: objectSchema({
      owner: { ...addressSchema, description: "Owner address. Defaults to first approved WalletChan account." },
      asset: assetSchema,
      amount: { type: "string", description: "Net amount intended to arrive in Veil, e.g. 0.1." },
      ...submissionFields(),
    }, ["asset", "amount"]),
  },
  {
    name: "veil_x402_quote",
    title: "Quote x402 Resource",
    description: "Probe an x402 resource without funding or paying from private Veil USDC.",
    inputSchema: objectSchema({
      url: { type: "string" },
      method: { enum: ["GET", "POST"] },
      body: {},
      headers: { type: "object", additionalProperties: { type: "string" } },
      maxPayment: { type: "string" },
    }, ["url"]),
  },
  {
    name: "veil_pay_x402",
    title: "Pay x402 Resource",
    description: "Pay a Veil-supported x402 v2 exact Base USDC resource from private Veil USDC. Requires maxPayment and confirm=true after explicit user approval because this submits through the Veil relay without a WalletChan popup.",
    inputSchema: objectSchema({
      url: { type: "string", description: "x402-protected resource URL." },
      method: { enum: ["GET", "POST"], description: "HTTP method. Defaults to GET in Veil MCP." },
      body: { description: "Request body for POST: a JSON object or raw string." },
      headers: { type: "object", additionalProperties: { type: "string" } },
      maxPayment: { type: "string", description: "Maximum USDC to pay, e.g. 0.10. Required by WalletChan MCP for x402 payments." },
      payerIndex: { type: "string", pattern: "^\\d+$", description: "Optional deterministic payer EOA index to reuse or top up after a failed/funded attempt." },
      forceFresh: { type: "boolean", description: "Skip funded-payer reuse and withdraw to a new payer EOA." },
      confirm: { type: "boolean", description: "Must be true after explicit user approval of the private USDC payment." },
    }, ["url", "maxPayment", "confirm"]),
  },
  {
    name: "veil_x402_receipts",
    title: "x402 Spend History",
    description: "List locally recorded Veil x402 payment receipts.",
    inputSchema: objectSchema({
      limit: { type: "number" },
    }),
  },
  {
    name: "veil_x402_payer_balances",
    title: "x402 Payer Balances",
    description: "Inspect Base USDC balances held by deterministic x402 payer EOAs for the managed Veil key.",
    inputSchema: objectSchema({
      discover: { type: "boolean" },
      startIndex: { type: "string" },
      count: { type: "number" },
      nonZeroOnly: { type: "boolean" },
    }),
  },
  {
    name: "veil_subaccount_status",
    title: "Veil Subaccount Status",
    description: "Read Veil subaccount status for a local Veil key slot.",
    inputSchema: objectSchema({
      slot: { type: "number" },
    }, ["slot"]),
  },
];

function submissionFields(): Record<string, unknown> {
  return {
    submitPreparedCalls: {
      type: "boolean",
      description: "If true, submit the prepared calls through WalletChan after Veil prepares them.",
    },
    chain: {
      type: ["string", "number"],
      description: "Optional WalletChan chain override for submission. Defaults to base.",
    },
    from: {
      type: "string",
      description: "Optional approved WalletChan sender for submission.",
    },
    atomicRequired: {
      type: "boolean",
      description: "Whether WalletChan batch execution must be atomic.",
    },
    previewOnly: {
      type: "boolean",
      description: "If true with submitPreparedCalls, normalize calls without submitting.",
    },
    allowWarnings: {
      type: "boolean",
      description: "Allow error-level prepared-call warnings only after explicit user confirmation.",
    },
  };
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
