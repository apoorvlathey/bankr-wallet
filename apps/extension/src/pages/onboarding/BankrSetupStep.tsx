import {
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  Link,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ExternalLinkIcon, ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import { BANKR_BOT_API_PAGE, BANKR_BOT_TERMINAL_PAGE } from "@/constants/externalUrls";
import { OnboardingCanvas, OnboardingFooter, OnboardingHeader } from "./OnboardingShell";

type Errors = { apiKey?: string; walletAddress?: string };

export function BankrSetupStep({
  apiKey,
  showApiKey,
  walletAddress,
  displayName,
  errors,
  isResolvingAddress,
  onApiKeyChange,
  onToggleApiKey,
  onWalletAddressChange,
  onDisplayNameChange,
  onBack,
  onProgressStepClick,
  onContinue,
}: {
  apiKey: string;
  showApiKey: boolean;
  walletAddress: string;
  displayName: string;
  errors: Errors;
  isResolvingAddress: boolean;
  onApiKeyChange: (value: string) => void;
  onToggleApiKey: () => void;
  onWalletAddressChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onBack: () => void;
  onProgressStepClick: (step: number) => void;
  onContinue: () => void;
}) {
  const submitOnEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") onContinue();
  };

  return (
    <OnboardingCanvas
      currentStep={1}
      onStepClick={onProgressStepClick}
      header={<OnboardingHeader onBack={onBack} step={1} />}
      footer={
        <OnboardingFooter>
          <Button
            variant="brand"
            size="lg"
            w="full"
            onClick={onContinue}
            isLoading={isResolvingAddress}
            loadingText="Verifying address…"
          >
            Continue
          </Button>
        </OnboardingFooter>
      }
    >
      <VStack align="stretch" spacing={6}>
        <VStack align="stretch" spacing={1.5}>
          <Text as="h1" fontSize="2xl" fontWeight="700" letterSpacing="-0.02em">
            Connect your Bankr account
          </Text>
          <Text color="fg.secondary" fontSize="sm" lineHeight="1.5">
            WalletChan uses your Bankr API key to request account actions. Your key is encrypted before it is stored.
          </Text>
        </VStack>

        <VStack align="stretch" spacing={5}>
          <FormControl isInvalid={!!errors.apiKey}>
            <FormLabel fontSize="sm" color="fg.primary" fontWeight="600">
              Bankr API key
            </FormLabel>
            <InputGroup>
              <Input
                type={showApiKey ? "text" : "password"}
                value={apiKey}
                placeholder="Paste your API key"
                autoFocus
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => onApiKeyChange(event.target.value)}
                onKeyDown={submitOnEnter}
                pr="3rem"
              />
              <InputRightElement>
                <IconButton
                  aria-label={showApiKey ? "Hide API key" : "Show API key"}
                  icon={showApiKey ? <ViewOffIcon /> : <ViewIcon />}
                  size="sm"
                  variant="ghost"
                  onClick={onToggleApiKey}
                  color="fg.secondary"
                />
              </InputRightElement>
            </InputGroup>
            <FormErrorMessage color="chart.negative">{errors.apiKey}</FormErrorMessage>
            {!errors.apiKey && (
              <Text fontSize="xs" color="fg.muted" mt={1.5}>
                Stored locally with password-based encryption.
              </Text>
            )}
          </FormControl>

          <FormControl isInvalid={!!errors.walletAddress}>
            <FormLabel fontSize="sm" color="fg.primary" fontWeight="600">
              Linked wallet address
            </FormLabel>
            <Input
              value={walletAddress}
              placeholder="0x… or a supported name"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => onWalletAddressChange(event.target.value)}
              onKeyDown={submitOnEnter}
            />
            <FormErrorMessage color="chart.negative">{errors.walletAddress}</FormErrorMessage>
            {!errors.walletAddress && (
              <Text fontSize="xs" color="fg.muted" mt={1.5}>
                ENS, Basenames, WNS, and GNS names are supported.
              </Text>
            )}
          </FormControl>

          <FormControl>
            <FormLabel fontSize="sm" color="fg.primary" fontWeight="600">
              Account name <Box as="span" color="fg.muted" fontWeight="400">(optional)</Box>
            </FormLabel>
            <Input
              value={displayName}
              placeholder="Main wallet"
              onChange={(event) => onDisplayNameChange(event.target.value)}
              onKeyDown={submitOnEnter}
            />
          </FormControl>
        </VStack>

        <Box borderTop="1px solid" borderColor="border.subtle" pt={4}>
          <Text fontSize="sm" fontWeight="600" mb={2}>Need your Bankr details?</Text>
          <VStack align="stretch" spacing={2}>
            <Link href={BANKR_BOT_API_PAGE} isExternal color="accent.secondary" fontSize="sm">
              Create or copy an API key <ExternalLinkIcon mx="2px" />
            </Link>
            <Link href={BANKR_BOT_TERMINAL_PAGE} isExternal color="accent.secondary" fontSize="sm">
              Find your linked wallet address <ExternalLinkIcon mx="2px" />
            </Link>
          </VStack>
        </Box>
      </VStack>
    </OnboardingCanvas>
  );
}
