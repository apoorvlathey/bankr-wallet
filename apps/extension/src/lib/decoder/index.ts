/**
 * Local calldata decoder ported from swiss-knife's lib/decoder.ts.
 * Removes event decoding, replaces zod schemas with runtime checks,
 * uses local fetchAbi instead of swiss-knife's fetchContractAbi.
 */

import {
  DecodeArrayParamResult,
  DecodeBytesParamResult,
  DecodeParamTypesResult,
  DecodeRecursiveResult,
  DecodeTupleParamResult,
  ParsedTransaction,
} from "./types";
import { fetchContractAbi } from "./fetchAbi";
import { guessAbiEncodedData, guessFragment } from "@openchainxyz/abi-guesser";
import {
  AbiCoder,
  FunctionFragment,
  Interface,
  InterfaceAbi,
  ParamType,
  Result,
  TransactionDescription,
} from "ethers";
import {
  decodeAbiParameters,
  decodeFunctionData,
  encodeFunctionData,
  Hex,
  hexToBigInt,
  hexToString,
  parseAbi,
} from "viem";
import { FOURBYTE_SOURCIFY_LOOKUP_URL, FOURBYTE_DIRECTORY_API_URL } from "@/constants/externalUrls";
import { fetchJsonBounded } from "@/chrome/boundedHttpResponse";

// Inline helper replacing swiss-knife's startHexWith0x
function startHexWith0x(hexValue?: string): Hex {
  return hexValue
    ? hexValue.startsWith("0x")
      ? hexValue === "0x"
        ? "0x"
        : (hexValue as Hex)
      : (`0x${hexValue}` as Hex)
    : "0x";
}

// =============================================================================
// PRIMARY DECODING FUNCTIONS
// =============================================================================

export async function decodeWithAddress({
  calldata,
  address,
  chainId,
  _depth = 0,
}: {
  calldata: string;
  address: string;
  chainId: number;
  _depth?: number;
}): Promise<TransactionDescription | null> {
  try {
    const fetchedAbi = await fetchContractAbi({ address, chainId });
    const decodedFromAbi = decodeWithABI({ abi: fetchedAbi.abi, calldata });
    if (decodedFromAbi) {
      return decodedFromAbi;
    }
    const decodedWithSelector = await decodeWithSelector({ calldata, _depth });
    return decodedWithSelector;
  } catch {
    return decodeWithSelector({ calldata, _depth });
  }
}

export async function decodeWithSelector({
  calldata,
  _depth = 0,
}: {
  calldata: string;
  _depth?: number;
}): Promise<TransactionDescription | any | null> {
  const isNestedDecode = _depth > 0;

  // Strategy 1: ERC-7821 Execute
  try {
    return decode7821Execute(calldata);
  } catch {
    // Strategy 2: Selector lookup
    try {
      return await _decodeWithSelector(calldata);
    } catch {
      // Strategy 3: Safe MultiSend packed format. Runs BEFORE the
      // `isNestedDecode` early-return because the decoder strictly
      // validates the layout (operation/to/value/dataLen/data tuples must
      // consume every byte exactly) — false positives are vanishingly
      // rare, so it's safe at any depth. CRITICAL for the common case
      // where the outer call is e.g. `multiSend(bytes transactions)` and
      // the inner `bytes` param recurses: without this, the nested bytes
      // (whose first byte is a random `0x00` operation, not a real
      // selector) hits Strategy 2's lookup, fails, then hits the nested
      // early-return below and never gets unpacked. Matches swiss-knife's
      // ordering for the same reason.
      try {
        return decodeSafeMultiSendTransactionsParam(calldata);
      } catch {
        // fall through to nested-gate + aggressive fallbacks
      }

      if (isNestedDecode) {
        return null;
      }

      // Strategy 4: Uniswap path
      try {
        return decodeUniversalRouterPath(calldata);
      } catch {
        // Strategy 5: ABI-encoded data guessing
        try {
          return decodeABIEncodedData(calldata);
        } catch {
          // Strategy 6: Universal Router commands
          try {
            return decodeUniversalRouterCommands(calldata);
          } catch {
            // Strategy 7: Function fragment guessing
            try {
              return decodeByGuessingFunctionFragment(calldata);
            } catch {
              // Strategy 8: UTF-8 text
              try {
                return decodeAsUtf8Text(calldata);
              } catch {
                return null;
              }
            }
          }
        }
      }
    }
  }
}

// =============================================================================
// SPECIAL FORMAT DECODERS
// =============================================================================

const decode7821Execute = (calldata: string) => {
  const selector = calldata.slice(0, 10);
  if (selector !== "0xe9ae5c53") {
    throw new Error("Not ERC-7821 execute");
  }

  const decodedParams = decodeFunctionData({
    abi: parseAbi([
      "function execute(bytes32 mode, bytes calldata executionData) external",
    ]),
    data: calldata as Hex,
  });
  const executionData = decodedParams.args[1];

  const calls = decodeAbiParameters(
    [
      {
        type: "tuple[]",
        components: [
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "data", type: "bytes" },
        ],
      },
    ],
    executionData as Hex
  )[0];

  const txs = calls.map((call: any) => {
    return [call.to, call.value.toString(), call.data];
  });

  return {
    txType: "7821Execute",
    name: "execute",
    args: new Result(txs),
    signature: "execute(bytes32,bytes)",
    selector: selector,
    value: BigInt(0),
    fragment: {
      name: "ERC-7821 execute",
      type: "function",
      stateMutability: "nonpayable",
      inputs: [
        {
          name: "",
          type: "tuple(uint256,address,uint256,uint256,bytes)[]",
          baseType: "array",
          arrayLength: -1,
          arrayChildren: {
            name: "",
            type: "tuple(uint256,address,uint256,uint256,bytes)",
            baseType: "tuple",
            components: [
              { name: "operation", type: "uint256", baseType: "uint256", indexed: null, components: null, arrayLength: null, arrayChildren: null },
              { name: "to", type: "address", indexed: null, components: null, arrayLength: null, arrayChildren: null, baseType: "address" },
              { name: "value", type: "uint256", indexed: null, components: null, arrayLength: null, arrayChildren: null, baseType: "uint256" },
              { name: "dataLength", type: "uint256", indexed: null, components: null, arrayLength: null, arrayChildren: null, baseType: "uint256" },
              { name: "data", type: "bytes", indexed: null, components: null, arrayLength: null, arrayChildren: null, baseType: "bytes" },
            ],
          },
        },
      ],
      outputs: [],
    },
  };
};

const decodeSafeMultiSendTransactionsParam = (bytes: string) => {
  try {
    const transactionsParam = bytes.slice(2);
    const txs: any[] = [];
    let i = 0;

    for (; i < transactionsParam.length; ) {
      const operationEnd = i + 1 * 2;
      const operation = transactionsParam.slice(i, operationEnd);
      if (operation === "") throw new Error("Failed to decode operation");

      const toEnd = operationEnd + 20 * 2;
      const _to = transactionsParam.slice(operationEnd, toEnd);
      if (_to === "") throw new Error("Failed to decode to");
      const to = "0x" + _to;

      const valueEnd = toEnd + 32 * 2;
      const _value = transactionsParam.slice(toEnd, valueEnd);
      if (_value === "") throw new Error("Failed to decode value");
      const value = hexToBigInt(startHexWith0x(_value)).toString();

      const dataLengthEnd = valueEnd + 32 * 2;
      const _dataLength = transactionsParam.slice(valueEnd, dataLengthEnd);
      if (_dataLength === "") throw new Error("Failed to decode dataLength");
      const dataLength = hexToBigInt(startHexWith0x(_dataLength)).toString();

      const dataEnd = dataLengthEnd + parseInt(dataLength) * 2;
      const _data = transactionsParam.slice(dataLengthEnd, dataEnd);
      if (parseInt(dataLength) !== 0 && _data === "") throw new Error("Failed to decode data");
      const data = "0x" + _data;

      txs.push([operation, to, value, dataLength, data]);
      i = dataEnd;
    }

    if (i == 0 || i !== transactionsParam.length) {
      throw new Error("Failed to decode as SafeMultiSend");
    }

    return {
      txType: "safeMultiSend",
      name: "",
      args: new Result(txs),
      signature: "transactions(tuple(uint256,address,uint256,uint256,bytes)[])",
      selector: "",
      value: BigInt(0),
      fragment: {
        name: "SafeMultiSend transactions",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
          {
            name: "",
            type: "tuple(address,uint256,bytes)[]",
            baseType: "array",
            arrayLength: -1,
            arrayChildren: {
              name: "",
              type: "tuple(address,uint256,bytes)",
              baseType: "tuple",
              components: [
                { name: "to", type: "address", indexed: null, components: null, arrayLength: null, arrayChildren: null, baseType: "address" },
                { name: "value", type: "uint256", indexed: null, components: null, arrayLength: null, arrayChildren: null, baseType: "uint256" },
                { name: "data", type: "bytes", indexed: null, components: null, arrayLength: null, arrayChildren: null, baseType: "bytes" },
              ],
            },
          },
        ],
        outputs: [],
      },
    };
  } catch {
    throw new Error("Failed to decode as SafeMultiSend");
  }
};

const decodeByGuessingFunctionFragment = (calldata: string) => {
  const selector = calldata.slice(0, 10);
  try {
    const frag = guessFragment(calldata);
    if (!frag) throw new Error("Failed to guess function fragment");
    const paramTypes = frag.format();
    const fragment = FunctionFragment.from(paramTypes);
    const abiCoder = AbiCoder.defaultAbiCoder();
    const decoded = abiCoder.decode(fragment.inputs, "0x" + calldata.substring(10));
    return {
      name: "",
      args: decoded,
      signature: `abi.encode${fragment.inputs.map((input) => input.type).join(",")}`,
      selector: selector,
      value: BigInt(0),
      fragment,
    } satisfies TransactionDescription;
  } catch {
    throw new Error("Failed to decode by guessing function fragment");
  }
};

const decodeABIEncodedData = (calldata: string) => {
  const selector = calldata.slice(0, 10);
  try {
    const paramTypes = guessAbiEncodedData(calldata);
    if (!paramTypes) throw new Error("Failed to guess ABI encoded data");
    const abiCoder = AbiCoder.defaultAbiCoder();
    const decoded = abiCoder.decode(paramTypes, calldata);
    if (decoded.length === 1 && decoded[0] === calldata) {
      throw new Error("Failed to decode ABI encoded data");
    }
    return {
      name: "",
      args: decoded,
      signature: "abi.encode",
      selector: selector,
      value: BigInt(0),
      fragment: FunctionFragment.from({
        inputs: paramTypes,
        name: "__abi_decoded__",
        outputs: [],
        type: "function",
        stateMutability: "nonpayable",
      }),
    } satisfies TransactionDescription;
  } catch {
    throw new Error("Failed to decode ABI encoded data");
  }
};

const decodeUniversalRouterPath = (calldata: string) => {
  try {
    const path = calldata.slice(2);
    const tokenAEnd = 20 * 2;
    const tokenA = "0x" + path.slice(0, tokenAEnd);
    const feeEnd = tokenAEnd + 3 * 2;
    const fee = hexToBigInt(startHexWith0x(path.slice(tokenAEnd, feeEnd))).toString();
    const tokenBEnd = feeEnd + 20 * 2;
    const tokenB = "0x" + path.slice(feeEnd, tokenBEnd);
    if (tokenBEnd !== path.length) {
      throw new Error("Failed to decode as UniversalRouter path");
    }
    return {
      name: "",
      args: new Result(tokenA, fee, tokenB),
      signature: "path(address,uint24,address)",
      selector: "",
      fragment: {
        name: "path",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
          { name: "tokenA", type: "address", indexed: null, components: null, arrayLength: null, arrayChildren: null, baseType: "address", _isParamType: true },
          { name: "fee", type: "uint24", indexed: null, components: null, arrayLength: null, arrayChildren: null, baseType: "uint24", _isParamType: true },
          { name: "tokenB", type: "address", indexed: null, components: null, arrayLength: null, arrayChildren: null, baseType: "address", _isParamType: true },
        ],
        outputs: [],
      },
    };
  } catch {
    throw new Error("Failed to decode as UniversalRouter path");
  }
};

const decodeUniversalRouterCommands = (calldata: string) => {
  const commandByteToString: { [command: string]: string } = {
    "00": "V3_SWAP_EXACT_IN",
    "01": "V3_SWAP_EXACT_OUT",
    "02": "PERMIT2_TRANSFER_FROM",
    "03": "PERMIT2_PERMIT_BATCH",
    "04": "SWEEP",
    "05": "TRANSFER",
    "06": "PAY_PORTION",
    "08": "V2_SWAP_EXACT_IN",
    "09": "V2_SWAP_EXACT_OUT",
    "0a": "PERMIT2_PERMIT",
    "0b": "WRAP_ETH",
    "0c": "UNWRAP_WETH",
    "0d": "PERMIT2_TRANSFER_FROM_BATCH",
    "0e": "BALANCE_CHECK_ERC20",
    "10": "SEAPORT_V1_5",
    "11": "LOOKS_RARE_V2",
    "12": "NFTX",
    "13": "CRYPTOPUNKS",
    "15": "OWNER_CHECK_721",
    "16": "OWNER_CHECK_1155",
    "17": "SWEEP_ERC721",
    "18": "X2Y2_721",
    "19": "SUDOSWAP",
    "1a": "NFT20",
    "1b": "X2Y2_1155",
    "1c": "FOUNDATION",
    "1d": "SWEEP_ERC1155",
    "1e": "ELEMENT_MARKET",
    "20": "SEAPORT_V1_4",
    "21": "EXECUTE_SUB_PLAN",
    "22": "APPROVE_ERC20",
  };

  try {
    const commandsBytes = calldata.slice(2);
    const commands: string[] = [];
    for (let i = 0; i < commandsBytes.length; i += 2) {
      const command = commandByteToString[commandsBytes.slice(i, i + 2)];
      if (command === undefined) {
        throw new Error("Failed to decode as UniversalRouter commands");
      }
      commands.push(command);
    }
    return {
      name: "",
      args: new Result(commands),
      signature: "commands(string[])",
      selector: "",
      value: BigInt(0),
      fragment: {
        name: "",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
          {
            name: "commands",
            type: "string[]",
            indexed: null,
            components: null,
            arrayLength: -1,
            arrayChildren: {
              name: null,
              type: "string",
              indexed: null,
              components: null,
              arrayLength: null,
              arrayChildren: null,
              baseType: "string",
              _isParamType: true,
            },
            baseType: "array",
            _isParamType: true,
          },
        ],
        outputs: [],
      },
    };
  } catch {
    throw new Error("Failed to decode as UniversalRouter commands");
  }
};

const decodeAsUtf8Text = (calldata: string) => {
  try {
    const hexData = calldata.startsWith("0x") ? calldata : `0x${calldata}`;
    if (hexData.length < 4) {
      throw new Error("Calldata too short");
    }
    const text = hexToString(hexData as Hex);
    if (!text || text.length === 0) {
      throw new Error("Empty text");
    }
    const printableCount = [...text].filter((char) => {
      const code = char.charCodeAt(0);
      return (code >= 32 && code <= 126) || code === 9 || code === 10 || code === 13 || code > 127;
    }).length;
    const printableRatio = printableCount / text.length;
    if (printableRatio < 0.8) {
      throw new Error("Low printable character ratio");
    }
    if (text.includes("\0")) {
      throw new Error("Contains null bytes");
    }
    return {
      txType: "utf8TextMessage",
      name: "UTF-8 Text Message",
      args: new Result(text),
      signature: "text(string)",
      selector: "",
      value: BigInt(0),
      fragment: {
        name: "UTF-8 Text Message",
        type: "function",
        stateMutability: "nonpayable",
        inputs: [
          { name: "text", type: "string", indexed: null, components: null, arrayLength: null, arrayChildren: null, baseType: "string", _isParamType: true },
        ],
        outputs: [],
      },
    };
  } catch {
    throw new Error("Failed to decode as UTF-8 text");
  }
};

// =============================================================================
// FUNCTION SIGNATURE LOOKUP
// =============================================================================

export async function fetchFunctionInterface({
  selector,
}: {
  selector: string;
}): Promise<string | null> {
  // Skip lookup for empty / non-4-byte selectors — the sourcify endpoint
  // 500s on `function=0x` (raw native transfers or other empty-calldata
  // params hit this when the decoder recurses into bytes fields).
  if (!selector || selector === "0x" || selector.length !== 10) {
    return null;
  }
  const sourcifyData = await fetchFunctionFromSourcify({ selector });
  let result: string | null = null;
  if (sourcifyData) {
    result = sourcifyData[0].name;
  } else {
    const fourByteData = await fetchFunctionFrom4Bytes({ selector });
    if (fourByteData) {
      result = fourByteData[0].text_signature;
    }
  }
  return result;
}

async function fetchFunctionFromSourcify({ selector }: { selector: string }) {
  try {
    const requestUrl = new URL(
      FOURBYTE_SOURCIFY_LOOKUP_URL
    );
    requestUrl.searchParams.append("function", selector);
    const { response, data } = await fetchJsonBounded(
      requestUrl,
      { method: "GET" },
      { timeoutMs: 5_000, maxBytes: 256 * 1024 },
    );
    if (!response.ok || !data || typeof data !== "object") return null;
    const payload = data as any;
    // Runtime check replacing zod schema
    if (
      typeof payload.ok !== "boolean" ||
      !payload.ok ||
      !payload.result?.function?.[selector]
    ) {
      return null;
    }
    return payload.result.function[selector] as Array<{ name: string; filtered: boolean }>;
  } catch {
    return null;
  }
}

async function fetchFunctionFrom4Bytes({ selector }: { selector: string }) {
  try {
    const requestUrl = new URL(
      FOURBYTE_DIRECTORY_API_URL
    );
    requestUrl.searchParams.append("hex_signature", selector);
    const { response, data } = await fetchJsonBounded(
      requestUrl,
      { method: "GET" },
      { timeoutMs: 5_000, maxBytes: 256 * 1024 },
    );
    if (!response.ok || !data || typeof data !== "object") return null;
    const payload = data as any;
    // Runtime check replacing zod schema
    if (typeof payload.count !== "number" || payload.count === 0 || !Array.isArray(payload.results)) {
      return null;
    }
    return payload.results as Array<{ text_signature: string }>;
  } catch {
    return null;
  }
}

// =============================================================================
// ABI-BASED DECODING UTILITIES
// =============================================================================

function decodeAllPossibilities({
  functionSignatures,
  calldata,
}: {
  functionSignatures: string[];
  calldata: string;
}) {
  const results: TransactionDescription[] = [];
  for (const signature of functionSignatures) {
    try {
      const parsedTransaction = decodeWithABI({
        abi: [`function ${signature}`],
        calldata,
      });
      if (parsedTransaction) {
        results.push(parsedTransaction);
      }
    } catch {
      // skip
    }
  }
  return results;
}

export function decodeWithABI({
  abi,
  calldata,
}: {
  abi: InterfaceAbi;
  calldata: string;
}): TransactionDescription | null {
  const abiInterface = new Interface(abi);
  const parsedTransaction = abiInterface.parseTransaction({ data: calldata });
  return parsedTransaction;
}

const _decodeWithSelector = async (calldata: string) => {
  const selector = calldata.slice(0, 10);
  if (selector === "0x00000000") {
    throw new Error("Skipping null selector");
  }
  try {
    const fnInterface = await fetchFunctionInterface({ selector });
    if (!fnInterface) {
      throw new Error("");
    }
    const decodedTransactions = decodeAllPossibilities({
      functionSignatures: [fnInterface],
      calldata,
    });
    if (decodedTransactions.length === 0) {
      throw new Error("Failed to decode with function signature");
    }
    return decodedTransactions[0];
  } catch {
    throw new Error(`Failed to find function interface for selector ${selector}`);
  }
};

// =============================================================================
// RECURSIVE DECODING (Main Entry Point)
// =============================================================================

export async function decodeRecursive({
  calldata,
  address,
  chainId,
  abi,
  encodedAbi,
  _depth = 0,
}: {
  calldata: string;
  address?: string;
  chainId?: number;
  abi?: any;
  encodedAbi?: any;
  _depth?: number;
}): Promise<DecodeRecursiveResult> {
  let parsedTransaction: ParsedTransaction | null;

  if (encodedAbi) {
    parsedTransaction = decodeWithABI({ abi: encodedAbi, calldata });
  } else if (abi) {
    parsedTransaction = decodeWithABI({ abi, calldata });
  } else if (address && chainId) {
    parsedTransaction = await decodeWithAddress({ calldata, address, chainId, _depth });
  } else {
    parsedTransaction = await decodeWithSelector({ calldata, _depth });
  }

  if (parsedTransaction) {
    // Safe MultiSend
    if (parsedTransaction.txType === "safeMultiSend") {
      return {
        functionName: parsedTransaction.fragment.name,
        signature: parsedTransaction.signature,
        rawArgs: parsedTransaction.args,
        args: await Promise.all(
          parsedTransaction.args[0].map(async (tx: string[], i: number) => {
            const operation = tx[0];
            const to = tx[1];
            const value = tx[2];
            const txCalldata = tx[4];

            const operationIdToName: { [key: number]: string } = {
              0: "CALL",
              1: "DELEGATECALL",
              2: "CREATE",
            };

            const _encodedAbi = [
              {
                name: "tx",
                type: "function",
                stateMutability: "nonpayable",
                inputs: [
                  { name: "OperationType", type: "string" },
                  { name: "to", type: "address" },
                  { name: "value", type: "uint256" },
                  { name: "calldata", type: "bytes" },
                ],
                outputs: [],
              },
            ] as const;

            const encodedCalldata = await encodeFunctionData({
              abi: _encodedAbi,
              functionName: "tx",
              args: [
                operationIdToName[Number(operation)],
                to as Hex,
                BigInt(value),
                txCalldata as Hex,
              ],
            });

            const fragment = FunctionFragment.from({
              name: "tx",
              type: "function",
              stateMutability: "nonpayable",
              inputs: [{ name: "encodedCalldata", type: "bytes" }],
              outputs: [],
            });

            return {
              name: `tx #${i}`,
              baseType: "bytes",
              type: "bytes",
              rawValue: `${to}, ${value}, ${txCalldata}`,
              value: await decodeParamTypes({
                input: fragment.inputs[0],
                value: encodedCalldata,
                address: to,
                chainId,
                encodedAbi: _encodedAbi,
                _depth,
              }),
            };
          })
        ),
      };
    }

    // ERC-7821 Execute
    else if (parsedTransaction.txType === "7821Execute") {
      return {
        functionName: parsedTransaction.fragment.name,
        signature: parsedTransaction.signature,
        rawArgs: parsedTransaction.args,
        args: await Promise.all(
          parsedTransaction.args[0].map(async (tx: string[], i: number) => {
            const to = tx[0];
            const value = tx[1];
            const txCalldata = tx[2];

            const _encodedAbi = [
              {
                name: "tx",
                type: "function",
                stateMutability: "nonpayable",
                inputs: [
                  { name: "to", type: "address" },
                  { name: "value", type: "uint256" },
                  { name: "calldata", type: "bytes" },
                ],
                outputs: [],
              },
            ] as const;

            const encodedCalldata = await encodeFunctionData({
              abi: _encodedAbi,
              functionName: "tx",
              args: [to as Hex, BigInt(value), txCalldata as Hex],
            });

            const fragment = FunctionFragment.from({
              name: "tx",
              type: "function",
              stateMutability: "nonpayable",
              inputs: [{ name: "encodedCalldata", type: "bytes" }],
              outputs: [],
            });

            return {
              name: `tx #${i}`,
              baseType: "bytes",
              type: "bytes",
              rawValue: `${to}, ${value}, ${txCalldata}`,
              value: await decodeParamTypes({
                input: fragment.inputs[0],
                value: encodedCalldata,
                address: to,
                chainId,
                encodedAbi: _encodedAbi,
                _depth,
              }),
            };
          })
        ),
      };
    }

    // Standard function call
    else {
      return {
        functionName: parsedTransaction.fragment.name,
        signature: parsedTransaction.signature,
        rawArgs: parsedTransaction.args,
        args: await Promise.all(
          parsedTransaction.fragment.inputs.map(async (input, i) => {
            const value = parsedTransaction!.args[i];
            return {
              name: input.name,
              baseType: input.baseType,
              type: input.type,
              rawValue: value,
              value: await decodeParamTypes({
                input,
                value,
                address,
                chainId,
                abi,
                _depth,
              }),
            };
          })
        ),
      };
    }
  } else {
    return null;
  }
}

// =============================================================================
// PARAMETER TYPE DECODERS
// =============================================================================

const decodeParamTypes = async ({
  input,
  value,
  address,
  chainId,
  abi,
  encodedAbi,
  _depth = 0,
}: {
  input: ParamType;
  value: any;
  address?: string;
  chainId?: number;
  abi?: any;
  encodedAbi?: any;
  _depth?: number;
}): Promise<DecodeParamTypesResult> => {
  if (input.baseType.includes("int")) {
    return BigInt(value).toString();
  } else if (input.baseType === "address") {
    return value;
  } else if (input.baseType.includes("bytes")) {
    return await decodeBytesParam({ value, address, chainId, abi, encodedAbi, _depth });
  } else if (input.baseType === "tuple") {
    return await decodeTupleParam({ input, value, address, chainId, abi, _depth });
  } else if (input.baseType === "array") {
    return await decodeArrayParam({ value, input, address, chainId, abi, _depth });
  } else {
    return value;
  }
};

const decodeBytesParam = async ({
  value,
  address,
  chainId,
  abi,
  encodedAbi,
  _depth = 0,
}: {
  value: any;
  address?: string;
  chainId?: number;
  abi?: any;
  encodedAbi?: any;
  _depth?: number;
}): Promise<DecodeBytesParamResult> => {
  return {
    decoded: await decodeRecursive({
      calldata: value,
      address,
      chainId,
      abi,
      encodedAbi,
      _depth: _depth + 1,
    }),
  };
};

const decodeTupleParam = async ({
  input,
  value,
  address,
  chainId,
  abi,
  _depth = 0,
}: {
  input: ParamType;
  value: any;
  address?: string;
  chainId?: number;
  abi?: any;
  _depth?: number;
}): Promise<DecodeTupleParamResult> => {
  if (!input.components || input.components.length === 0) {
    return null;
  }
  return await Promise.all(
    input.components.map(async (component, i) => {
      return {
        name: component.name,
        baseType: component.baseType,
        type: component.type,
        rawValue: value[i],
        value: await decodeParamTypes({
          input: component,
          value: value[i],
          address,
          chainId,
          abi,
          _depth,
        }),
      };
    })
  );
};

const decodeArrayParam = async ({
  value,
  input,
  address,
  chainId,
  abi,
  _depth = 0,
}: {
  value: any;
  input: ParamType;
  address?: string;
  chainId?: number;
  abi?: any;
  _depth?: number;
}): Promise<DecodeArrayParamResult> => {
  if (!Array.isArray(value) || value.length === 0) {
    return [];
  }
  return await Promise.all(
    value.map(async (v: any) => {
      return {
        name: input.arrayChildren!.name,
        baseType: input.arrayChildren!.baseType,
        type: input.arrayChildren!.type,
        rawValue: v,
        value: await decodeParamTypes({
          input: input.arrayChildren!,
          value: v,
          address,
          chainId,
          abi,
          _depth,
        }),
      };
    })
  );
};
