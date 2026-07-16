import { Box, Button, Container, Heading, Spinner, Text, VStack } from "@chakra-ui/react";

import type { ManualWalletLockStatus } from "@/app/hooks/useManualWalletLock";

interface ManualWalletLockScreenProps {
  status: Exclude<ManualWalletLockStatus, "idle">;
  isFullscreenTab: boolean;
  onRetry: () => void;
}

export default function ManualWalletLockScreen({
  status,
  isFullscreenTab,
  onRetry,
}: ManualWalletLockScreenProps) {
  const isLocking = status === "locking";

  return (
    <Box bg="surface.base" h="100%" display="flex" flexDirection="column">
      <Container
        maxW={isFullscreenTab ? "480px" : "100%"}
        h="100%"
        display="flex"
        alignItems="center"
        justifyContent="center"
        px={6}
      >
        <VStack
          w="100%"
          spacing={5}
          p={6}
          bg="surface.raised"
          border="2px solid"
          borderColor={isLocking ? "border.strong" : "status.error.border"}
          borderRadius="card"
          textAlign="center"
          role={isLocking ? "status" : "alert"}
          aria-live={isLocking ? "polite" : "assertive"}
        >
          {isLocking && <Spinner size="lg" color="accent.primary" thickness="3px" />}
          <Heading size="md" color="fg.primary">
            {isLocking ? "Locking wallet…" : "Lock could not be confirmed"}
          </Heading>
          <Text color="fg.secondary">
            {isLocking
              ? "Securely revoking this wallet session."
              : "Wallet secrets were removed from this window, but the saved session could not be securely revoked. Try again. If the problem continues, close the browser to end the session."}
          </Text>
          {!isLocking && (
            <Button w="100%" variant="brand" onClick={onRetry}>
              Retry lock
            </Button>
          )}
        </VStack>
      </Container>
    </Box>
  );
}
