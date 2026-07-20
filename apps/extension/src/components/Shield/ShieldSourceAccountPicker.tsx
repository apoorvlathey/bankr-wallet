import {
  Box,
  Button,
  HStack,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Text,
  VStack,
} from "@chakra-ui/react";
import { CheckIcon, ChevronDownIcon } from "@chakra-ui/icons";
import type { Account } from "@/chrome/types";
import { AccountAvatar } from "@/components/AccountIdentity";
import { truncateAddress } from "@/lib/addressUtils";
import type { ShieldSourceAccount } from "./model/shieldQuote";

interface ShieldSourceAccountPickerProps {
  accounts: Account[];
  account: ShieldSourceAccount | null;
  onChange: (account: ShieldSourceAccount) => void;
}

function accountTypeCopy(account: Account): string {
  if (account.type === "privateKey") return "Private key · Sepolia";
  if (account.type === "seedPhrase") return "Seed phrase · Sepolia";
  if (account.type === "bankr") return "Sepolia shielding unavailable";
  return "View-only accounts cannot shield";
}

export default function ShieldSourceAccountPicker({
  accounts,
  account,
  onChange,
}: ShieldSourceAccountPickerProps) {
  const selected = account
    ? accounts.find((candidate) => candidate.id === account.id) ?? null
    : null;

  return (
    <HStack justify="space-between" spacing={3} minW={0}>
      <Box minW={0}>
        <Text fontSize="xs" fontWeight="700" color="fg.secondary">
          Deposit from
        </Text>
      </Box>
      <Menu placement="bottom-end" gutter={6} isLazy autoSelect={false}>
        <MenuButton
          as={Button}
          variant="secondary"
          minH="44px"
          h="auto"
          maxW="240px"
          px={2.5}
          rightIcon={<ChevronDownIcon />}
          aria-label="Choose the account to deposit from"
        >
          {selected ? (
            <HStack spacing={2} minW={0}>
              <AccountAvatar account={selected} ensAvatar={null} size={26} />
              <Box minW={0} textAlign="left">
                <Text fontSize="xs" fontWeight="700" noOfLines={1}>
                  {selected.displayName || truncateAddress(selected.address)}
                </Text>
                <Text fontSize="2xs" color="fg.secondary" noOfLines={1}>
                  {accountTypeCopy(selected)}
                </Text>
              </Box>
            </HStack>
          ) : (
            <Text fontSize="sm" fontWeight="700">Choose signer</Text>
          )}
        </MenuButton>
        <MenuList minW="300px" maxW="calc(100vw - 32px)" maxH="320px" overflowY="auto" py={1}>
          {accounts.map((candidate) => {
            const eligible = candidate.type === "privateKey" || candidate.type === "seedPhrase";
            const isSelected = candidate.id === account?.id;
            return (
              <MenuItem
                key={candidate.id}
                minH="62px"
                px={3}
                isDisabled={!eligible}
                onClick={() => eligible && onChange(candidate)}
              >
                <HStack w="full" spacing={3}>
                  <AccountAvatar account={candidate} ensAvatar={null} size={32} />
                  <VStack flex={1} minW={0} align="start" spacing={0}>
                    <Text fontSize="sm" fontWeight="700" noOfLines={1}>
                      {candidate.displayName || truncateAddress(candidate.address)}
                    </Text>
                    <Text fontSize="xs" color={eligible ? "fg.secondary" : "fg.muted"} noOfLines={1}>
                      {accountTypeCopy(candidate)}
                    </Text>
                  </VStack>
                  {isSelected && <CheckIcon boxSize="14px" color="accent.highlight" />}
                </HStack>
              </MenuItem>
            );
          })}
        </MenuList>
      </Menu>
    </HStack>
  );
}
