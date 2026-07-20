import { toHex, type Address, type StateOverride } from "viem";

import { SIMULATOR_BYTECODE } from "./simulatorContract";

const ZERO_STORAGE_WORD = toHex(0n, { size: 32 });

/**
 * Install TxSimulator with isolated storage at the simulated sender address.
 *
 * TxSimulator owns a dynamic NFT-receipt array at slot 0. Contract senders
 * such as Safe proxies already have storage there, so preserving their state
 * can reinterpret a proxy address as the array length and panic with 0x41.
 * A non-empty `state` mapping tells RPC nodes to replace the account's entire
 * storage; viem intentionally omits an empty mapping during serialization.
 */
export function buildIsolatedSimulatorOverride(
  address: Address,
  balance?: bigint,
): StateOverride[number] {
  return {
    address,
    code: SIMULATOR_BYTECODE,
    ...(balance === undefined ? {} : { balance }),
    state: [{ slot: ZERO_STORAGE_WORD, value: ZERO_STORAGE_WORD }],
  };
}
