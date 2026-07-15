import type {
  Erc7715PermissionRequest,
  PendingErc7715PermissionRequest,
} from "@/chrome/pendingErc7715PermissionStorage";
import type { Erc7715PermissionAsset } from "./useErc7715PermissionAsset";

export interface Erc7715PermissionConfirmationProps {
  permissionRequest: PendingErc7715PermissionRequest;
  currentIndex: number;
  totalCount: number;
  isInSidePanel: boolean;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  onBack: () => void;
  onConfirmed: () => void;
  onCancelled: () => void;
  onCancelAll: () => void;
  onBeforeCancel?: () => void;
  onNavigate: (direction: "prev" | "next") => void;
}

export interface Erc7715PermissionEditableControlsProps {
  permissionRequest: PendingErc7715PermissionRequest;
  editedRequest: Erc7715PermissionRequest;
  asset: Erc7715PermissionAsset;
  validationError: string | null;
  onEditedRequestChange: (request: Erc7715PermissionRequest) => void;
  onValidationErrorChange: (error: string | null) => void;
}
