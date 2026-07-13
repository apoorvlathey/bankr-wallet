import {
  encodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  keccak256,
  toHex,
  type Address,
  type PublicClient,
} from "viem";

import { PERMIT2_ADDRESS, SIMULATION_GAS_LIMIT } from "./constants";

export type StateDiffEntry = {
  slot: `0x${string}`;
  value: `0x${string}`;
};

export type SimulationStateOverride = {
  address: Address;
  stateDiff: StateDiffEntry[];
};

/** Known EIP-1967 proxy slots that are not token balance/allowance mappings. */
const PROXY_SLOTS = new Set([
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc",
  "0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103",
  "0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50",
]);

async function findStorageSlot(
  client: PublicClient,
  token: Address,
  data: `0x${string}`,
): Promise<`0x${string}` | null> {
  try {
    const { accessList } = await client.createAccessList({
      to: token,
      data,
      gas: SIMULATION_GAS_LIMIT,
    });
    const tokenEntry = accessList.find(
      (entry) => entry.address.toLowerCase() === token.toLowerCase(),
    );
    const storageKeys = tokenEntry?.storageKeys.filter(
      (slot) => !PROXY_SLOTS.has(slot.toLowerCase()),
    );
    return (storageKeys?.[0] as `0x${string}` | undefined) ?? null;
  } catch {
    return null;
  }
}

async function findBalanceSlot(
  client: PublicClient,
  token: Address,
  user: Address,
): Promise<`0x${string}` | null> {
  return findStorageSlot(
    client,
    token,
    encodeFunctionData({
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [user],
    }),
  );
}

async function findAllowanceSlot(
  client: PublicClient,
  token: Address,
  owner: Address,
  spender: Address,
): Promise<`0x${string}` | null> {
  return findStorageSlot(
    client,
    token,
    encodeFunctionData({
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, spender],
    }),
  );
}

/** Permit2 `allowance[owner][token][spender]` storage slot (mapping slot 0). */
export function getPermit2AllowanceSlot(
  owner: Address,
  token: Address,
  spender: Address,
): `0x${string}` {
  const ownerSlot = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }],
      [owner, 0n],
    ),
  );
  const tokenSlot = keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }],
      [token, ownerSlot],
    ),
  );
  return keccak256(
    encodeAbiParameters(
      [{ type: "address" }, { type: "bytes32" }],
      [spender, tokenSlot],
    ),
  );
}

/** Preserve Permit2's 48-bit nonce while maximizing expiration and amount. */
export function packPermit2AllowanceOverride(
  currentValue: `0x${string}` | undefined,
): `0x${string}` {
  const packed = BigInt(currentValue || "0x0");
  const nonce = (packed >> 208n) & 0xffffffffffffn;
  return toHex(
    (nonce << 208n) |
      (0xffffffffffffn << 160n) |
      0xffffffffffffffffffffffffffffffffffffffffn,
    { size: 32 },
  );
}

/**
 * Discover token storage and build retry overrides for balances, ERC-20
 * approvals, and Permit2 allowances. Slot discovery is best effort.
 */
export async function buildRetryOverrides(
  client: PublicClient,
  owner: Address,
  spender: Address,
  candidates: Address[],
): Promise<SimulationStateOverride[]> {
  const maxUint256 =
    "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as const;
  const largeBalance = toHex(10n ** 30n, { size: 32 });

  const [balanceSlots, allowanceSlots] = await Promise.all([
    Promise.all(
      candidates.map((token) => findBalanceSlot(client, token, owner)),
    ),
    Promise.all(
      candidates.map((token) =>
        findAllowanceSlot(client, token, owner, PERMIT2_ADDRESS),
      ),
    ),
  ]);

  console.log(
    "[TxSim] Balance slots found:",
    balanceSlots
      .map((slot, index) =>
        `${candidates[index].slice(0, 8)}=${slot ? "yes" : "no"}`,
      )
      .join(", "),
  );
  console.log(
    "[TxSim] Allowance slots found:",
    allowanceSlots
      .map((slot, index) =>
        `${candidates[index].slice(0, 8)}=${slot ? "yes" : "no"}`,
      )
      .join(", "),
  );

  const diffMap = new Map<string, StateDiffEntry[]>();
  const addressMap = new Map<string, Address>();
  const addDiff = (address: Address, diff: StateDiffEntry) => {
    const key = address.toLowerCase();
    addressMap.set(key, address);
    diffMap.set(key, [...(diffMap.get(key) ?? []), diff]);
  };

  candidates.forEach((token, index) => {
    const balanceSlot = balanceSlots[index];
    if (balanceSlot) {
      addDiff(token, { slot: balanceSlot, value: largeBalance });
    }
  });
  candidates.forEach((token, index) => {
    const allowanceSlot = allowanceSlots[index];
    if (allowanceSlot) {
      addDiff(token, { slot: allowanceSlot, value: maxUint256 });
    }
  });

  const permit2Slots = candidates.map((token) =>
    getPermit2AllowanceSlot(owner, token, spender),
  );
  const currentPermit2Values = await Promise.all(
    permit2Slots.map((slot) =>
      client
        .getStorageAt({ address: PERMIT2_ADDRESS, slot })
        .catch(() => "0x0" as `0x${string}`),
    ),
  );
  permit2Slots.forEach((slot, index) => {
    addDiff(PERMIT2_ADDRESS, {
      slot,
      value: packPermit2AllowanceOverride(currentPermit2Values[index]),
    });
  });

  return Array.from(diffMap, ([key, stateDiff]) => ({
    address: addressMap.get(key)!,
    stateDiff,
  })).filter((override) => override.stateDiff.length > 0);
}
