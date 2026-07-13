type Hex = `0x${string}`;
type Address = Hex;

export const ERC7710_ROOT_AUTHORITY =
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff" as const;

export const ERC7710_DELEGATION_MANAGER =
  "0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3" as const;

export const ERC7710_EMPTY_CAVEAT_ARGS = "0x" as const;

export const METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS = {
  ERC20PeriodTransferEnforcer:
    "0x474e3Ae7E169e940607cC624Da8A15Eb120139aB",
  ERC20StreamingEnforcer: "0x56c97aE02f233B29fa03502Ecc0457266d9be00e",
  ERC20TransferAmountEnforcer:
    "0xf100b0819427117EcF76Ed94B358B1A5b5C6D2Fc",
  ApprovalRevocationEnforcer:
    "0xe264F1f09A19505a1ca1a86D5b01E8bFdb64324A",
  ExactCalldataEnforcer: "0x99F2e9bF15ce5eC84685604836F71aB835DBBdED",
  NativeTokenPeriodTransferEnforcer:
    "0x9BC0FAf4Aca5AE429F4c06aEEaC517520CB16BD9",
  NativeTokenStreamingEnforcer:
    "0xD10b97905a320b13a0608f7E9cC506b56747df19",
  NativeTokenTransferAmountEnforcer:
    "0xF71af580b9c3078fbc2BBF16FbB8EEd82b330320",
  NonceEnforcer: "0xDE4f2FAC4B3D87A1d9953Ca5FC09FCa7F366254f",
  TimestampEnforcer: "0x1046bb45C8d673d4ea75321280DB34899413c069",
  ValueLteEnforcer: "0x92Bf12322527cAA612fd31a0e810472BBB106A8F",
} as const satisfies Record<string, Address>;

export type Erc7715MappedCaveat = {
  enforcerName: keyof typeof METAMASK_DELEGATOR_V1_3_CAVEAT_ENFORCERS;
  enforcer: Address;
  terms: Hex;
  args: typeof ERC7710_EMPTY_CAVEAT_ARGS;
};
