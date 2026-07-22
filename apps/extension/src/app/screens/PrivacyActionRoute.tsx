import { Box } from "@chakra-ui/react";
import { Suspense, type ReactNode } from "react";
import type { Account } from "@/chrome/types";
import { ShieldView } from "@/app/lazyScreens";
import type { PrivacyActionMode } from "@/components/ShieldView";
import type { UnshieldEntryTarget, UnshieldOperation } from "@/components/Shield/model/unshield";
import type { ShieldSourceAccount } from "@/components/Shield/model/shieldQuote";

interface PrivacyActionRouteProps {
  isFullscreenTab: boolean;
  mode: PrivacyActionMode;
  unshieldTarget: UnshieldEntryTarget | null;
  account: ShieldSourceAccount | null;
  accounts: Account[];
  fallback: ReactNode;
  onBack: () => void;
  onUnlockRequired: () => void;
  onOpenBiometricSettings: () => void;
  onUnshieldSubmitted: (operation: UnshieldOperation) => void;
}

/** App-owned frame adapter for the Shield, Unshield, and deposit-status screens. */
export default function PrivacyActionRoute({
  isFullscreenTab,
  mode,
  unshieldTarget,
  account,
  accounts,
  fallback,
  onBack,
  onUnlockRequired,
  onOpenBiometricSettings,
  onUnshieldSubmitted,
}: PrivacyActionRouteProps) {
  return (
    <Box bg="bg.base" h="100%" display="flex" flexDirection="column">
      <Box
        maxW={isFullscreenTab ? "480px" : "100%"}
        mx="auto"
        w="100%"
        h="100%"
        display="flex"
        flexDirection="column"
      >
        <Suspense fallback={fallback}>
          <ShieldView
            key={`${mode}:${unshieldTarget?.operationId ?? ""}`}
            mode={mode}
            unshieldTarget={unshieldTarget}
            onBack={onBack}
            onUnlockRequired={onUnlockRequired}
            onOpenBiometricSettings={onOpenBiometricSettings}
            onUnshieldSubmitted={onUnshieldSubmitted}
            account={account}
            accounts={accounts}
          />
        </Suspense>
      </Box>
    </Box>
  );
}
