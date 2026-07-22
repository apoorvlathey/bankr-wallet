import { useEffect, useRef } from "react";
import { Button, Center, Spinner, Text, VStack } from "@chakra-ui/react";

import type { Account } from "@/chrome/types";
import { PRIVACY_POOLS_RELEASE_POLICY } from "@/chrome/privacy/deployment/manifest";
import { AppHeader, AppScreen, ScreenBody } from "@/components/ui";
import { useAccountIdentityLabels } from "@/hooks/useAccountIdentityLabels";
import { useShieldInitialization } from "./hooks/useShieldInitialization";
import { usePublicRecovery } from "./hooks/usePublicRecovery";
import PublicRecoveryReviewScreen from "./PublicRecoveryReviewScreen";

interface PublicRecoveryStatusScreenProps {
  accounts: Account[];
  onBack: () => void;
  onUnlockRequired: () => void;
}

function canRagequit(account: Account): boolean {
  return account.type === "privateKey" || account.type === "seedPhrase" ||
    (account.type === "bankr" &&
      PRIVACY_POOLS_RELEASE_POLICY.bankrMutations === "enabled");
}

/** Direct private-home entry into the existing read-only deposit selector. */
export default function PublicRecoveryStatusScreen({
  accounts,
  onBack,
  onUnlockRequired,
}: PublicRecoveryStatusScreenProps) {
  const requestedRef = useRef(false);
  const accountIdentity = useAccountIdentityLabels(accounts);
  const { initialization, retry } = useShieldInitialization();
  const recovery = usePublicRecovery(() => {}, onUnlockRequired);

  useEffect(() => {
    if (requestedRef.current || initialization.status !== "ready") return;
    requestedRef.current = true;
    recovery.inspect(null);
  }, [initialization.status, recovery.inspect]);

  if (recovery.previews.length > 0) {
    const options = recovery.previews.map((preview) => {
      const depositAccount = accounts.find((candidate) =>
        candidate.id === preview.accountId &&
        candidate.address.toLowerCase() === preview.accountAddress.toLowerCase() &&
        candidate.type === preview.accountType &&
        canRagequit(candidate)
      ) ?? null;
      return {
        preview,
        depositAccount,
        displayName: depositAccount
          ? accountIdentity.getDisplayName(depositAccount)
          : null,
        ensAvatar: depositAccount
          ? accountIdentity.getEnsAvatar(depositAccount)
          : null,
        secondaryIdentity: depositAccount
          ? accountIdentity.getSecondaryIdentity(depositAccount)
          : null,
      };
    });

    return (
      <PublicRecoveryReviewScreen
        options={options}
        initialization={initialization}
        status={recovery.status}
        error={recovery.error}
        onBack={onBack}
        onRetryInitialization={retry}
        onUnlockRequired={onUnlockRequired}
        onRecover={(previews) => {
          const first = previews[0];
          if (!first) return;
          const signer = accounts.find((candidate) =>
            candidate.id === first.accountId &&
            candidate.address.toLowerCase() === first.accountAddress.toLowerCase() &&
            candidate.type === first.accountType &&
            canRagequit(candidate)
          ) ?? null;
          recovery.prepare(signer, previews);
        }}
      />
    );
  }

  const isLoading = initialization.status === "loading" ||
    initialization.status === "ready" &&
      (recovery.status === "idle" || recovery.status === "previewing");

  return (
    <AppScreen>
      <AppHeader title="Deposit status" onBack={onBack} />
      <ScreenBody>
        <Center minH="240px">
          {isLoading ? (
            <VStack spacing={3} role="status">
              <Spinner color="accent.highlight" />
              <Text fontSize="sm" color="fg.secondary">
                Checking deposits…
              </Text>
            </VStack>
          ) : (
            <VStack spacing={3} textAlign="center" maxW="280px">
              <Text fontSize="sm" fontWeight="700" color="fg.primary">
                {initialization.status === "auth-required"
                  ? "Unlock WalletChan to continue"
                  : "Deposit status unavailable"}
              </Text>
              <Text fontSize="xs" color="fg.secondary">
                {initialization.status === "action-required"
                  ? initialization.error
                  : recovery.error ?? "No deposits are currently available for public exit."}
              </Text>
              <Button
                size="sm"
                variant="brand"
                onClick={initialization.status === "auth-required"
                  ? onUnlockRequired
                  : () => {
                      if (initialization.status === "action-required") {
                        requestedRef.current = false;
                        retry();
                        return;
                      }
                      requestedRef.current = true;
                      recovery.inspect(null);
                    }}
              >
                {initialization.status === "auth-required" ? "Unlock wallet" : "Try again"}
              </Button>
            </VStack>
          )}
        </Center>
      </ScreenBody>
    </AppScreen>
  );
}
