import { Box, Button, HStack, Image, Text, VStack } from "@chakra-ui/react";
import { CheckIcon } from "@chakra-ui/icons";
import { EyeIcon, KeyIcon, SeedIcon } from "@/components/shared/AccountTypeIcons";
import { OnboardingCanvas, OnboardingFooter, OnboardingHeader } from "./OnboardingShell";

export type AccountTypeChoice =
  | "seedPhrase"
  | "privateKey"
  | "viewOnly"
  | "bankr";

type AccountOptionProps = {
  title: string;
  description: string;
  isSelected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
};

function AccountOption({
  title,
  description,
  isSelected,
  onSelect,
  icon,
  iconBg,
  iconColor,
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
      py={3.5}
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
          bg={isSelected ? "accent.highlight" : iconBg}
          color={isSelected ? "accentFg.highlight" : iconColor}
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
        </VStack>
        <Box
          w="20px"
          h="20px"
          mt={1}
          flexShrink={0}
          borderRadius="full"
          border="1px solid"
          borderColor={isSelected ? "accent.highlight" : "border.strong"}
          bg={isSelected ? "accent.highlight" : "transparent"}
          color="accentFg.highlight"
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
  onContinue,
}: {
  choice: AccountTypeChoice;
  onChoiceChange: (choice: AccountTypeChoice) => void;
  onContinue: () => void;
}) {
  return (
    <OnboardingCanvas
      currentStep={0}
      header={<OnboardingHeader step={0} />}
      footer={
        <OnboardingFooter>
          <Button variant="brand" size="lg" w="full" onClick={onContinue}>
            Continue
          </Button>
        </OnboardingFooter>
      }
    >
      <VStack align="stretch" spacing={6}>
        <VStack align="stretch" spacing={1.5}>
          <Text as="h1" fontSize="2xl" fontWeight="700" letterSpacing="-0.02em">
            Choose your first account
          </Text>
          <Text color="fg.secondary" fontSize="sm" lineHeight="1.5">
            You can add the other account types from Settings anytime.
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
            title="Seed phrase"
            description="Import or create a recovery phrase for one or more accounts."
            isSelected={choice === "seedPhrase"}
            onSelect={() => onChoiceChange("seedPhrase")}
            icon={<SeedIcon boxSize="20px" />}
            iconBg="status.info.bg"
            iconColor="status.info.fg"
          />
          <AccountOption
            title="Private key"
            description="Import or generate a signer stored on this device."
            isSelected={choice === "privateKey"}
            onSelect={() => onChoiceChange("privateKey")}
            icon={<KeyIcon boxSize="20px" />}
            iconBg="status.warning.bg"
            iconColor="status.warning.fg"
          />
          <AccountOption
            title="View-only"
            description="Follow an address without importing its signing keys."
            isSelected={choice === "viewOnly"}
            onSelect={() => onChoiceChange("viewOnly")}
            icon={<EyeIcon boxSize="20px" />}
            iconBg="status.success.bg"
            iconColor="status.success.fg"
          />
          <AccountOption
            title="Bankr API"
            description="Use your Bankr API key for AI-assisted wallet actions."
            isSelected={choice === "bankr"}
            onSelect={() => onChoiceChange("bankr")}
            icon={
              <Image
                src="/bankr-icon.png"
                alt=""
                boxSize="40px"
                borderRadius="md"
              />
            }
            iconBg="transparent"
            iconColor="fg.primary"
          />
        </Box>
      </VStack>
    </OnboardingCanvas>
  );
}
