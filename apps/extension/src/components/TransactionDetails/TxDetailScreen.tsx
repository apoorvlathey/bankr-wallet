import { memo, useEffect, useState } from "react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { TxDetailController } from "@/components/TransactionDetails/TxDetailController";

export interface TxDetailScreenProps {
  tx: CompletedTransaction;
  onBack: () => void;
}

/** Full-screen host for the existing transaction-detail controller/content. */
function TxDetailScreen({ tx, onBack }: TxDetailScreenProps) {
  const [currentTx, setCurrentTx] = useState(tx);

  useEffect(() => setCurrentTx(tx), [tx]);

  useEffect(() => {
    const refresh = () => {
      chrome.runtime.sendMessage(
        { type: "getTxHistory" },
        (history: CompletedTransaction[] | undefined) => {
          const fresh = history?.find((entry) => entry.id === tx.id);
          if (fresh) setCurrentTx(fresh);
        },
      );
    };
    const onMessage = (message: { type?: string }) => {
      if (message.type === "txHistoryUpdated") refresh();
    };

    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, [tx.id]);

  useEffect(() => {
    if (currentTx.status !== "pending" || !currentTx.txHash) return;
    const checkReceipt = () => {
      chrome.runtime.sendMessage({
        type: "checkPendingTxReceipt",
        txId: currentTx.id,
        txHash: currentTx.txHash,
        chainId: currentTx.chainId,
      });
    };

    checkReceipt();
    const interval = window.setInterval(checkReceipt, 5_000);
    return () => window.clearInterval(interval);
  }, [
    currentTx.chainId,
    currentTx.id,
    currentTx.status,
    currentTx.txHash,
  ]);

  return (
    <TxDetailController
      isOpen
      onClose={onBack}
      tx={currentTx}
      presentation="screen"
    />
  );
}

export default memo(TxDetailScreen);
