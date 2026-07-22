import type { ReactNode } from "react";
import { Box, Button, Text, VStack } from "@chakra-ui/react";
import {
  AppHeader,
  AppScreen,
  ScreenBody,
  StickyActionBar,
} from "@/components/ui";
import type { ShieldInitializationState } from "./hooks/useShieldInitialization";

interface ShieldDashboardProps {
  onBack: () => void;
  title: string;
  sourceAccountControl?: ReactNode;
  initialization: ShieldInitializationState;
  onRetryInitialization: () => void;
  onUnlockRequired: () => void;
  content: ReactNode;
  recoveryPanel?: ReactNode;
  actionNotice?: ReactNode;
  primaryAction: ReactNode;
}

export default function ShieldDashboard({
  onBack,
  title,
  sourceAccountControl,
  initialization,
  onRetryInitialization,
  onUnlockRequired,
  content,
  recoveryPanel,
  actionNotice,
  primaryAction,
}: ShieldDashboardProps) {
  return (
    <AppScreen stickyActionClearance={4}>
      <AppHeader
        title={title}
        onBack={onBack}
      />

      <ScreenBody pt={3} pb={4}>
        <VStack align="stretch" spacing={4}>
          {sourceAccountControl ? (
            <Box
              px={3}
              py={2.5}
              bg="surface.raised"
              borderWidth="1px"
              borderColor="border.subtle"
              borderRadius="md"
            >
              {sourceAccountControl}
            </Box>
          ) : null}

          {initialization.status === "auth-required" ? (
            <Box
              role="status"
              bg="surface.raised"
              borderWidth="1px"
              borderColor="border.subtle"
              borderRadius="md"
              px={3}
              py={3}
            >
              <Text fontSize="sm" fontWeight="700" color="fg.primary">
                Unlock WalletChan to continue
              </Text>
              <Text mt={1} fontSize="xs" color="fg.secondary">
                Your private balance stays protected while the wallet is locked.
              </Text>
              <Button
                display="flex"
                mt={3}
                mx="auto"
                variant="brand"
                size="sm"
                onClick={onUnlockRequired}
              >
                Unlock wallet
              </Button>
            </Box>
          ) : initialization.status === "action-required" ? (
            <Box
              role="alert"
              bg="status.warning.bg"
              borderWidth="1px"
              borderColor="status.warning.border"
              borderRadius="md"
              px={3}
              py={2.5}
            >
              <Text fontSize="xs" fontWeight="600" color="status.warning.fg">
                {initialization.error}
              </Text>
              <Button mt={1} variant="link" size="xs" onClick={onRetryInitialization}>
                Try again
              </Button>
            </Box>
          ) : null}

          {content}
          {recoveryPanel}
        </VStack>
      </ScreenBody>

      <StickyActionBar notice={actionNotice} primaryAction={primaryAction} />
    </AppScreen>
  );
}
