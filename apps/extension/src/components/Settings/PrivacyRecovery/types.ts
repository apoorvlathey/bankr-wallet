export type RecoveryStatus =
  | {
      success: true;
      status: "missing" | "ready";
      hasMasterRecovery: boolean;
      backupVerified: boolean;
    }
  | { success: false; status: "attention"; error: string };

export interface RecoveryResponse {
  success: boolean;
  phrase?: string;
  status?: string;
  error?: string;
}

export interface ShieldPortfolio {
  status: "ready" | "locked";
  confirmedBalanceWei: string;
  readyBalanceWei: string;
  pendingBalanceWei: string;
}

export type RecoveryView =
  | "menu"
  | "backup"
  | "restore-backup"
  | "restore-confirm"
  | "restore-import";
