import { memo } from "react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { TxDetailController } from "./TxDetailController";

interface TxDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  tx: CompletedTransaction;
}

function TxDetailModal(props: TxDetailModalProps) {
  return <TxDetailController {...props} presentation="modal" />;
}

export default memo(TxDetailModal);
