import { VStack } from "@chakra-ui/react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import type { PendingBatchTxRequest } from "@/chrome/erc5792Types";
import AssetChangesDisplay from "@/components/AssetChangesDisplay";
import NativeValueAmount from "@/components/NativeValueAmount";
import { AssetDeltaRow } from "@/components/ui";

interface FinancialImpactProps {
  totalValueWei: bigint;
  nativeSymbol: string;
  nativeDecimals: number;
  calls: PendingBatchTxRequest["params"]["calls"];
  syntheticTxRequest: PendingTxRequest;
  isNonAtomic: boolean;
  onRevertedChange: (reverted: boolean) => void;
  onUnavailableChange: (unavailable: boolean) => void;
}

export function FinancialImpact({
  totalValueWei,
  nativeSymbol,
  nativeDecimals,
  calls,
  syntheticTxRequest,
  isNonAtomic,
  onRevertedChange,
  onUnavailableChange,
}: FinancialImpactProps) {
  return (
    <VStack spacing={0} align="stretch">
      {totalValueWei > 0n && (
        <AssetDeltaRow
          direction="send"
          asset={nativeSymbol}
          amount={
            <NativeValueAmount
              value={totalValueWei}
              symbol={nativeSymbol}
              decimals={nativeDecimals}
              fontSize="md"
              fontWeight="600"
            />
          }
          meta={`Total native value across ${calls.length} ${calls.length === 1 ? "action" : "actions"}`}
        />
      )}
      <AssetChangesDisplay
        txRequest={syntheticTxRequest}
        batchCalls={calls.map((call) => ({
          to: call.to,
          data: call.data,
          value: call.value,
        }))}
        isNonAtomic={isNonAtomic}
        onRevertedChange={onRevertedChange}
        onSimulationUnavailableChange={onUnavailableChange}
      />
    </VStack>
  );
}
