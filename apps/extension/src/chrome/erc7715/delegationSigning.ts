import { encodeAbiParameters, encodeFunctionData, getAddress, keccak256 } from "viem";
import { bytesToHex } from "../cryptoUtils";
import {
  ERC7710_DELEGATION_MANAGER,
  ERC7710_ROOT_AUTHORITY,
  type Erc7715MappedCaveat,
} from "./caveatDefinitions";
import type {
  Address,
  Erc7710Delegation,
  Erc7710DelegationTypedData,
  Hex,
} from "./types";

const ERC7710_DELEGATION_TYPES: Erc7710DelegationTypedData["types"] = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
    { name: "verifyingContract", type: "address" },
  ],
  Delegation: [
    { name: "delegate", type: "address" },
    { name: "delegator", type: "address" },
    { name: "authority", type: "bytes32" },
    { name: "caveats", type: "Caveat[]" },
    { name: "salt", type: "uint256" },
  ],
  Caveat: [
    { name: "enforcer", type: "address" },
    { name: "terms", type: "bytes" },
  ],
};

const ERC7710_DELEGATION_TYPEHASH =
  "0x88c1d2ecf185adf710588203a5f263f0ff61be0d33da39792cde19ba9aa4331e" as const;
const ERC7710_CAVEAT_TYPEHASH =
  "0x80ad7e1b04ee6d994a125f4714ca0720908bd80ed16063ec8aee4b88e9253e2d" as const;

const DELEGATION_CONTEXT_ABI = [
  {
    type: "tuple[]",
    components: [
      { name: "delegate", type: "address" },
      { name: "delegator", type: "address" },
      { name: "authority", type: "bytes32" },
      {
        name: "caveats",
        type: "tuple[]",
        components: [
          { name: "enforcer", type: "address" },
          { name: "terms", type: "bytes" },
          { name: "args", type: "bytes" },
        ],
      },
      { name: "salt", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
  },
] as const;

const DELEGATION_MANAGER_ABI = [
  {
    type: "function",
    name: "disableDelegation",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "_delegation",
        type: "tuple",
        components: [
          { name: "delegate", type: "address" },
          { name: "delegator", type: "address" },
          { name: "authority", type: "bytes32" },
          {
            name: "caveats",
            type: "tuple[]",
            components: [
              { name: "enforcer", type: "address" },
              { name: "terms", type: "bytes" },
              { name: "args", type: "bytes" },
            ],
          },
          { name: "salt", type: "uint256" },
          { name: "signature", type: "bytes" },
        ],
      },
    ],
    outputs: [],
  },
] as const;

function checksumAddress(address: Address): Address {
  return getAddress(address) as Address;
}

function stripHexPrefix(value: Hex): string {
  return value.slice(2);
}

function concatHex(parts: Hex[]): Hex {
  return `0x${parts.map(stripHexPrefix).join("")}` as Hex;
}

export function randomSaltHex(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${bytesToHex(bytes)}` as Hex;
}

export function buildErc7710DelegationTypedData({
  chainId,
  delegator,
  delegate,
  caveats,
  salt,
}: {
  chainId: number;
  delegator: Address;
  delegate: Address;
  caveats: Erc7715MappedCaveat[];
  salt: Hex;
}): Erc7710DelegationTypedData {
  return {
    types: ERC7710_DELEGATION_TYPES,
    primaryType: "Delegation",
    domain: {
      name: "DelegationManager",
      version: "1",
      chainId,
      verifyingContract: ERC7710_DELEGATION_MANAGER,
    },
    message: {
      delegate: checksumAddress(delegate),
      delegator: checksumAddress(delegator),
      authority: ERC7710_ROOT_AUTHORITY,
      caveats: caveats.map((caveat) => ({
        enforcer: checksumAddress(caveat.enforcer),
        terms: caveat.terms,
      })),
      salt: BigInt(salt).toString(),
    },
  };
}

export function buildSignedErc7710Delegation({
  typedData,
  caveats,
  salt,
  signature,
}: {
  typedData: Erc7710DelegationTypedData;
  caveats: Erc7715MappedCaveat[];
  salt: Hex;
  signature: Hex;
}): Erc7710Delegation {
  return {
    delegate: typedData.message.delegate,
    delegator: typedData.message.delegator,
    authority: typedData.message.authority,
    caveats: caveats.map((caveat) => ({
      enforcer: checksumAddress(caveat.enforcer),
      terms: caveat.terms,
      args: caveat.args,
    })),
    salt,
    signature,
  };
}

export function encodeErc7710DelegationContext(
  delegations: Erc7710Delegation[],
): Hex {
  return encodeAbiParameters(
    DELEGATION_CONTEXT_ABI,
    [
      delegations.map((delegation) => ({
        delegate: delegation.delegate,
        delegator: delegation.delegator,
        authority: delegation.authority,
        caveats: delegation.caveats.map((caveat) => ({
          enforcer: caveat.enforcer,
          terms: caveat.terms,
          args: caveat.args,
        })),
        salt: BigInt(delegation.salt),
        signature: delegation.signature,
      })),
    ],
  );
}

export function encodeDisableErc7710Delegation(
  delegation: Erc7710Delegation,
): Hex {
  return encodeFunctionData({
    abi: DELEGATION_MANAGER_ABI,
    functionName: "disableDelegation",
    args: [
      {
        delegate: checksumAddress(delegation.delegate),
        delegator: checksumAddress(delegation.delegator),
        authority: delegation.authority,
        caveats: delegation.caveats.map((caveat) => ({
          enforcer: checksumAddress(caveat.enforcer),
          terms: caveat.terms,
          args: caveat.args,
        })),
        salt: BigInt(delegation.salt),
        signature: delegation.signature,
      },
    ],
  }) as Hex;
}

function hashErc7710Caveat(
  caveat: Erc7710Delegation["caveats"][number],
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "bytes32" },
      ],
      [
        ERC7710_CAVEAT_TYPEHASH,
        checksumAddress(caveat.enforcer),
        keccak256(caveat.terms),
      ],
    ),
  );
}

function hashErc7710Caveats(
  caveats: Erc7710Delegation["caveats"],
): Hex {
  return keccak256(concatHex(caveats.map(hashErc7710Caveat)));
}

export function hashErc7710Delegation(
  delegation: Erc7710Delegation,
): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "address" },
        { type: "address" },
        { type: "bytes32" },
        { type: "bytes32" },
        { type: "uint256" },
      ],
      [
        ERC7710_DELEGATION_TYPEHASH,
        checksumAddress(delegation.delegate),
        checksumAddress(delegation.delegator),
        delegation.authority,
        hashErc7710Caveats(delegation.caveats),
        BigInt(delegation.salt),
      ],
    ),
  );
}

export function hashErc7715PermissionContext(context: Hex): Hex {
  return keccak256(context);
}
