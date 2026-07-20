import {
  Button,
  Flex,
  Image,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  EyeIcon,
  KeyIcon,
  SeedIcon,
  SafeIcon,
} from "@/components/shared/AccountTypeIcons";
import { LedgerLogo } from "@/components/Ledger/LedgerLogo";

export type AccountType =
  | "bankr"
  | "privateKey"
  | "seedPhrase"
  | "ledger"
  | "impersonator"
  | "safe";

interface AddAccountTypeGridProps {
  hasBankrAccount: boolean;
  onSelect: (type: AccountType) => void;
}

const accountTypes = [
  {
    type: "privateKey" as const,
    title: "Private key",
    description: "Import a local signer",
    icon: KeyIcon,
    iconBg: "status.warning.bg",
    iconColor: "status.warning.fg",
  },
  {
    type: "seedPhrase" as const,
    title: "Seed phrase",
    description: "Import or create",
    icon: SeedIcon,
    iconBg: "status.info.bg",
    iconColor: "status.info.fg",
  },
  {
    type: "bankr" as const,
    title: "Bankr API",
    description: "Connect your account",
    icon: null,
    iconBg: "transparent",
    iconColor: "fg.primary",
  },
  {
    type: "safe" as const,
    title: "Safe",
    description: "Use an existing multisig",
    icon: SafeIcon,
    iconBg: "status.success.bg",
    iconColor: "status.success.fg",
  },
  {
    type: "impersonator" as const,
    title: "View-only",
    description: "Watch an address",
    icon: EyeIcon,
    iconBg: "status.success.bg",
    iconColor: "status.success.fg",
  },
  {
    type: "ledger" as const,
    title: "Ledger",
    description: "Connect a hardware wallet",
    icon: null,
    iconBg: "surface.sunken",
    iconColor: "fg.primary",
  },
];

export function AddAccountTypeGrid({
  hasBankrAccount,
  onSelect,
}: AddAccountTypeGridProps) {
  const ledgerUnavailable =
    typeof navigator === "undefined" || !("hid" in navigator);
  return (
    <SimpleGrid columns={2} spacing={3}>
      {accountTypes.map(
        ({
          type,
          title,
          description,
          icon: TypeIcon,
          iconBg,
          iconColor,
        }) => {
        const isDisabled =
          (type === "bankr" && hasBankrAccount) ||
          (type === "ledger" && ledgerUnavailable);

        return (
          <Button
            key={type}
            variant="secondary"
            role="group"
            minH="132px"
            h="auto"
            p={4}
            alignItems="stretch"
            justifyContent="space-between"
            whiteSpace="normal"
            textAlign="left"
            isDisabled={isDisabled}
            onClick={() => onSelect(type)}
            _hover={{
              bg: "surface.raisedHover",
              borderColor: "accent.highlight",
            }}
          >
            <VStack align="stretch" spacing={4} w="full">
              <Flex
                boxSize="36px"
                align="center"
                justify="center"
                borderRadius="md"
                bg={iconBg}
                color={iconColor}
              >
                {type === "ledger" ? (
                  <LedgerLogo variant="lettermark" w="20px" />
                ) : TypeIcon ? (
                  <TypeIcon boxSize="19px" />
                ) : (
                  <Image
                    src="/bankr-icon.png"
                    alt="Bankr"
                    boxSize="36px"
                    borderRadius="md"
                  />
                )}
              </Flex>
              <VStack align="stretch" spacing={0.5}>
                <Text color="fg.primary" fontSize="md" fontWeight="600">
                  {title}
                </Text>
                <Text color="fg.secondary" fontSize="sm" fontWeight="400">
                  {type === "bankr" && isDisabled
                    ? "Already connected"
                    : type === "ledger" && isDisabled
                      ? "Chrome 124+ required"
                      : description}
                </Text>
              </VStack>
            </VStack>
          </Button>
        );
        },
      )}
    </SimpleGrid>
  );
}
