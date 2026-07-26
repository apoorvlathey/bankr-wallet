export interface ApprovalCleanupResponse<T = unknown> {
  success: boolean;
  error?: string;
  result?: T;
}

export function approvalCleanupEvidence(
  approvals: Array<{ detectionId?: string; evidenceId?: string }>,
): { detectionId: string; evidenceIds: string[] } | null {
  const detectionId = approvals[0]?.detectionId;
  if (
    !detectionId ||
    approvals.length === 0 ||
    approvals.some(
      (approval) =>
        approval.detectionId !== detectionId || !approval.evidenceId,
    )
  ) {
    return null;
  }
  return {
    detectionId,
    evidenceIds: approvals.map((approval) => approval.evidenceId!),
  };
}

export function sendApprovalCleanupMessage<T = unknown>(
  message: Record<string, unknown>,
): Promise<ApprovalCleanupResponse<T>> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      message,
      (response: ApprovalCleanupResponse<T> | undefined) => {
        const runtimeError = chrome.runtime.lastError;
        if (runtimeError) {
          reject(new Error(runtimeError.message));
          return;
        }
        resolve(
          response ?? {
            success: false,
            error: "Approval cleanup returned no response",
          },
        );
      },
    );
  });
}
