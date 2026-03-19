// ERC-20 minimal ABI (balanceOf, allowance, approve)
export const erc20Abi = [
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    name: "allowance",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "spender", type: "address" },
      { name: "value", type: "uint256" },
    ],
    name: "approve",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    name: "transfer",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// WETH9 deposit/withdraw (wrap/unwrap ETH <-> WETH)
export const weth9Abi = [
  {
    inputs: [],
    name: "deposit",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [{ name: "wad", type: "uint256" }],
    name: "withdraw",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

// WCHANVault (totalAssets, totalSupply, deposit, redeem, previewDeposit, previewRedeem, balanceOf)
export const wchanVaultAbi = [
  {
    inputs: [],
    name: "totalAssets",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "totalSupply",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "account", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "assets", type: "uint256" },
      { name: "receiver", type: "address" },
    ],
    name: "deposit",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      { name: "shares", type: "uint256" },
      { name: "receiver", type: "address" },
      { name: "owner", type: "address" },
    ],
    name: "redeem",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ name: "assets", type: "uint256" }],
    name: "previewDeposit",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [{ name: "shares", type: "uint256" }],
    name: "previewRedeem",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// DripWCHANRewards
export const dripRewardsAbi = [
  {
    inputs: [],
    name: "owner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "drip",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "canDrip",
    outputs: [
      { name: "wchanCan", type: "bool" },
      { name: "wethCan", type: "bool" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "isWeth", type: "bool" },
      { name: "amount", type: "uint256" },
      { name: "endTimestamp", type: "uint256" },
    ],
    name: "configureDrip",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [],
    name: "wchanStream",
    outputs: [
      { name: "startTimestamp", type: "uint256" },
      { name: "endTimestamp", type: "uint256" },
      { name: "lastDripTimestamp", type: "uint256" },
      { name: "amountRemaining", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "wethStream",
    outputs: [
      { name: "startTimestamp", type: "uint256" },
      { name: "endTimestamp", type: "uint256" },
      { name: "lastDripTimestamp", type: "uint256" },
      { name: "amountRemaining", type: "uint256" },
    ],
    stateMutability: "view",
    type: "function",
  },
] as const;
