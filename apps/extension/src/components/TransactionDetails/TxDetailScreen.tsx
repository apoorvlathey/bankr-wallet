import { memo, useEffect, useState } from "react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { TxDetailController } from "@/components/TransactionDetails/TxDetailController";
import { isPrivacyShieldCompliancePending } from "@/lib/privacyShieldLifecycle";

const PRIVACY_STATUS_REFRESH_MS = 120_000;

export interface TxDetailScreenProps {
  tx: CompletedTransaction;
  onBack: () => void;
  onUnshield?: () => void;
}

/** Full-screen host for the existing transaction-detail controller/content. */
function TxDetailScreen({ tx, onBack, onUnshield }: TxDetailScreenProps) {
  const [currentTx, setCurrentTx] = useState(tx);

  useEffect(() => setCurrentTx(tx), [tx]);

  useEffect(() => {
    const refresh = () => {
      chrome.runtime.sendMessage(
        { type: "getTxHistoryItem", txId: tx.id },
        (fresh: CompletedTransaction | null | undefined) => {
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

  useEffect(() => {
    const state = currentTx.privacyShieldMeta?.state;
    if (!state || !isPrivacyShieldCompliancePending(state)) return;
    const refreshPrivacyStatus = () => {
      void chrome.runtime.sendMessage({ type: "privacySyncShield" });
    };
    refreshPrivacyStatus();
    const interval = window.setInterval(
      refreshPrivacyStatus,
      PRIVACY_STATUS_REFRESH_MS,
    );
    return () => window.clearInterval(interval);
  }, [currentTx.privacyShieldMeta?.state]);

  return (
    <TxDetailController
      isOpen
      onClose={onBack}
      onUnshield={onUnshield}
      tx={currentTx}
      presentation="screen"
    />
  );
}

export default memo(TxDetailScreen);
