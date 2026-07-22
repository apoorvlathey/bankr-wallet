import { useEffect, useMemo, useState } from "react";
import type { CompletedTransaction, GasData } from "@/chrome/txHistoryStorage";
import { fetchRpcResult } from "@/chrome/network/rpcClient";
import { OP_STACK_CHAIN_IDS } from "@/constants/networks";
import { getStoredRpcUrl } from "@/lib/chains";

type RpcQuantity = string | number | bigint;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isRpcQuantity(value: unknown): value is RpcQuantity {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  );
}

export function useGasData({
  isOpen,
  tx,
}: {
  isOpen: boolean;
  tx: CompletedTransaction;
}) {
  const [gasData, setGasData] = useState<GasData | undefined>(tx.gasData);

  useEffect(() => {
    setGasData(tx.gasData);

    if (
      tx.erc20FeePayment ||
      tx.gasData ||
      !tx.txHash ||
      tx.status !== "success" ||
      !isOpen
    ) return;

    let cancelled = false;

    (async () => {
      const rpcUrl = await getStoredRpcUrl(tx.chainId);
      if (!rpcUrl || cancelled) return;

      try {
        const rpcCall = (method: string, params: any[]) =>
          fetchRpcResult(rpcUrl, method, params, {
            allowPrivateWithoutOrigin: true,
          });

        const [txResult, receiptResult] = await Promise.all([
          rpcCall("eth_getTransactionByHash", [tx.txHash]),
          rpcCall("eth_getTransactionReceipt", [tx.txHash]),
        ]);
        if (!isRecord(receiptResult) || cancelled) return;
        const txData = isRecord(txResult) ? txResult : undefined;
        const receipt = receiptResult;
        if (
          !isRpcQuantity(receipt.gasUsed) ||
          !isRpcQuantity(receipt.effectiveGasPrice)
        ) {
          return;
        }

        const data: GasData = {
          gasUsed: BigInt(receipt.gasUsed).toString(),
          gasLimit: isRpcQuantity(txData?.gas)
            ? BigInt(txData.gas).toString()
            : BigInt(receipt.gasUsed).toString(),
          effectiveGasPrice: BigInt(receipt.effectiveGasPrice).toString(),
        };

        if (OP_STACK_CHAIN_IDS.has(tx.chainId)) {
          if (isRpcQuantity(receipt.l1Fee)) {
            data.l1Fee = BigInt(receipt.l1Fee).toString();
          }
          if (isRpcQuantity(receipt.l1GasUsed)) {
            data.l1GasUsed = BigInt(receipt.l1GasUsed).toString();
          }
          if (isRpcQuantity(receipt.l1GasPrice)) {
            data.l1GasPrice = BigInt(receipt.l1GasPrice).toString();
          }
        }

        if (!cancelled) setGasData(data);
      } catch {
        // Gas receipt enrichment is non-critical.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    tx.id,
    tx.gasData,
    tx.txHash,
    tx.status,
    tx.chainId,
    tx.erc20FeePayment,
    isOpen,
  ]);

  const derived = useMemo(() => {
    const txFee = gasData && !tx.erc20FeePayment
      ? (
          BigInt(gasData.gasUsed) * BigInt(gasData.effectiveGasPrice) +
          BigInt(gasData.l1Fee || "0")
        ).toString()
      : undefined;
    const gasUsagePercent = gasData
      ? ((Number(gasData.gasUsed) / Number(gasData.gasLimit)) * 100).toFixed(2)
      : undefined;
    const setGas = tx.tx.gas;
    const setMaxFee = tx.tx.maxFeePerGas;
    const setPriority = tx.tx.maxPriorityFeePerGas;
    const setGasPrice = tx.tx.gasPrice;
    const hasSetGasParams = !!(
      setGas ||
      setMaxFee ||
      setPriority ||
      setGasPrice
    );
    let estimatedMaxCost: string | undefined;
    if (setGas && !tx.erc20FeePayment) {
      const price = setMaxFee || setGasPrice;
      if (price) {
        try {
          estimatedMaxCost = (BigInt(setGas) * BigInt(price)).toString();
        } catch {
          estimatedMaxCost = undefined;
        }
      }
    }

    return {
      txFee,
      gasUsagePercent,
      setGas,
      setMaxFee,
      setPriority,
      setGasPrice,
      hasSetGasParams,
      estimatedMaxCost,
    };
  }, [gasData, tx.tx, tx.erc20FeePayment]);

  return {
    gasData,
    isL2: OP_STACK_CHAIN_IDS.has(tx.chainId),
    ...derived,
  };
}
