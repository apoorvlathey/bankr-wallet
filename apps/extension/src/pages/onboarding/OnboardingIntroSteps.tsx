import { Box, Button, HStack, Link, Spinner, Text, VStack } from "@chakra-ui/react";
import { CheckIcon, LockIcon } from "@chakra-ui/icons";
import { TWITTER_URL } from "@/constants/externalUrls";
import { OnboardingCanvas, OnboardingFooter, OnboardingHeader } from "./OnboardingShell";

function TrustRow({ children }: { children: string }) {
  return (
    <HStack spacing={3} align="start">
      <Box
        w="24px"
        h="24px"
        borderRadius="full"
        bg="surface.raisedHover"
        color="accent.secondary"
        display="grid"
        placeItems="center"
        flexShrink={0}
      >
        <CheckIcon boxSize={3} />
      </Box>
      <Text color="fg.secondary" fontSize="sm" lineHeight="1.5">
        {children}
      </Text>
    </HStack>
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

export function WelcomeStep({ onContinue }: { onContinue: () => void }) {
  return (
    <OnboardingCanvas
      header={<OnboardingHeader />}
      footer={
        <OnboardingFooter>
          <Button variant="primary" size="lg" w="full" onClick={onContinue}>
            Set up WalletChan
          </Button>
        </OnboardingFooter>
      }
    >
      <VStack align="stretch" spacing={8} pt={{ base: 4, sm: 10 }}>
        <VStack align="start" spacing={3}>
          <Box
            w="56px"
            h="56px"
            bg="surface.raised"
            border="1px solid"
            borderColor="border.default"
            borderRadius="xl"
            display="grid"
            placeItems="center"
          >
            <Box as="img" src="/walletchan-icon.png" alt="WalletChan" w="42px" h="42px" />
          </Box>
          <Text as="h1" fontSize={{ base: "2xl", sm: "3xl" }} fontWeight="700" lineHeight="1.18" letterSpacing="-0.025em">
            A wallet that explains every action.
          </Text>
          <Text color="fg.secondary" fontSize="md" lineHeight="1.55">
            Bring your Bankr account, private key, or seed phrase. WalletChan keeps the important details clear before you sign.
          </Text>
        </VStack>

        <VStack align="stretch" spacing={4}>
          <TrustRow>Credentials are encrypted and stored on this device.</TrustRow>
          <TrustRow>Transactions show human-readable outcomes before approval.</TrustRow>
          <TrustRow>You can add more account types later.</TrustRow>
        </VStack>

        <HStack spacing={2} color="fg.muted" pt={2}>
          <LockIcon boxSize={3.5} />
          <Text fontSize="xs">Self-custody by default</Text>
          <Text aria-hidden="true">·</Text>
          <Link href={TWITTER_URL} isExternal fontSize="xs" color="accent.secondary">
            Built by @apoorveth
          </Link>
        </HStack>
      </VStack>
    </OnboardingCanvas>
  );
}

export function SuccessStep() {
  return (
    <OnboardingCanvas header={<OnboardingHeader />}>
      <VStack minH={{ base: "420px", sm: "520px" }} justify="center" spacing={6} textAlign="center">
        <Box
          w="64px"
          h="64px"
          borderRadius="full"
          bg="status.success.bg"
          color="status.success.fg"
          border="1px solid"
          borderColor="status.success.border"
          display="grid"
          placeItems="center"
        >
          <CheckIcon boxSize={6} />
        </Box>
        <VStack spacing={2} maxW="320px">
          <Text as="h1" fontSize="2xl" fontWeight="700" letterSpacing="-0.02em">
            Your wallet is ready
          </Text>
          <Text color="fg.secondary" fontSize="sm" lineHeight="1.55">
            Pin WalletChan in your browser toolbar for quick access, then open the extension to unlock your wallet.
          </Text>
        </VStack>
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
            Open your browser’s extension menu, pin WalletChan, and select its icon.
          </Text>
        </Box>
      </VStack>
    </OnboardingCanvas>
  );
}
