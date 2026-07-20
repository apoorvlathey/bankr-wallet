import { ChevronDownIcon } from "@chakra-ui/icons";
import {
  Badge,
  Button,
  HStack,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Portal,
  Text,
  VStack,
} from "@chakra-ui/react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import type { GasOverrides } from "@/chrome/txHandlers";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import GasEstimateDisplay from "@/components/GasEstimateDisplay";
import type {
  SafeExecutorAccount,
  SafeOwnerAccount,
  SafeProposalActionKind,
} from "./safeProposalActionModel";

type DecisionAccount = SafeOwnerAccount | SafeExecutorAccount;

export function SafeProposalDecisionSummary({
  actionKind,
  accounts,
  selectedAccount,
  safeOwnerAccountIds,
  executionRequest,
  onSelect,
  onGasOverrides,
  onGasValidityChange,
}: {
  actionKind: SafeProposalActionKind;
  accounts: readonly DecisionAccount[];
  selectedAccount: DecisionAccount | null;
  safeOwnerAccountIds: ReadonlySet<string>;
  executionRequest: PendingTxRequest | null;
  onSelect: (accountId: string) => void;
  onGasOverrides: (overrides: GasOverrides | null) => void;
  onGasValidityChange: (valid: boolean) => void;
}) {
  if (!actionKind || !selectedAccount) return null;

  const identity = accounts.length > 1 ? (
    <Menu placement="top-end" isLazy autoSelect={false}>
      <MenuButton
        as={Button}
        variant="ghost"
        size="sm"
        minH="36px"
        h="auto"
        maxW="230px"
        px={2}
        rightIcon={<ChevronDownIcon boxSize={4} />}
        aria-label={actionKind === "execute" ? "Choose execution account" : "Choose signing account"}
      >
        <FromAccountDisplay address={selectedAccount.address} />
      </MenuButton>
      <Portal>
        <MenuList minW="260px">
          {accounts.map((account) => (
            <MenuItem
              key={account.id}
              minH="48px"
              onClick={() => onSelect(account.id)}
              aria-current={account.id === selectedAccount.id ? "true" : undefined}
            >
              <HStack w="full" minW={0} justify="space-between" spacing={3}>
                <FromAccountDisplay address={account.address} />
                {actionKind === "execute" && safeOwnerAccountIds.has(account.id) && (
                  <Badge variant="subtle" fontSize="2xs" flexShrink={0}>
                    Owner
                  </Badge>
                )}
              </HStack>
            </MenuItem>
          ))}
        </MenuList>
      </Portal>
    </Menu>
  ) : (
    <FromAccountDisplay address={selectedAccount.address} />
  );

  return (
    <VStack align="stretch" spacing={2}>
      <HStack minW={0} justify="space-between" spacing={3}>
        <Text color="fg.secondary" fontSize="xs" fontWeight="600" flexShrink={0}>
          {actionKind === "execute" ? "Execute with" : "Signing with"}
        </Text>
        <HStack minW={0} justify="flex-end">
          {identity}
        </HStack>
      </HStack>

      {actionKind === "execute" && executionRequest && (
        <GasEstimateDisplay
          txRequest={executionRequest}
          accountType={selectedAccount.type as "privateKey" | "seedPhrase"}
          onGasOverrides={onGasOverrides}
          onValidityChange={onGasValidityChange}
        />
      )}
    </VStack>
  );
}
