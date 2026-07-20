import { Box, Text, VStack } from "@chakra-ui/react";
import AddLedgerFlow, {
  type LedgerAccountSelection,
} from "@/components/Ledger/AddLedgerFlow";
import {
  OnboardingCanvas,
  OnboardingFooter,
  OnboardingHeader,
} from "./OnboardingShell";

export function LedgerOnboardingStep({
  onBack,
  onProgressStepClick,
  onCollect,
}: {
  onBack: () => void;
  onProgressStepClick: (step: number) => void;
  onCollect: (selection: LedgerAccountSelection) => Promise<void>;
}) {
  return (
    <AddLedgerFlow
      onBack={onBack}
      onComplete={() => undefined}
      commitAccounts={onCollect}
      renderLayout={({ content, primaryAction }) => (
        <OnboardingCanvas
          currentStep={1}
          onStepClick={onProgressStepClick}
          header={<OnboardingHeader onBack={onBack} step={1} />}
          footer={
            <OnboardingFooter>
              <Box sx={{ "& > button": { width: "100%" } }}>
                {primaryAction}
              </Box>
            </OnboardingFooter>
          }
        >
          <VStack align="stretch" spacing={6}>
            <VStack align="stretch" spacing={1.5}>
              <Text
                as="h1"
                fontSize="2xl"
                fontWeight="700"
                letterSpacing="-0.02em"
              >
                Connect your Ledger
              </Text>
              <Text color="fg.secondary" fontSize="sm" lineHeight="1.5">
                Unlock your device and open the Ethereum app, then choose the
                first accounts to add.
              </Text>
            </VStack>
            {content}
          </VStack>
        </OnboardingCanvas>
      )}
    />
  );
}
