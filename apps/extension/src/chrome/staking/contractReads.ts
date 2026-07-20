import { DRIP_ADDRESSES } from "@walletchan/contract-addresses";
import { isAddress } from "viem";
import { createSwapPublicClient } from "../swap/rpcClient";
import { stakingErc20Abi, wchanVaultAbi } from "./abi";

const BASE_CHAIN_ID = 8453;
const addresses = DRIP_ADDRESSES[BASE_CHAIN_ID];

export interface WchanStakingState {
  wchanBalance: string;
  stakedBalance: string;
  allowance: string;
  penaltyBps: string;
  lastDepositTimestamp: string;
  earnedWeth: string;
  previewAmount: string | null;
}

export async function getWchanStakingState(input: {
  owner: unknown;
  previewMode?: unknown;
  previewAmount?: unknown;
}): Promise<WchanStakingState> {
  if (typeof input.owner !== "string" || !isAddress(input.owner)) {
    throw new Error("A valid staking account address is required");
  }
  const owner = input.owner as `0x${string}`;
  const previewMode = input.previewMode === "unstake" ? "unstake" : "stake";
  const previewAmount = parsePreviewAmount(input.previewAmount);
  const client = await createSwapPublicClient(BASE_CHAIN_ID);
  if (!client) throw new Error("Base RPC is not configured");

  const common = { chainId: BASE_CHAIN_ID } as const;
  const [wchanBalance, stakedBalance, allowance, penaltyBps, lastDepositTimestamp, earnedWeth] =
    await Promise.all([
      client.readContract({ ...common, address: addresses.wchan, abi: stakingErc20Abi, functionName: "balanceOf", args: [owner] }),
      client.readContract({ ...common, address: addresses.wchanVault, abi: wchanVaultAbi, functionName: "balanceOf", args: [owner] }),
      client.readContract({ ...common, address: addresses.wchan, abi: stakingErc20Abi, functionName: "allowance", args: [owner, addresses.wchanVault] }),
      client.readContract({ ...common, address: addresses.wchanVault, abi: wchanVaultAbi, functionName: "getPenaltyBps", args: [owner] }),
      client.readContract({ ...common, address: addresses.wchanVault, abi: wchanVaultAbi, functionName: "lastDepositTimestamp", args: [owner] }),
      client.readContract({ ...common, address: addresses.wchanVault, abi: wchanVaultAbi, functionName: "earned", args: [owner] }),
    ]);

  const preview: bigint | null = previewAmount === null
    ? null
    : await client.readContract(
        previewMode === "stake"
          ? { ...common, address: addresses.wchanVault, abi: wchanVaultAbi, functionName: "previewDeposit", args: [previewAmount] }
          : { ...common, address: addresses.wchanVault, abi: wchanVaultAbi, functionName: "previewRedeemNet", args: [previewAmount, owner] },
      ) as bigint;

  return {
    wchanBalance: wchanBalance.toString(),
    stakedBalance: stakedBalance.toString(),
    allowance: allowance.toString(),
    penaltyBps: penaltyBps.toString(),
    lastDepositTimestamp: lastDepositTimestamp.toString(),
    earnedWeth: earnedWeth.toString(),
    previewAmount: preview?.toString() ?? null,
  };
}

function parsePreviewAmount(value: unknown): bigint | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{1,80}$/u.test(value)) {
    throw new Error("Invalid staking preview amount");
  }
  const parsed = BigInt(value);
  return parsed > 0n ? parsed : null;
}
