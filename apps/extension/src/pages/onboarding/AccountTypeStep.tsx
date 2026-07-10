import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";
import { CheckIcon } from "@chakra-ui/icons";
import { KeyIcon, RobotIcon, SeedIcon } from "@/components/shared/AccountTypeIcons";
import { OnboardingCanvas, OnboardingFooter, OnboardingHeader } from "./OnboardingShell";

export type AccountTypeChoice = "bankr" | "privateKey" | "seedPhrase";

type AccountOptionProps = {
  title: string;
  description: string;
  note: string;
  isSelected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
};

function AccountOption({
  title,
  description,
  note,
  isSelected,
  onSelect,
  icon,
}: AccountOptionProps) {
  return (
    <Box
      as="button"
      type="button"
      role="radio"
      aria-checked={isSelected}
      onClick={onSelect}
      w="full"
      px={4}
      py={4}
      textAlign="left"
      bg={isSelected ? "surface.raisedHover" : "transparent"}
      borderBottom="1px solid"
      borderColor="border.subtle"
      _last={{ borderBottom: 0 }}
      _hover={{ bg: "surface.raisedHover" }}
      _active={{ bg: "surface.sunken" }}
      _focusVisible={{ boxShadow: "inset 0 0 0 2px var(--chakra-colors-border-focus)" }}
      transitionProperty="background-color, box-shadow"
      transitionDuration="fast"
    >
      <HStack spacing={3.5} align="start">
        <Box
          w="40px"
          h="40px"
          flexShrink={0}
          borderRadius="md"
          bg={isSelected ? "accent.primary" : "surface.sunken"}
          color={isSelected ? "accentFg.primary" : "fg.secondary"}
          display="grid"
          placeItems="center"
        >
          {icon}
        </Box>
        <VStack align="stretch" spacing={0.5} flex={1} minW={0}>
          <Text fontSize="md" fontWeight="600" color="fg.primary">
            {title}
          </Text>
          <Text fontSize="sm" lineHeight="1.45" color="fg.secondary">
            {description}
          </Text>
          <Text fontSize="xs" color="fg.muted" pt={1}>
            {note}
          </Text>
        </VStack>
        <Box
          w="20px"
          h="20px"
          mt={1}
          flexShrink={0}
          borderRadius="full"
          border="1px solid"
          borderColor={isSelected ? "accent.primary" : "border.strong"}
          bg={isSelected ? "accent.primary" : "transparent"}
          color="accentFg.primary"
          display="grid"
          placeItems="center"
          aria-hidden="true"
        >
          {isSelected && <CheckIcon boxSize={2.5} />}
        </Box>
      </HStack>
    </Box>
  );
}

export function AccountTypeStep({
  choice,
  onChoiceChange,
  onBack,
  onContinue,
}: {
  choice: AccountTypeChoice;
  onChoiceChange: (choice: AccountTypeChoice) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <OnboardingCanvas
      header={<OnboardingHeader onBack={onBack} step={0} />}
      footer={
        <OnboardingFooter>
          <Button variant="primary" size="lg" w="full" onClick={onContinue}>
            Continue
          </Button>
        </OnboardingFooter>
      }
    >
      <VStack align="stretch" spacing={6}>
        <VStack align="stretch" spacing={1.5}>
          <Text as="h1" fontSize="2xl" fontWeight="700" letterSpacing="-0.02em">
            How would you like to start?
          </Text>
          <Text color="fg.secondary" fontSize="sm" lineHeight="1.5">
            Choose your first account. You can add the others from Settings later.
          </Text>
        </VStack>

        <Box
          role="radiogroup"
          aria-label="Account type"
          bg="surface.raised"
          border="1px solid"
          borderColor="border.default"
          borderRadius="lg"
          overflow="hidden"
        >
          <AccountOption
            title="Bankr account"
            description="Connect an address to the Bankr API for AI-assisted wallet actions."
            note="No seed phrase required"
            isSelected={choice === "bankr"}
            onSelect={() => onChoiceChange("bankr")}
            icon={<RobotIcon boxSize="20px" />}
          />
          <AccountOption
            title="Private key"
            description="Import or generate one account and sign locally on this device."
            note="Best for a single existing account"
            isSelected={choice === "privateKey"}
            onSelect={() => onChoiceChange("privateKey")}
            icon={<KeyIcon boxSize="20px" />}
          />
          <AccountOption
            title="Seed phrase"
            description="Import or create a recovery phrase with multiple derived accounts."
            note="Best for a traditional self-custody wallet"
            isSelected={choice === "seedPhrase"}
            onSelect={() => onChoiceChange("seedPhrase")}
            icon={<SeedIcon boxSize="20px" />}
          />
        </Box>
      </VStack>
    </OnboardingCanvas>
  );
}
