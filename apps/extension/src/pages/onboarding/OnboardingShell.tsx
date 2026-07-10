import { Box, Flex, HStack, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import BrandWordmark from "@/components/BrandWordmark";
import ThemeSwitcher from "@/components/shared/ThemeSwitcher";

export function OnboardingProgress({
  currentStep,
  totalSteps,
}: {
  currentStep: number;
  totalSteps: number;
}) {
  return (
    <VStack spacing={2} align="stretch" w="full" aria-label={`Step ${currentStep + 1} of ${totalSteps}`}>
      <HStack spacing={1.5} aria-hidden="true">
        {Array.from({ length: totalSteps }).map((_, index) => (
          <Box
            key={index}
            h="3px"
            flex="1"
            borderRadius="full"
            bg={index <= currentStep ? "accent.primary" : "border.default"}
            transitionProperty="background-color"
            transitionDuration="fast"
          />
        ))}
      </HStack>
      <Text fontSize="xs" color="fg.muted" fontWeight="500">
        Step {currentStep + 1} of {totalSteps}
      </Text>
    </VStack>
  );
}

export function OnboardingCanvas({
  children,
  header,
  footer,
}: {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Flex h="100vh" minH={0} overflow="hidden" bg="surface.base" color="fg.primary" justify="center">
      <Flex
        w="full"
        maxW="440px"
        h="100vh"
        minH={0}
        direction="column"
        bg="surface.base"
        borderX={{ base: "none", sm: "1px solid" }}
        borderColor="border.subtle"
      >
        {header}
        <Box flex="1" minH={0} overflowY="auto" px={{ base: 5, sm: 7 }} py={6}>
          {children}
        </Box>
        {footer}
      </Flex>
    </Flex>
  );
}

export function OnboardingHeader({
  onBack,
  step,
  totalSteps = 3,
}: {
  onBack?: () => void;
  step?: number;
  totalSteps?: number;
}) {
  return (
    <Box as="header" px={{ base: 3, sm: 5 }} pt={3} pb={step === undefined ? 3 : 4}>
      <Flex align="center" minH="44px" gap={3}>
        {onBack ? (
          <Box
            as="button"
            type="button"
            aria-label="Go back"
            onClick={onBack}
            w="44px"
            h="44px"
            borderRadius="md"
            display="grid"
            placeItems="center"
            color="fg.primary"
            _hover={{ bg: "surface.raisedHover" }}
            _active={{ bg: "surface.sunken" }}
            _focusVisible={{ boxShadow: "focus" }}
          >
            <Box as="span" fontSize="2xl" lineHeight="1" aria-hidden="true">
              ←
            </Box>
          </Box>
        ) : (
          <HStack spacing={2} minW="44px">
            <Box as="img" src="/walletchan-icon.png" alt="" w="32px" h="32px" borderRadius="md" />
          </HStack>
        )}

        <Box flex="1" minW={0}>
          {step === undefined ? (
            <BrandWordmark />
          ) : (
            <OnboardingProgress currentStep={step} totalSteps={totalSteps} />
          )}
        </Box>

        <Flex w="44px" h="44px" align="center" justify="center">
          <ThemeSwitcher size="sm" ariaLabel="Choose appearance" />
        </Flex>
      </Flex>
    </Box>
  );
}

export function OnboardingFooter({ children }: { children: ReactNode }) {
  return (
    <Box
      bg="surface.raised"
      borderTop="1px solid"
      borderColor="border.subtle"
      px={{ base: 5, sm: 7 }}
      pt={3}
      pb="calc(12px + env(safe-area-inset-bottom, 0px))"
    >
      {children}
    </Box>
  );
}
