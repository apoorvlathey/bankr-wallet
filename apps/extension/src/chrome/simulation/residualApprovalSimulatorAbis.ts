const BATCH_CALL_INPUT = {
  name: "calls",
  type: "tuple[]" as const,
  components: [
    { name: "to", type: "address" as const },
    { name: "value", type: "uint256" as const },
    { name: "data", type: "bytes" as const },
  ],
} as const;

export const TRACE_BATCH_SIMULATOR_ABI = [
  {
    type: "function" as const,
    name: "executeBatchForTrace" as const,
    inputs: [BATCH_CALL_INPUT],
    outputs: [{ name: "allSuccess", type: "bool" as const }],
    stateMutability: "nonpayable" as const,
  },
] as const;

export const ALLOWANCE_BATCH_SIMULATOR_ABI = [
  {
    type: "function" as const,
    name: "simulateBatchAllowances" as const,
    inputs: [
      BATCH_CALL_INPUT,
      {
        name: "pairs",
        type: "tuple[]" as const,
        components: [
          { name: "token", type: "address" as const },
          { name: "spender", type: "address" as const },
        ],
      },
    ],
    outputs: [
      { name: "allSuccess", type: "bool" as const },
      { name: "beforeSuccess", type: "bool[]" as const },
      { name: "beforeAmount", type: "uint256[]" as const },
      { name: "afterSuccess", type: "bool[]" as const },
      { name: "afterAmount", type: "uint256[]" as const },
    ],
    stateMutability: "nonpayable" as const,
  },
] as const;
