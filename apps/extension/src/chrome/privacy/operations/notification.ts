import { showNotification } from "../../transactions/notification";
import type { PrivacyTrackingUpdateResult } from "./repository";

export interface PrivacyShieldApprovalNotification {
  id: string;
  title: string;
  message: string;
}

/** Keep native lock-screen copy generic: no amount, account, or commitment. */
export function describePrivacyShieldApprovalNotification(
  operationId: string,
): PrivacyShieldApprovalNotification {
  return {
    id: `privacy-shield-ready-${operationId}`,
    title: "Shielding approved",
    message: "Your Shielded ETH passed the Privacy Pools compliance check.",
  };
}

export function shouldNotifyPrivacyShieldApproval(
  result: PrivacyTrackingUpdateResult,
): result is Extract<PrivacyTrackingUpdateResult, { status: "updated" }> {
  return result.status === "updated" &&
    result.operation.tracking?.state === "asp_approved";
}

export async function notifyPrivacyShieldApproval(operationId: string): Promise<void> {
  const notification = describePrivacyShieldApprovalNotification(operationId);
  await showNotification(
    notification.id,
    notification.title,
    notification.message,
  );
}
