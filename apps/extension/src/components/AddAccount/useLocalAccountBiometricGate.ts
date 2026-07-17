import { useEffect, useState } from "react";
import {
  needsLocalAccountBiometricUpgrade,
  type PasskeyUnlockStatus,
} from "./model/biometricGateModel";

export function useLocalAccountBiometricGate(): boolean | null {
  const [needsUpgrade, setNeedsUpgrade] = useState<boolean | null>(null);

  useEffect(() => {
    chrome.runtime.sendMessage(
      { type: "getPasskeyUnlockStatus" },
      (status: PasskeyUnlockStatus) => {
        setNeedsUpgrade(needsLocalAccountBiometricUpgrade(status));
      },
    );
  }, []);

  return needsUpgrade;
}
