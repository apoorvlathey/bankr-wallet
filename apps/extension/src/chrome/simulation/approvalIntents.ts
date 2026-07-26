import {
  decodeAbiParameters,
  decodeFunctionData,
  getAddress,
  type Address,
  type Hex,
} from "viem";

import { decodeErc7821Batch } from "@/lib/erc7821Decode";
import { parseApproveCalldata } from "@/lib/erc20Approve";
import {
  ERC20_MUTATION_ABI,
  ERC7821_EXECUTE_SELECTOR,
  MULTICALL3_APPROVAL_ABI,
  PERMIT2_ABI,
  SAFE_MULTISEND_ABI,
  SAFE_MULTISEND_SELECTOR,
  SELF_MULTICALL_SELECTOR,
} from "./approvalAbis";
import {
  MAX_APPROVAL_DECODE_CALLS,
  MAX_APPROVAL_DECODE_DEPTH,
  MAX_SIMULATION_APPROVAL_CHANGES,
  MULTICALL3_ADDRESS,
  PERMIT2_ADDRESS,
} from "./constants";
import type { ApprovalSystem } from "./types";

export interface ApprovalSimulationCall {
  to?: string;
  data?: string;
  value?: string;
}

export interface ApprovalIntent {
  system: ApprovalSystem;
  tokenAddress: Address;
  owner: Address;
  spender: Address;
  requestedAmount: bigint;
  expiration: number | null;
  grantLike: boolean;
  order: number;
}

export interface ApprovalIntentDiscovery {
  intents: ApprovalIntent[];
  incomplete: boolean;
}

function normalizeAddress(value: string): Address | null {
  try {
    return getAddress(value);
  } catch {
    return null;
  }
}

function unpackSafeMultiSend(
  transactions: Hex,
): { operation: number; to: Address; data: Hex }[] | null {
  const body = transactions.slice(2);
  const calls: { operation: number; to: Address; data: Hex }[] = [];
  let offset = 0;
  try {
    while (offset < body.length) {
      if (offset + 170 > body.length) return null;
      const operation = Number.parseInt(body.slice(offset, offset + 2), 16);
      offset += 2;
      const to = normalizeAddress(`0x${body.slice(offset, offset + 40)}`);
      offset += 40;
      if (!to) return null;
      offset += 64; // value
      const dataLength = Number(BigInt(`0x${body.slice(offset, offset + 64)}`));
      offset += 64;
      if (!Number.isSafeInteger(dataLength) || dataLength < 0) return null;
      const dataEnd = offset + dataLength * 2;
      if (dataEnd > body.length) return null;
      calls.push({
        operation,
        to,
        data: `0x${body.slice(offset, dataEnd)}` as Hex,
      });
      offset = dataEnd;
      if (calls.length > MAX_APPROVAL_DECODE_CALLS) return null;
    }
  } catch {
    return null;
  }
  return offset === body.length ? calls : null;
}

function erc20Intent(
  to: Address,
  data: Hex,
  owner: Address,
  order: number,
): ApprovalIntent[] | null {
  const direct = parseApproveCalldata(data);
  if (direct) {
    return [{
      system: "erc20",
      tokenAddress: to,
      owner,
      spender: getAddress(direct.spender),
      requestedAmount: direct.amount,
      expiration: null,
      grantLike: !direct.isRevoke,
      order,
    }];
  }
  try {
    const decoded = decodeFunctionData({ abi: ERC20_MUTATION_ABI, data });
    if (decoded.functionName === "increaseAllowance") {
      return [{
        system: "erc20",
        tokenAddress: to,
        owner,
        spender: getAddress(decoded.args[0]),
        requestedAmount: decoded.args[1],
        expiration: null,
        grantLike: decoded.args[1] > 0n,
        order,
      }];
    }
    if (decoded.functionName === "decreaseAllowance") {
      return [{
        system: "erc20",
        tokenAddress: to,
        owner,
        spender: getAddress(decoded.args[0]),
        requestedAmount: decoded.args[1],
        expiration: null,
        grantLike: false,
        order,
      }];
    }
    const [permitOwner, spender, amount] = decoded.args;
    if (permitOwner.toLowerCase() !== owner.toLowerCase()) return [];
    return [{
      system: "erc20",
      tokenAddress: to,
      owner: getAddress(permitOwner),
      spender: getAddress(spender),
      requestedAmount: amount,
      expiration: null,
      grantLike: amount > 0n,
      order,
    }];
  } catch {
    return null;
  }
}

function permit2Intents(
  data: Hex,
  owner: Address,
  order: number,
): ApprovalIntent[] | null {
  try {
    const decoded = decodeFunctionData({ abi: PERMIT2_ABI, data });
    if (decoded.functionName === "approve") {
      const [token, spender, amount, expiration] = decoded.args;
      return [{
        system: "permit2",
        tokenAddress: getAddress(token),
        owner,
        spender: getAddress(spender),
        requestedAmount: amount,
        expiration: Number(expiration),
        grantLike: amount > 0n,
        order,
      }];
    }
    if (decoded.functionName === "lockdown") {
      return decoded.args[0].map((approval, index) => ({
        system: "permit2" as const,
        tokenAddress: getAddress(approval.token),
        owner,
        spender: getAddress(approval.spender),
        requestedAmount: 0n,
        expiration: 0,
        grantLike: false,
        order: order + index,
      }));
    }
    const [permitOwner, permit] = decoded.args;
    if (permitOwner.toLowerCase() !== owner.toLowerCase()) return [];
    const details = Array.isArray(permit.details)
      ? permit.details
      : [permit.details];
    return details.map((detail, index) => ({
      system: "permit2" as const,
      tokenAddress: getAddress(detail.token),
      owner: getAddress(permitOwner),
      spender: getAddress(permit.spender),
      requestedAmount: detail.amount,
      expiration: Number(detail.expiration),
      grantLike: detail.amount > 0n,
      order: order + index,
    }));
  } catch {
    return null;
  }
}

function decodeDirect(
  to: Address,
  data: Hex,
  owner: Address,
  order: number,
): ApprovalIntent[] | null {
  if (to.toLowerCase() === PERMIT2_ADDRESS.toLowerCase()) {
    const permit2 = permit2Intents(data, owner, order);
    if (permit2 !== null) return permit2;
  }
  return erc20Intent(to, data, owner, order);
}

function decodeNested(
  to: Address,
  data: Hex,
): { calls: ApprovalSimulationCall[]; incomplete: boolean } | null {
  if (data.startsWith(SELF_MULTICALL_SELECTOR)) {
    try {
      const [payloads] = decodeAbiParameters(
        [{ type: "bytes[]" }],
        `0x${data.slice(10)}`,
      );
      return {
        calls: payloads
          .slice(0, MAX_APPROVAL_DECODE_CALLS)
          .map((payload) => ({ to, data: payload })),
        incomplete: payloads.length > MAX_APPROVAL_DECODE_CALLS,
      };
    } catch {
      return { calls: [], incomplete: true };
    }
  }
  if (data.startsWith(ERC7821_EXECUTE_SELECTOR)) {
    const calls = decodeErc7821Batch(data);
    return calls ? { calls, incomplete: false } : { calls: [], incomplete: true };
  }
  if (to.toLowerCase() === MULTICALL3_ADDRESS.toLowerCase()) {
    try {
      const decoded = decodeFunctionData({
        abi: MULTICALL3_APPROVAL_ABI,
        data,
      });
      const args = decoded.args as readonly unknown[];
      const raw = decoded.functionName === "tryAggregate" ? args[1] : args[0];
      if (!Array.isArray(raw)) return { calls: [], incomplete: true };
      return {
        calls: raw.map((call: any) => ({
          to: call.target,
          data: call.callData,
          value:
            typeof call.value === "bigint" && call.value > 0n
              ? `0x${call.value.toString(16)}`
              : "0x0",
        })),
        incomplete: false,
      };
    } catch {
      return { calls: [], incomplete: true };
    }
  }
  if (data.startsWith(SAFE_MULTISEND_SELECTOR)) {
    try {
      const decoded = decodeFunctionData({ abi: SAFE_MULTISEND_ABI, data });
      const calls = unpackSafeMultiSend(decoded.args[0]);
      if (!calls) return { calls: [], incomplete: true };
      return {
        calls: calls
          .filter((call) => call.operation === 0)
          .map((call) => ({ to: call.to, data: call.data })),
        incomplete: calls.some((call) => call.operation !== 0),
      };
    } catch {
      return { calls: [], incomplete: true };
    }
  }
  return null;
}

export function discoverApprovalIntents(
  calls: ApprovalSimulationCall[],
  ownerAddress: string,
): ApprovalIntentDiscovery {
  const owner = normalizeAddress(ownerAddress);
  if (!owner) return { intents: [], incomplete: true };
  const intents: ApprovalIntent[] = [];
  let incomplete = false;
  let visited = 0;
  let order = 0;

  const visit = (call: ApprovalSimulationCall, depth: number) => {
    if (++visited > MAX_APPROVAL_DECODE_CALLS || depth > MAX_APPROVAL_DECODE_DEPTH) {
      incomplete = true;
      return;
    }
    const to = call.to ? normalizeAddress(call.to) : null;
    const data =
      call.data && /^0x[0-9a-fA-F]*$/.test(call.data)
        ? call.data as Hex
        : null;
    if (!to || !data) {
      if (call.to || call.data) incomplete = true;
      return;
    }
    if (data === "0x") return;

    const direct = decodeDirect(to, data, owner, order++);
    if (direct !== null) {
      for (const intent of direct) {
        if (intents.length >= MAX_SIMULATION_APPROVAL_CHANGES) {
          incomplete = true;
          break;
        }
        intents.push(intent);
      }
      return;
    }
    const nested = decodeNested(to, data);
    if (!nested) {
      incomplete = true;
      return;
    }
    incomplete ||= nested.incomplete;
    nested.calls.forEach((nestedCall) => visit(nestedCall, depth + 1));
  };

  calls.forEach((call) => visit(call, 0));
  return { intents, incomplete };
}
