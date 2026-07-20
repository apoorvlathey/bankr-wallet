import {
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormLabel,
  HStack,
  Input,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { AddressContactAvatar } from "@/components/shared/AddressContactAvatar";
import { EyeIcon } from "@/components/shared/AccountTypeIcons";
import { useAddressResolver } from "@/hooks/useAddressResolver";
import { isResolvableName } from "@/lib/ensUtils";
import {
  OnboardingCanvas,
  OnboardingFooter,
  OnboardingHeader,
} from "./OnboardingShell";

export function ViewOnlySetupStep({
  address,
  displayName,
  error,
  isResolvingAddress,
  onAddressChange,
  onDisplayNameChange,
  onBack,
  onProgressStepClick,
  onContinue,
}: {
  address: string;
  displayName: string;
  error?: string;
  isResolvingAddress: boolean;
  onAddressChange: (value: string) => void;
  onDisplayNameChange: (value: string) => void;
  onBack: () => void;
  onProgressStepClick: (step: number) => void;
  onContinue: () => void;
}) {
  const {
    resolvedAddress,
    avatar,
    isResolving,
    isLoadingExtras,
    isValid,
  } = useAddressResolver(address);
  const isResolvingIdentity = isResolving || isLoadingExtras;
  const showResolvedIdentity =
    isResolvableName(address) && !isResolving && isValid && !!resolvedAddress;

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
            loadingText="Resolving address…"
          >
            Continue
          </Button>
        </OnboardingFooter>
      }
    >
      <VStack align="stretch" spacing={6}>
        <VStack align="stretch" spacing={1.5}>
          <Text as="h1" fontSize="2xl" fontWeight="700" letterSpacing="-0.02em">
            Follow any address
          </Text>
          <Text color="fg.secondary" fontSize="sm" lineHeight="1.5">
            View balances and connect to dapps as this address without importing its signing keys.
          </Text>
        </VStack>

        <VStack align="stretch" spacing={5}>
          <FormControl isInvalid={!!error}>
            <HStack justify="space-between" align="center" mb={2} minH="24px">
              <FormLabel mb={0} fontSize="sm" color="fg.primary" fontWeight="600">
                Address or name
              </FormLabel>
              {address && isResolvingIdentity && (
                <HStack spacing={1.5} color="fg.muted">
                  <Spinner size="xs" color="accent.highlight" />
                  <Text fontSize="xs" fontWeight="600">
                    Resolving…
                  </Text>
                </HStack>
              )}
              {showResolvedIdentity && (
                <HStack spacing={1.5} minW={0}>
                  <AddressContactAvatar
                    address={resolvedAddress}
                    avatar={avatar}
                    size={18}
                  />
                  <Text
                    color="fg.secondary"
                    fontFamily="mono"
                    fontSize="xs"
                    fontWeight="600"
                    whiteSpace="nowrap"
                  >
                    {resolvedAddress.slice(0, 6)}…{resolvedAddress.slice(-4)}
                  </Text>
                </HStack>
              )}
            </HStack>
            <Input
              value={address}
              placeholder="0x… or a supported name"
              autoFocus
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => onAddressChange(event.target.value)}
              onKeyDown={submitOnEnter}
            />
            <FormErrorMessage color="chart.negative">{error}</FormErrorMessage>
            {!error && (
              <Text fontSize="xs" color="fg.muted" mt={1.5}>
                ENS, Basenames, WNS, and GNS names are supported.
              </Text>
            )}
          </FormControl>

          <FormControl>
            <FormLabel fontSize="sm" color="fg.primary" fontWeight="600">
              Account name{" "}
              <Box as="span" color="fg.muted" fontWeight="400">
                (optional)
              </Box>
            </FormLabel>
            <Input
              value={displayName}
              placeholder="Treasury watch"
              onChange={(event) => onDisplayNameChange(event.target.value)}
              onKeyDown={submitOnEnter}
            />
          </FormControl>
        </VStack>

        <Box
          p={3.5}
          bg="status.info.bg"
          border="1px solid"
          borderColor="status.info.border"
          borderRadius="lg"
          display="flex"
          gap={3}
          alignItems="flex-start"
        >
          <EyeIcon boxSize="18px" color="status.info.fg" flexShrink={0} mt={0.5} />
          <VStack align="stretch" spacing={1}>
            <Text fontSize="sm" fontWeight="600">
              No signing access
            </Text>
            <Text color="fg.secondary" fontSize="xs" lineHeight="1.5">
              View-only accounts cannot send transactions or approve signatures. You can add a signing account later.
            </Text>
          </VStack>
        </Box>
      </VStack>
    </OnboardingCanvas>
  );
}
