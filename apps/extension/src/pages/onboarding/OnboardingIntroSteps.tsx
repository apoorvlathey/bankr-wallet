import { useEffect } from "react";
import { Box, HStack, Image, Spinner, Text, VStack } from "@chakra-ui/react";
import { WarningIcon } from "@chakra-ui/icons";
import { keyframes } from "@emotion/react";
import BrandWordmark from "@/components/BrandWordmark";
import UnlockMascot from "@/components/UnlockMascot";
import { playInteractionSound } from "@/sounds/soundManager";
import { OnboardingCanvas, OnboardingHeader } from "./OnboardingShell";

const floatPinPrompt = keyframes`
  0%, 100% { transform: translate(0, 0); }
  50% { transform: translate(0, -5px); }
`;

function PinExtensionPrompt() {
  return (
    <Box
      position="fixed"
      top={{ md: "88px", lg: "80px" }}
      right={{ md: 5, lg: 8 }}
      zIndex={20}
      display={{ base: "none", md: "block" }}
      pointerEvents="none"
      role="note"
      aria-label="Pin WalletChan from your browser extensions menu"
      sx={{
        "@media (prefers-reduced-motion: no-preference)": {
          animation: `${floatPinPrompt} 2.2s ease-in-out infinite`,
        },
      }}
    >
      <Box
        position="absolute"
        right={3}
        top="-40px"
        color="accent.highlight"
      >
        <Box
          as="svg"
          viewBox="0 0 24 24"
          boxSize="38px"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 19V5" />
          <path d="m5 12 7-7 7 7" />
        </Box>
      </Box>

      <Box
        minW="220px"
        px={3.5}
        py={3}
        bg="surface.raised"
        border="1px solid"
        borderColor="accent.highlight"
        borderRadius="lg"
      >
        <HStack spacing={2.5} align="center">
          <Image src="/walletchan-icon.png" alt="" boxSize="32px" />
          <VStack spacing={0.5} align="stretch">
            <BrandWordmark fontSize="md" />
            <Text color="fg.secondary" fontSize="xs" lineHeight="1.35">
              Pin the extension for quick access
            </Text>
          </VStack>
        </HStack>
      </Box>
    </Box>
  );
}

export function OnboardingLoading() {
  return (
    <OnboardingCanvas>
      <VStack h="full" minH="calc(100vh - 48px)" justify="center" spacing={4} role="status">
        <Spinner color="accent.primary" thickness="2px" speed="0.7s" />
        <Text color="fg.secondary" fontSize="sm">
          Checking your wallet setup…
        </Text>
      </VStack>
    </OnboardingCanvas>
  );
}

export function OnboardingRecoveryError({ message }: { message: string }) {
  return (
    <OnboardingCanvas header={<OnboardingHeader />}>
      <VStack
        minH={{ base: "420px", sm: "520px" }}
        justify="center"
        align="stretch"
        spacing={5}
      >
        <Box
          p={5}
          bg="status.warning.bg"
          border="1px solid"
          borderColor="status.warning.border"
          borderRadius="xl"
        >
          <HStack align="start" spacing={3}>
            <WarningIcon mt={1} color="status.warning.fg" flexShrink={0} />
            <VStack align="start" spacing={2}>
              <Text as="h1" fontSize="lg" fontWeight="700">
                Wallet setup needs recovery
              </Text>
              <Text color="fg.secondary" fontSize="sm" lineHeight="1.55">
                {message}
              </Text>
              <Text color="fg.secondary" fontSize="sm" lineHeight="1.55">
                WalletChan will not overwrite or delete this data automatically.
              </Text>
            </VStack>
          </HStack>
        </Box>
      </VStack>
    </OnboardingCanvas>
  );
}

export function SuccessStep() {
  useEffect(() => {
    void playInteractionSound("unlockSuccess");
  }, []);

  return (
    <>
      <PinExtensionPrompt />
      <OnboardingCanvas currentStep={3} header={<OnboardingHeader />}>
        <VStack minH={{ base: "420px", sm: "520px" }} justify="center" spacing={5} textAlign="center">
          <Box
            w="140px"
            h="140px"
            role="img"
            aria-label="Wallet ready"
          >
            <UnlockMascot state="success" />
          </Box>
          <Text as="h1" fontSize="2xl" fontWeight="700" letterSpacing="-0.02em">
            Your wallet is ready
          </Text>
          <Box
            w="full"
            maxW="320px"
            p={4}
            bg="surface.raised"
            border="1px solid"
            borderColor="border.default"
            borderRadius="lg"
            textAlign="left"
          >
            <Text fontWeight="600" fontSize="sm">Next step</Text>
            <Text color="fg.secondary" fontSize="sm" mt={1}>
              Open your browser’s extension menu, pin WalletChan, and click its icon.
            </Text>
          </Box>
        </VStack>
      </OnboardingCanvas>
    </>
  );
}
