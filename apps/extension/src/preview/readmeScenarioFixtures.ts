import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import { encodeFunctionData, parseAbi } from "viem";
import type { PreviewWalletType } from "./types";

const oneInchSwapAbi = parseAbi([
  "function swap(address executor, (address srcToken, address dstToken, address srcReceiver, address dstReceiver, uint256 amount, uint256 minReturnAmount, uint256 flags) desc, bytes permit, bytes data) payable returns (uint256 returnAmount, uint256 spentAmount)",
]);
const nativeTokenSentinel =
  "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" as const;

export function createDefillamaSwapData(
  recipient: `0x${string}`,
  executor: `0x${string}`,
  srcToken: `0x${string}`,
): `0x${string}` {
  return encodeFunctionData({
    abi: oneInchSwapAbi,
    functionName: "swap",
    args: [
      executor,
      {
        srcToken,
        dstToken: nativeTokenSentinel,
        srcReceiver: recipient,
        dstReceiver: recipient,
        amount: 148_620_000n,
        minReturnAmount: 41_500_000_000_000_000n,
        flags: 0n,
      },
      "0x",
      "0x",
    ],
  });
}

export function getReadmeTxOverrides(
  scenario: string,
  walletType: PreviewWalletType,
): (Omit<Partial<PendingTxRequest>, "tx"> & {
  tx?: Partial<PendingTxRequest["tx"]>;
}) | null {
  if (scenario !== "readme-review" && scenario !== "readme-fees-usdc") {
    return null;
  }
  return {
    id: `preview-tx-${scenario}-${walletType}`,
    tx: {
      to: "0x6fF5693b99212Da76ad316178A184AB56D299b43",
      data: "0x",
      value: "0x9536c708910000",
    },
  };
}
