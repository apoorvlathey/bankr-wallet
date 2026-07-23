import { useState } from "react";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  Checkbox,
  Divider,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";

import type { Account } from "@/chrome/types";
import PublicRecoveryAccountIdentity from "./PublicRecoveryAccountIdentity";
import ShieldDashboard from "./ShieldDashboard";
import type { ShieldInitializationState } from "./hooks/useShieldInitialization";
import { formatShieldWei } from "./model/shieldQuote";
import type { PublicRecoveryPreview } from "./model/recovery";
import {
  SHIELDED_ETH_NETWORK_NAME,
} from "./model/shieldedAsset";

export interface PublicRecoveryReviewOption {
  preview: PublicRecoveryPreview;
  depositAccount: Account | null;
  displayName: string | null;
  ensAvatar: string | null;
  secondaryIdentity: string | null;
}

interface PublicRecoveryReviewScreenProps {
  options: readonly PublicRecoveryReviewOption[];
  initialization: ShieldInitializationState;
  status: "idle" | "previewing" | "ready" | "preparing" | "queued" | "error";
  error: string | null;
  onBack: () => void;
  onRetryInitialization: () => void;
  onUnlockRequired: () => void;
  onRecover: (previews: readonly PublicRecoveryPreview[]) => void;
}

/** Selectable whole-commitment review shown before any recovery proof or tx request exists. */
export default function PublicRecoveryReviewScreen({
  options,
  initialization,
  status,
  error,
  onBack,
  onRetryInitialization,
  onUnlockRequired,
  onRecover,
}: PublicRecoveryReviewScreenProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(options.length === 1 ? [options[0].preview.commitmentId] : []),
  );
  const [acknowledged, setAcknowledged] = useState(false);
  const groups = Array.from(options.reduce((byAccount, option) => {
    const key = [
      option.preview.accountId,
      option.preview.accountAddress.toLowerCase(),
      option.preview.accountType,
    ].join(":");
    const existing = byAccount.get(key);
    if (existing) existing.options.push(option);
    else byAccount.set(key, { key, options: [option] });
    return byAccount;
  }, new Map<string, { key: string; options: PublicRecoveryReviewOption[] }>()).values());
  const selectedOptions = options.filter((option) =>
    selectedIds.has(option.preview.commitmentId)
  );
  const hasLedgerOptions = options.some(
    (option) => option.preview.accountType === "ledger",
  );
  const activeGroupKey = groups.find((group) =>
    group.options.some((option) => selectedIds.has(option.preview.commitmentId))
  )?.key ?? null;
  const selectedTotalWei = selectedOptions.reduce(
    (total, option) => total + option.preview.amountWei,
    0n,
  );
  const canRecover = initialization.status === "ready" && selectedOptions.length > 0 &&
    acknowledged &&
    status !== "preparing" && status !== "queued";

  const toggleDeposit = (groupKey: string, commitmentId: string, checked: boolean) => {
    if (activeGroupKey && activeGroupKey !== groupKey) return;
    const group = groups.find((candidate) => candidate.key === groupKey);
    const selectionLimit =
      group?.options[0]?.preview.accountType === "ledger" ? 1 : 8;
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) {
        if (next.size >= selectionLimit) return current;
        next.add(commitmentId);
      } else {
        next.delete(commitmentId);
      }
      return next;
    });
    setAcknowledged(false);
  };

  const toggleGroup = (
    group: { key: string; options: PublicRecoveryReviewOption[] },
    checked: boolean,
  ) => {
    if (activeGroupKey && activeGroupKey !== group.key) return;
    if (group.options[0]?.preview.accountType === "ledger") return;
    setSelectedIds(checked
      ? new Set(group.options.slice(0, 8).map((option) => option.preview.commitmentId))
      : new Set());
    setAcknowledged(false);
  };

  return (
    <ShieldDashboard
      title="Public exit"
      onBack={onBack}
      initialization={initialization}
      onRetryInitialization={onRetryInitialization}
      onUnlockRequired={onUnlockRequired}
      content={(
        <VStack align="stretch" spacing={4}>
          <Box>
            <Text fontSize="sm" fontWeight="700" color="fg.primary">
              Available deposits
            </Text>
            <Text mt={0.5} fontSize="xs" color="fg.muted" lineHeight="1.45">
              Select whole deposits from one account.{" "}
              {hasLedgerOptions
                ? "Ledger deposits exit one at a time; other accounts can group up to 8."
                : "They’ll exit in one public transaction (up to 8 at a time)."}
            </Text>
          </Box>

          <VStack align="stretch" spacing={3}>
            {groups.map((group) => {
              const first = group.options[0];
              const groupSelectedCount = group.options.filter((option) =>
                selectedIds.has(option.preview.commitmentId)
              ).length;
              const groupDisabled = activeGroupKey !== null && activeGroupKey !== group.key;
              const isLedgerGroup = first.preview.accountType === "ledger";
              const selectionLimit = isLedgerGroup ? 1 : 8;
              const allSelected =
                groupSelectedCount === Math.min(group.options.length, selectionLimit);
              return (
                <Box
                  key={group.key}
                  bg="surface.raised"
                  borderWidth="1px"
                  borderColor={groupSelectedCount > 0 ? "accent.highlight" : "border.default"}
                  borderRadius="md"
                  opacity={groupDisabled ? 0.55 : 1}
                >
                  <Box px={3} py={2.5}>
                    <HStack justify="space-between" align="center" spacing={3}>
                      <PublicRecoveryAccountIdentity
                        account={first.depositAccount}
                        address={first.preview.accountAddress}
                        displayName={first.displayName}
                        ensAvatar={first.ensAvatar}
                        secondaryIdentity={first.secondaryIdentity}
                        size={32}
                      />
                      {group.options.length > 1 && !isLedgerGroup ? (
                        <Checkbox
                          flexShrink={0}
                          variant="commitment"
                          isChecked={allSelected}
                          isIndeterminate={groupSelectedCount > 0 && !allSelected}
                          isDisabled={groupDisabled}
                          onChange={(event) => toggleGroup(group, event.target.checked)}
                        >
                          <Text fontSize="xs" fontWeight="600" color="fg.secondary">
                            {group.options.length > 8 ? "Select 8 max" : "Select all"}
                          </Text>
                        </Checkbox>
                      ) : null}
                    </HStack>
                    <Text mt={1.5} fontSize="2xs" color="fg.muted">
                      {group.options.length} {group.options.length === 1 ? "deposit" : "deposits"}
                      {isLedgerGroup && group.options.length > 1
                        ? " · One per Ledger transaction"
                        : group.options.length > 8
                          ? " · Up to 8 per transaction"
                          : ""}
                      {groupDisabled ? " · Clear the other account to select" : ""}
                    </Text>
                  </Box>
                  <Divider borderColor="border.subtle" />
                  <VStack align="stretch" spacing={0} divider={<Divider borderColor="border.subtle" />}>
                    {group.options.map((option) => {
                      const isSelected = selectedIds.has(option.preview.commitmentId);
                      const limitReached =
                        selectedIds.size >= selectionLimit && !isSelected;
                      return (
                        <Checkbox
                          key={option.preview.commitmentId}
                          w="full"
                          minH="54px"
                          px={3}
                          py={2}
                          variant="commitment"
                          isChecked={isSelected}
                          isDisabled={groupDisabled || limitReached}
                          onChange={(event) => toggleDeposit(
                            group.key,
                            option.preview.commitmentId,
                            event.target.checked,
                          )}
                          bg={isSelected ? "status.warning.tint" : "transparent"}
                          sx={{
                            ".chakra-checkbox__label": {
                              flex: "1",
                              minWidth: 0,
                            },
                          }}
                        >
                          <HStack w="full" minW={0} pl={1} justify="space-between" spacing={3}>
                            <Box minW={0}>
                              <Text
                                fontFamily="mono"
                                fontSize="sm"
                                fontWeight="700"
                                color="fg.primary"
                                sx={{ fontVariantNumeric: "tabular-nums" }}
                              >
                                {formatShieldWei(option.preview.amountWei)} ETH
                              </Text>
                              {option.preview.withdrawnAmountWei > 0n ? (
                                <Text mt={0.5} fontSize="2xs" color="fg.muted" lineHeight="1.35">
                                  Originally {formatShieldWei(option.preview.originalAmountWei)} ETH
                                  {" · "}{formatShieldWei(option.preview.withdrawnAmountWei)} ETH unshielded
                                </Text>
                              ) : null}
                            </Box>
                            <Text flexShrink={0} fontSize="2xs" color="fg.muted">
                              {new Date(option.preview.createdAt).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                            </Text>
                          </HStack>
                        </Checkbox>
                      );
                    })}
                  </VStack>
                </Box>
              );
            })}
          </VStack>

          {selectedOptions.length > 0 ? (
            <HStack justify="space-between" spacing={3} px={1}>
              <Text fontSize="xs" color="fg.secondary">
                {selectedOptions.length} {selectedOptions.length === 1 ? "deposit" : "deposits"}
              </Text>
              <Text
                fontFamily="mono"
                fontSize="sm"
                fontWeight="700"
                color="fg.primary"
                sx={{ fontVariantNumeric: "tabular-nums" }}
              >
                {formatShieldWei(selectedTotalWei)} ETH total
              </Text>
            </HStack>
          ) : null}

          <Box
            role="note"
            px={3}
            py={2.5}
            bg="status.warning.tint"
            borderWidth="1px"
            borderColor="status.warning.border"
            borderRadius="md"
          >
            <HStack align="flex-start" spacing={2}>
              <InfoOutlineIcon
                boxSize="14px"
                mt="2px"
                flexShrink={0}
                color="status.warning.emphasis"
                aria-hidden
              />
              <Box minW={0}>
                <Text fontSize="xs" fontWeight="700" color="fg.primary">
                  Public withdrawal
                </Text>
                <Text mt={0.5} fontSize="xs" color="fg.secondary" lineHeight="1.45">
                  This directly links the withdrawal to its original {SHIELDED_ETH_NETWORK_NAME} deposit.
                </Text>
              </Box>
            </HStack>
          </Box>

          {error || status === "queued" ? (
            <Text
              fontSize="xs"
              color={status === "error" ? "status.error.emphasis" : "fg.secondary"}
              role={status === "error" ? "alert" : "status"}
            >
              {error ?? "Open the wallet confirmation to continue."}
            </Text>
          ) : null}
        </VStack>
      )}
      actionNotice={(
        <Checkbox
          w="full"
          minH="44px"
          variant="commitment"
          justifyContent="center"
          isChecked={acknowledged}
          isDisabled={selectedOptions.length === 0}
          onChange={(event) => setAcknowledged(event.target.checked)}
        >
          <Text fontSize="sm" fontWeight="600" color="fg.primary" textAlign="center">
            I understand this exit is public
          </Text>
        </Checkbox>
      )}
      primaryAction={(
        <Button
          variant="brand"
          onClick={() => selectedOptions.length > 0 && onRecover(
            selectedOptions.map((option) => option.preview),
          )}
          isLoading={status === "preparing"}
          loadingText="Preparing public exit…"
          isDisabled={!canRecover}
        >
          {selectedOptions.length > 1
            ? `Withdraw ${selectedOptions.length} deposits`
            : "Withdraw selected deposit"}
        </Button>
      )}
    />
  );
}
