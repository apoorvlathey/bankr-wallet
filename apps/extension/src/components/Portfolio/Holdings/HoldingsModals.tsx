import EditCustomTokenModal from "@/components/EditCustomTokenModal";
import HideTokenModal from "@/components/HideTokenModal";
import type { PortfolioLoader } from "./useHoldingsLifecycle";
import type { TokenManagement } from "./useTokenManagement";

interface HoldingsModalsProps {
  loadPortfolio: PortfolioLoader;
  management: TokenManagement;
}

export function HoldingsModals({
  loadPortfolio,
  management,
}: HoldingsModalsProps) {
  return (
    <>
      <EditCustomTokenModal
        isOpen={management.editModal.isOpen}
        onClose={management.editModal.onClose}
        onUpdated={() => loadPortfolio(true, { forceSnapshot: true })}
        token={management.editingToken}
      />
      <HideTokenModal
        isOpen={!!management.tokenToHide}
        token={management.tokenToHide}
        isLoading={management.hidingToken}
        onClose={management.closeHideTokenModal}
        onConfirm={management.confirmHideToken}
      />
    </>
  );
}
