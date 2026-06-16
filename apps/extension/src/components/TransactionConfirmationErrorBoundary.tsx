import { Component, type ReactNode } from "react";
import TransactionConfirmationErrorFallback from "./TransactionConfirmationErrorFallback";

interface TransactionConfirmationErrorBoundaryProps {
  txId: string;
  totalCount: number;
  onRejected: () => void;
  onRejectAll: () => void;
  onBeforeReject?: () => void;
  children: ReactNode;
}

interface TransactionConfirmationErrorBoundaryState {
  hasError: boolean;
  txId: string;
}

export default class TransactionConfirmationErrorBoundary extends Component<
  TransactionConfirmationErrorBoundaryProps,
  TransactionConfirmationErrorBoundaryState
> {
  state: TransactionConfirmationErrorBoundaryState = {
    hasError: false,
    txId: this.props.txId,
  };

  static getDerivedStateFromError(): Partial<TransactionConfirmationErrorBoundaryState> {
    return { hasError: true };
  }

  static getDerivedStateFromProps(
    props: TransactionConfirmationErrorBoundaryProps,
    state: TransactionConfirmationErrorBoundaryState,
  ): Partial<TransactionConfirmationErrorBoundaryState> | null {
    if (props.txId === state.txId) return null;
    return { hasError: false, txId: props.txId };
  }

  componentDidCatch() {
    // Deliberately avoid logging dapp-provided transaction data here.
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <TransactionConfirmationErrorFallback
        txId={this.props.txId}
        totalCount={this.props.totalCount}
        onRejected={this.props.onRejected}
        onRejectAll={this.props.onRejectAll}
        onBeforeReject={this.props.onBeforeReject}
      />
    );
  }
}
