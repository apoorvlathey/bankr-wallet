import { useState } from "react";

import type {
  Erc7715PermissionRequest,
  PendingErc7715PermissionRequest,
} from "@/chrome/pendingErc7715PermissionStorage";
import { useThemedToast } from "@/hooks/useThemedToast";

export function useErc7715PermissionActions({
  permissionRequest,
  editedRequest,
  canGrant,
  draftError,
  onBeforeCancel,
  onCancelled,
  onConfirmed,
}: {
  permissionRequest: PendingErc7715PermissionRequest;
  editedRequest: Erc7715PermissionRequest;
  canGrant: boolean;
  draftError: string | null;
  onBeforeCancel?: () => void;
  onCancelled: () => void;
  onConfirmed: () => void;
}) {
  const toast = useThemedToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const reject = () => {
    if (isRejecting) return;
    setIsRejecting(true);
    onBeforeCancel?.();
    chrome.runtime.sendMessage(
      {
        type: "rejectErc7715PermissionRequest",
        requestId: permissionRequest.id,
      },
      () => onCancelled(),
    );
  };

  const confirm = async () => {
    if (!canGrant || draftError) return;
    setIsSubmitting(true);

    const result = await new Promise<{ success: boolean; error?: string }>(
      (resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "confirmErc7715PermissionRequest",
            requestId: permissionRequest.id,
            password: "",
            editedRequest,
          },
          resolve,
        );
      },
    );

    setIsSubmitting(false);
    if (result?.success) {
      toast({ title: "Permission granted", status: "success", duration: 2000 });
      onConfirmed();
      return;
    }

    toast({
      title: "Grant failed",
      description: result?.error || "Failed to grant permission",
      status: "error",
      duration: 3000,
    });
    onCancelled();
  };

  return { confirm, reject, isSubmitting, isRejecting };
}
