import { useCallback, useState } from "react";
import { Box, Button, FormControl, FormLabel, Input, Text, VStack } from "@chakra-ui/react";
import { WarningIcon } from "@chakra-ui/icons";
import PrivateKeyInput from "@/components/shared/PrivateKeyInput";
import { OnboardingCanvas, OnboardingFooter, OnboardingHeader } from "./OnboardingShell";

export function PrivateKeySetupStep({
  privateKey,
  derivedAddress,
  displayName,
  error,
  onPrivateKeyChange,
  onDisplayNameChange,
  onClearError,
  onBack,
  onProgressStepClick,
  onContinue,
}: {
  privateKey: string;
  derivedAddress: string | null;
  displayName: string;
  error?: string;
  onPrivateKeyChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onClearError: () => void;
  onBack: () => void;
  onProgressStepClick: (step: number) => void;
  onContinue: () => void;
}) {
  const [generatedBackupReady, setGeneratedBackupReady] = useState(true);
  const canContinue = !!derivedAddress && generatedBackupReady;
  const guardedContinue = useCallback(() => {
    if (canContinue) onContinue();
  }, [canContinue, onContinue]);
  const handleGeneratedBackupStateChange = useCallback(
    (isGenerated: boolean, isConfirmed: boolean) => {
      setGeneratedBackupReady(!isGenerated || isConfirmed);
    },
    [],
  );

  return (
    <OnboardingCanvas
      currentStep={1}
      onStepClick={onProgressStepClick}
      header={<OnboardingHeader onBack={onBack} step={1} />}
      footer={
        <OnboardingFooter>
          <Button variant="brand" size="lg" w="full" onClick={guardedContinue} isDisabled={!canContinue}>
            Continue
          </Button>
        </OnboardingFooter>
      }
    >
      <VStack align="stretch" spacing={6}>
        <VStack align="stretch" spacing={1.5}>
          <Text as="h1" fontSize="2xl" fontWeight="700" letterSpacing="-0.02em">
            Add a private-key account
          </Text>
          <Text color="fg.secondary" fontSize="sm" lineHeight="1.5">
            Import an existing key or generate a new one. Signing stays local to this device.
          </Text>
        </VStack>

        <Box
          sx={{
            "& label": { textTransform: "none", letterSpacing: "normal", fontSize: "var(--chakra-fontSizes-sm)" },
            "& button:not([aria-label])": { textTransform: "none", letterSpacing: "normal", borderWidth: "1px", boxShadow: "none" },
          }}
        >
          <PrivateKeyInput
            privateKey={privateKey}
            onPrivateKeyChange={onPrivateKeyChange}
            derivedAddress={derivedAddress}
            error={error}
            onClearError={onClearError}
            onContinue={guardedContinue}
            requireGeneratedBackupConfirmation
            onGeneratedBackupStateChange={handleGeneratedBackupStateChange}
            autoFocus
          />
        </Box>

        <FormControl>
          <FormLabel fontSize="sm" color="fg.primary" fontWeight="600">
            Account name <Box as="span" color="fg.muted" fontWeight="400">(optional)</Box>
          </FormLabel>
          <Input
            value={displayName}
            placeholder="Trading wallet"
            onChange={(event) => onDisplayNameChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") guardedContinue();
            }}
          />
        </FormControl>

        <Box
          p={3.5}
          bg="status.warning.tint"
          border="1px solid"
          borderColor="status.warning.border"
          borderRadius="lg"
        >
          <Box display="flex" gap={3} alignItems="flex-start">
            <WarningIcon color="status.warning.fg" mt={0.5} flexShrink={0} />
            <VStack align="stretch" spacing={1}>
              <Text fontSize="sm" fontWeight="600" color="fg.primary">Keep this key private</Text>
              <Text fontSize="xs" lineHeight="1.5" color="fg.secondary">
                Anyone with the key can control the account. WalletChan encrypts it and stores it only on this device.
              </Text>
            </VStack>
          </Box>
        </Box>
      </VStack>
    </OnboardingCanvas>
  );
}
