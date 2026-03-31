import {
  keccak256,
  concat,
  numberToHex,
  hashTypedData,
  hashDomain,
  hashStruct,
  type Hex,
} from "viem";

/**
 * ERC-8213: Calldata Digest
 * keccak256(uint256(len(calldata)) || calldata)
 */
export function computeCalldataDigest(calldata: Hex): Hex | null {
  try {
    const byteLength = (calldata.length - 2) / 2;
    const lengthHex = numberToHex(byteLength, { size: 32 });
    return keccak256(concat([lengthHex, calldata]));
  } catch {
    return null;
  }
}

/**
 * ERC-8213: EIP-712 Digest
 * keccak256("\x19\x01" || domainSeparator || hashStruct(message))
 */
export function computeEip712Digest(typedData: {
  domain: any;
  types: any;
  primaryType: string;
  message: any;
}): Hex | null {
  try {
    return hashTypedData(typedData as any);
  } catch {
    return null;
  }
}

/** ERC-8213: Domain Hash — hashStruct(eip712Domain) */
export function computeDomainHash(typedData: {
  domain: any;
  types: any;
}): Hex | null {
  try {
    return hashDomain({ domain: typedData.domain, types: typedData.types });
  } catch {
    return null;
  }
}

/** ERC-8213: Message Hash — hashStruct(primaryType, message) */
export function computeMessageHash(typedData: {
  types: any;
  primaryType: string;
  message: any;
}): Hex | null {
  try {
    return hashStruct({
      data: typedData.message,
      primaryType: typedData.primaryType,
      types: typedData.types,
    } as any);
  } catch {
    return null;
  }
}
