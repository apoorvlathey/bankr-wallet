import {
  decodeAbiParameters,
  getAddress,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from "viem";

import {
  MAX_SIMULATION_APPROVAL_CHANGES,
  PERMIT2_ADDRESS,
} from "./constants";
import type { ApprovalIntent, ApprovalIntentDiscovery } from "./approvalIntents";
import type {
  EthSimulateCallResult,
  EthSimulateLog,
} from "./ethSimulateLogs";

const ERC20_APPROVAL_TOPIC = keccak256(
  stringToHex("Approval(address,address,uint256)"),
).toLowerCase();
const PERMIT2_APPROVAL_TOPIC = keccak256(
  stringToHex("Approval(address,address,address,uint160,uint48)"),
).toLowerCase();
const PERMIT2_PERMIT_TOPIC = keccak256(
  stringToHex("Permit(address,address,address,uint160,uint48,uint48)"),
).toLowerCase();
const PERMIT2_LOCKDOWN_TOPIC = keccak256(
  stringToHex("Lockdown(address,address,address)"),
).toLowerCase();

function topicAddress(topic: string | undefined): Address | null {
  if (!topic || !/^0x[0-9a-fA-F]{64}$/.test(topic)) return null;
  try {
    return getAddress(`0x${topic.slice(-40)}`);
  } catch {
    return null;
  }
}

function emitterAddress(log: EthSimulateLog): Address | null {
  if (!log.address) return null;
  try {
    return getAddress(log.address);
  } catch {
    return null;
  }
}

function decodePermit2AmountExpiration(
  data: string | undefined,
  includesNonce: boolean,
): { amount: bigint; expiration: number } | null {
  if (!data || !/^0x[0-9a-fA-F]+$/.test(data)) return null;
  try {
    if (includesNonce) {
      const [amount, expiration] = decodeAbiParameters(
        [
          { type: "uint160" },
          { type: "uint48" },
          { type: "uint48" },
        ],
        data as Hex,
      );
      return { amount, expiration: Number(expiration) };
    }
    const [amount, expiration] = decodeAbiParameters(
      [{ type: "uint160" }, { type: "uint48" }],
      data as Hex,
    );
    return { amount, expiration: Number(expiration) };
  } catch {
    return null;
  }
}

function parseApprovalLog(
  log: EthSimulateLog,
  owner: Address,
  order: number,
): ApprovalIntent | null | "malformed" {
  const topics = log.topics ?? [];
  const topic0 = topics[0]?.toLowerCase();
  const emitter = emitterAddress(log);
  if (!topic0 || !emitter) return null;

  if (topic0 === ERC20_APPROVAL_TOPIC) {
    if (topics.length !== 3) return "malformed";
    const eventOwner = topicAddress(topics[1]);
    const spender = topicAddress(topics[2]);
    if (!eventOwner || !spender) return "malformed";
    if (eventOwner.toLowerCase() !== owner.toLowerCase()) return null;
    try {
      const [amount] = decodeAbiParameters(
        [{ type: "uint256" }],
        (log.data || "0x") as Hex,
      );
      return {
        system: "erc20",
        tokenAddress: emitter,
        owner: eventOwner,
        spender,
        requestedAmount: amount,
        expiration: null,
        grantLike: amount > 0n,
        order,
      };
    } catch {
      return "malformed";
    }
  }

  if (emitter.toLowerCase() !== PERMIT2_ADDRESS.toLowerCase()) return null;

  if (
    topic0 === PERMIT2_APPROVAL_TOPIC ||
    topic0 === PERMIT2_PERMIT_TOPIC
  ) {
    if (topics.length !== 4) return "malformed";
    const eventOwner = topicAddress(topics[1]);
    const token = topicAddress(topics[2]);
    const spender = topicAddress(topics[3]);
    if (!eventOwner || !token || !spender) return "malformed";
    if (eventOwner.toLowerCase() !== owner.toLowerCase()) return null;
    const decoded = decodePermit2AmountExpiration(
      log.data,
      topic0 === PERMIT2_PERMIT_TOPIC,
    );
    if (!decoded) return "malformed";
    return {
      system: "permit2",
      tokenAddress: token,
      owner: eventOwner,
      spender,
      requestedAmount: decoded.amount,
      expiration: decoded.expiration,
      grantLike: decoded.amount > 0n,
      order,
    };
  }

  if (topic0 === PERMIT2_LOCKDOWN_TOPIC) {
    if (topics.length !== 2) return "malformed";
    const eventOwner = topicAddress(topics[1]);
    if (!eventOwner) return "malformed";
    if (eventOwner.toLowerCase() !== owner.toLowerCase()) return null;
    try {
      const [token, spender] = decodeAbiParameters(
        [{ type: "address" }, { type: "address" }],
        (log.data || "0x") as Hex,
      );
      return {
        system: "permit2",
        tokenAddress: getAddress(token),
        owner: eventOwner,
        spender: getAddress(spender),
        requestedAmount: 0n,
        expiration: 0,
        grantLike: false,
        order,
      };
    } catch {
      return "malformed";
    }
  }

  return null;
}

export function discoverApprovalIntentsFromLogs(
  callResults: EthSimulateCallResult[],
  ownerAddress: string,
): ApprovalIntentDiscovery {
  let owner: Address;
  try {
    owner = getAddress(ownerAddress);
  } catch {
    return { intents: [], incomplete: true };
  }

  const intents: ApprovalIntent[] = [];
  let incomplete = false;
  let order = 0;

  for (const callResult of callResults) {
    if (callResult.status === "0x0") continue;
    if (callResult.status !== "0x1") {
      if ((callResult.logs ?? []).length > 0) incomplete = true;
      continue;
    }
    for (const log of callResult.logs ?? []) {
      const parsed = parseApprovalLog(log, owner, order++);
      if (parsed === "malformed") {
        incomplete = true;
        continue;
      }
      if (!parsed) continue;
      if (intents.length >= MAX_SIMULATION_APPROVAL_CHANGES) {
        incomplete = true;
        continue;
      }
      intents.push(parsed);
    }
  }

  return { intents, incomplete };
}
