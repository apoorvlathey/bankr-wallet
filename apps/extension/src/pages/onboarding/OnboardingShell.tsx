import { CheckIcon, LockIcon } from "@chakra-ui/icons";
import { Box, Flex, HStack, Image, Text, VStack } from "@chakra-ui/react";
import type { ReactNode } from "react";
import BrandWordmark from "@/components/BrandWordmark";
import ThemeSwitcher from "@/components/shared/ThemeSwitcher";

const SETUP_STEPS = [
  { title: "Choose account", description: "Pick how you want to start" },
  { title: "Add details", description: "Connect or import securely" },
  { title: "Secure wallet", description: "Create your unlock password" },
];

function ProgressRail({
  currentStep,
  onStepClick,
}: {
  currentStep: number;
  onStepClick?: (step: number) => void;
}) {
  return (
    <VStack align="stretch" spacing={1} mt={10} aria-label="Wallet setup progress">
      {SETUP_STEPS.map((step, index) => {
        const isComplete = index < currentStep;
        const isActive = index === currentStep;
        const canNavigate = isComplete && !!onStepClick;

        return (
          <HStack
            as={canNavigate ? "button" : "div"}
            key={step.title}
            position="relative"
            spacing={3}
            w="full"
            px={3}
            py={3}
            textAlign="left"
            borderRadius="md"
            bg={isActive ? "surface.raisedHover" : "transparent"}
            color={isActive ? "fg.primary" : "fg.secondary"}
            aria-current={isActive ? "step" : undefined}
            aria-label={canNavigate ? `Go back to ${step.title}` : undefined}
            cursor={canNavigate ? "pointer" : "default"}
            onClick={canNavigate ? () => onStepClick(index) : undefined}
            _hover={canNavigate ? { bg: "surface.raisedHover", color: "fg.primary" } : undefined}
            _focusVisible={canNavigate ? { boxShadow: "focus" } : undefined}
            _after={
              index < SETUP_STEPS.length - 1
                ? {
                    content: '""',
                    position: "absolute",
                    left: "26px",
                    top: "44px",
                    w: "1px",
                    h: "17px",
                    bg: isComplete ? "accent.highlight" : "border.default",
                  }
                : undefined
            }
          >
            <Flex
              boxSize="28px"
              flexShrink={0}
              align="center"
              justify="center"
              borderRadius="full"
              border="1px solid"
              borderColor={isActive || isComplete ? "accent.highlight" : "border.strong"}
              bg={isComplete ? "accent.highlight" : "surface.sunken"}
              color={isComplete ? "accentFg.highlight" : isActive ? "accent.highlight" : "fg.muted"}
              fontSize="xs"
              fontWeight="700"
            >
              {isComplete ? <CheckIcon boxSize={2.5} /> : index + 1}
            </Flex>
            <VStack align="stretch" spacing={0} minW={0}>
              <Text fontSize="sm" fontWeight={isActive ? "700" : "600"}>
                {step.title}
              </Text>
              <Text fontSize="xs" color="fg.muted" lineHeight="1.4">
                {step.description}
              </Text>
            </VStack>
          </HStack>
        );
      })}
    </VStack>
  );
}

export function OnboardingFrame({
  children,
  currentStep,
  onStepClick,
}: {
  children: ReactNode;
  currentStep?: number;
  onStepClick?: (step: number) => void;
}) {
  const showProgress = currentStep !== undefined;

  return (
    <Flex
      h="100vh"
      minH={0}
      overflow="hidden"
      bg="surface.base"
      color="fg.primary"
      justify="center"
      p={{ base: 0, lg: 6 }}
    >
      <Flex
        w="full"
        maxW={showProgress ? "1120px" : "440px"}
        h={{ base: "100vh", lg: "calc(100vh - 48px)" }}
        minH={0}
        overflow="hidden"
        bg="surface.base"
        border={{ base: "none", sm: "1px solid" }}
        borderColor="border.subtle"
        borderRadius={{ base: 0, lg: "xl" }}
      >
        {showProgress && (
          <Flex
            as="aside"
            display={{ base: "none", lg: "flex" }}
            w="280px"
            flexShrink={0}
            direction="column"
            justify="space-between"
            p={7}
            bg="surface.raised"
            borderRight="1px solid"
            borderColor="border.subtle"
          >
            <Box>
              <HStack spacing={3}>
                <Image src="/walletchan-icon.png" alt="" boxSize="38px" />
                <VStack align="stretch" spacing={0}>
                  <BrandWordmark />
                  <Text color="fg.muted" fontSize="xs">
                    Wallet setup
                  </Text>
                </VStack>
              </HStack>
              <ProgressRail currentStep={currentStep} onStepClick={onStepClick} />
            </Box>

            <HStack spacing={2.5} align="center" color="fg.muted">
              <LockIcon boxSize={3} color="accent.highlight" flexShrink={0} />
              <Text fontSize="xs" lineHeight="1.5">
                Credentials are encrypted before they are stored on this device.
              </Text>
            </HStack>
          </Flex>
        )}

        <Flex flex="1" minW={0} minH={0} direction="column">
          {children}
        </Flex>
      </Flex>
    </Flex>
  );
}

export function OnboardingProgress({
  currentStep,
  totalSteps,
}: {
  currentStep: number;
  totalSteps: number;
}) {
  return (
    <VStack
      display={{ base: "flex", lg: "none" }}
      spacing={2}
      align="stretch"
      w="full"
      aria-label={`Step ${currentStep + 1} of ${totalSteps}`}
    >
      <HStack spacing={1.5} aria-hidden="true">
        {Array.from({ length: totalSteps }).map((_, index) => (
          <Box
            key={index}
            h="3px"
            flex="1"
            borderRadius="full"
            bg={index <= currentStep ? "accent.highlight" : "border.default"}
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
  currentStep,
  onStepClick,
}: {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  currentStep?: number;
  onStepClick?: (step: number) => void;
}) {
  return (
    <OnboardingFrame currentStep={currentStep} onStepClick={onStepClick}>
      {header}
      <Box flex="1" minH={0} overflowY="auto" px={{ base: 5, sm: 7 }} py={6}>
        <Box w="full" maxW="600px" mx="auto">
          {children}
        </Box>
      </Box>
      {footer}
    </OnboardingFrame>
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
          <HStack spacing={2} minW="44px" display={{ base: "flex", lg: "none" }}>
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
      <Box w="full" maxW="600px" mx="auto">
        {children}
      </Box>
    </Box>
  );
}
