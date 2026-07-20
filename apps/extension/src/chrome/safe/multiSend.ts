import {
  concatHex,
  getAddress,
  hexToBigInt,
  hexToNumber,
  numberToHex,
  padHex,
  sliceHex,
} from "viem";
import type { SafeAddress, SafeCall } from "./types";

const MAX_CALLS = 100;
const MAX_TOTAL_DATA_BYTES = 128 * 1024;
const HEADER_BYTES = 85;

function validateCall(call: SafeCall): SafeCall {
  if (call.operation !== 0) {
    throw new Error("Delegatecall is not supported inside a Safe batch");
  }
  if (!/^0x[0-9a-fA-F]*$/.test(call.data) || call.data.length % 2 !== 0) {
    throw new Error("Invalid Safe call data");
  }
  const value = BigInt(call.value);
  if (value < 0n || value >= 1n << 256n) throw new Error("Invalid Safe call value");
  return {
    to: getAddress(call.to).toLowerCase() as SafeAddress,
    value: value.toString() as `${bigint}`,
    data: call.data.toLowerCase() as `0x${string}`,
    operation: 0,
  };
}

export function encodeMultiSendTransactions(calls: readonly SafeCall[]): `0x${string}` {
  if (calls.length < 1 || calls.length > MAX_CALLS) {
    throw new Error("Invalid Safe batch call count");
  }
  let dataBytes = 0;
  const encoded = calls.map((candidate) => {
    const call = validateCall(candidate);
    const length = (call.data.length - 2) / 2;
    dataBytes += length;
    if (dataBytes > MAX_TOTAL_DATA_BYTES) throw new Error("Safe batch calldata is too large");
    return concatHex([
      numberToHex(call.operation, { size: 1 }),
      call.to,
      padHex(numberToHex(BigInt(call.value)), { size: 32 }),
      padHex(numberToHex(length), { size: 32 }),
      call.data,
    ]);
  });
  return concatHex(encoded);
}

export function decodeMultiSendTransactions(encoded: `0x${string}`): SafeCall[] {
  if (!/^0x[0-9a-fA-F]*$/.test(encoded) || encoded.length % 2 !== 0) {
    throw new Error("Invalid MultiSend payload");
  }
  const totalBytes = (encoded.length - 2) / 2;
  let offset = 0;
  let dataBytes = 0;
  const calls: SafeCall[] = [];
  while (offset < totalBytes) {
    if (calls.length >= MAX_CALLS || totalBytes - offset < HEADER_BYTES) {
      throw new Error("Malformed MultiSend payload");
    }
    const operation = hexToNumber(sliceHex(encoded, offset, offset + 1));
    const to = getAddress(sliceHex(encoded, offset + 1, offset + 21)).toLowerCase() as SafeAddress;
    const value = hexToBigInt(sliceHex(encoded, offset + 21, offset + 53));
    const lengthBigInt = hexToBigInt(sliceHex(encoded, offset + 53, offset + 85));
    if (lengthBigInt > BigInt(MAX_TOTAL_DATA_BYTES)) throw new Error("Safe batch calldata is too large");
    const length = Number(lengthBigInt);
    const end = offset + HEADER_BYTES + length;
    if (end > totalBytes) throw new Error("Malformed MultiSend payload length");
    const data = sliceHex(encoded, offset + HEADER_BYTES, end);
    calls.push(validateCall({ to, value: value.toString() as `${bigint}`, data, operation: operation as 0 | 1 }));
    dataBytes += length;
    if (dataBytes > MAX_TOTAL_DATA_BYTES) throw new Error("Safe batch calldata is too large");
    offset = end;
  }
  if (calls.length === 0) throw new Error("Safe batch is empty");
  return calls;
}
