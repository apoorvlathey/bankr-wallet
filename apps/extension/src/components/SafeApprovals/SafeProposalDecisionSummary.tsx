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
import {
  FeePaymentSelector,
  type FeePaymentQuoteSummary,
} from "@/components/FeePaymentSelector";
import type { NativeFeePaymentSummary } from "@/components/feePaymentUi";
import { useEffect, useState } from "react";
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
  proposalId,
  onSelect,
  onGasOverrides,
  onGasValidityChange,
  feePaymentToken,
  feePaymentQuote,
  onFeePaymentTokenChange,
  onFeePaymentQuoteChange,
  disabled = false,
}: {
  actionKind: SafeProposalActionKind;
  accounts: readonly DecisionAccount[];
  selectedAccount: DecisionAccount | null;
  safeOwnerAccountIds: ReadonlySet<string>;
  executionRequest: PendingTxRequest | null;
  proposalId: string;
  onSelect: (accountId: string) => void;
  onGasOverrides: (overrides: GasOverrides | null) => void;
  onGasValidityChange: (valid: boolean) => void;
  feePaymentToken: "native" | `0x${string}`;
  feePaymentQuote: FeePaymentQuoteSummary | null;
  onFeePaymentTokenChange: (token: "native" | `0x${string}`) => void;
  onFeePaymentQuoteChange: (quote: FeePaymentQuoteSummary | null) => void;
  disabled?: boolean;
}) {
  const [nativeFeeSummary, setNativeFeeSummary] =
    useState<NativeFeePaymentSummary | null>(null);
  useEffect(() => {
    setNativeFeeSummary(null);
  }, [executionRequest?.id]);
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
        isDisabled={disabled}
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
        <>
          <FeePaymentSelector
            txId={proposalId}
            chainId={executionRequest.tx.chainId}
            requestKind="safe"
            accountId={selectedAccount.id}
            value={feePaymentToken}
            quote={feePaymentQuote}
            nativeSummary={nativeFeeSummary}
            onChange={onFeePaymentTokenChange}
            onQuoteChange={onFeePaymentQuoteChange}
            disabled={disabled}
          />
          {feePaymentToken === "native" && (
            <GasEstimateDisplay
              txRequest={executionRequest}
              accountType={selectedAccount.type as "privateKey" | "seedPhrase"}
              onGasOverrides={onGasOverrides}
              onValidityChange={onGasValidityChange}
              onFeeSummaryChange={setNativeFeeSummary}
              isReadOnly={disabled}
            />
          )}
        </>
      )}
    </VStack>
  );
}
