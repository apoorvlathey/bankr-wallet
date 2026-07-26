import { WarningTwoIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  HStack,
  Popover,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  Portal,
  Text,
  VStack,
} from "@chakra-ui/react";
import { useState } from "react";

import type { ResidualApproval } from "@/chrome/txSimulation";
import { TokenContractPopover } from "@/components/shared/TokenContractPopover";
import TokenLogo from "@/components/TokenLogo";
import type { AssetChangesDisplayProps } from "./types";

type ApprovalCleanup = NonNullable<
  AssetChangesDisplayProps["approvalCleanup"]
>;

function approvalKey(approval: ResidualApproval): string {
  return [
    approval.tokenAddress.toLowerCase(),
    approval.spender.toLowerCase(),
  ].join(":");
}

export function ResidualApprovalBanner({
  approvals,
  cleanup,
  explorerUrl,
  flushBottom = false,
}: {
  approvals: ResidualApproval[];
  cleanup?: ApprovalCleanup;
  explorerUrl: string;
  flushBottom?: boolean;
}) {
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [allPending, setAllPending] = useState(false);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);

  if (approvals.length === 0) return null;
  const remainingApprovals = approvals.filter(
    (approval) => !completed.has(approvalKey(approval)),
  );
  const showRevokeAll = !!cleanup && remainingApprovals.length > 1;

  return (
    <VStack
      align="stretch"
      spacing={2}
      mx={-3}
      mt={3}
      mb={flushBottom ? -3 : 0}
      px={3}
      py={2}
      bg="status.warning.tint"
      borderTop="1px solid"
      borderColor="status.warning.border"
    >
      <HStack align="center" spacing={2}>
        <WarningTwoIcon
          boxSize="14px"
          color="status.warning.fg"
          flexShrink={0}
          aria-hidden
        />
        <Text minW={0} fontSize="sm" fontWeight="700" color="status.warning.fg">
          {approvals.length === 1
            ? "Approval remains after this transaction"
            : "Approvals remain after this transaction"}
        </Text>
      </HStack>

      {approvals.map((approval) => {
        const key = approvalKey(approval);
        const isComplete = completed.has(key);
        const isPending = pendingKey === key;
        const disabledReason = cleanup?.disabledReason;
        return (
          <Box key={key}>
            <HStack justify="space-between" align="center" spacing={2}>
              <HStack minW={0} spacing={2}>
                <TokenLogo
                  logoUrl={approval.logoUrl}
                  symbol={approval.symbol}
                  alt={approval.symbol}
                  size="26px"
                  fontSize="7px"
                />
                <TokenContractPopover
                  address={approval.tokenAddress}
                  explorer={explorerUrl || undefined}
                  symbol={approval.symbol}
                  triggerColor="fg.primary"
                >
                  <Text
                    minW={0}
                    fontSize="sm"
                    fontWeight="700"
                    lineHeight="1.2"
                    noOfLines={1}
                  >
                    {approval.symbol}
                  </Text>
                </TokenContractPopover>
              </HStack>
              {cleanup && (
                <Popover
                  trigger="hover"
                  placement="top-end"
                  openDelay={150}
                  closeDelay={180}
                  gutter={8}
                  isLazy
                >
                  <PopoverTrigger>
                    <Button
                      size="sm"
                      variant="outline"
                      flexShrink={0}
                      minH="36px"
                      h="36px"
                      px={3}
                      fontSize="xs"
                      bg="status.warning.bg"
                      color="status.warning.fg"
                      borderColor="status.warning.border"
                      _hover={{
                        bg: "accent.highlight",
                        color: "accentFg.highlight",
                        borderColor: "accent.highlight",
                      }}
                      isLoading={isPending}
                      isDisabled={
                        isComplete ||
                        allPending ||
                        (!!pendingKey && !isPending) ||
                        !!disabledReason
                      }
                      loadingText="Adding"
                      aria-label="Add an approval revoke call after this transaction"
                      onClick={() => {
                        setPendingKey(key);
                        setError(null);
                        void cleanup
                          .onRevoke(approval)
                          .then((result) => {
                            setPendingKey(null);
                            if (!result.success) {
                              setError(
                                result.error ||
                                  "Could not add approval cleanup",
                              );
                              return;
                            }
                            setCompleted((current) =>
                              new Set(current).add(key),
                            );
                          })
                          .catch((caught) => {
                            setPendingKey(null);
                            setError(
                              caught instanceof Error
                                ? caught.message
                                : "Could not add approval cleanup",
                            );
                          });
                      }}
                    >
                      {isComplete ? "Added" : "Revoke?"}
                    </Button>
                  </PopoverTrigger>
                  <Portal>
                    <PopoverContent
                      w="240px"
                      maxW="calc(100vw - 24px)"
                      _focus={{ outline: "none" }}
                    >
                      <PopoverBody px={3} py={2.5}>
                        <Text fontSize="xs" color="fg.secondary" lineHeight="1.45">
                          Adds batch call at the end of transaction request to
                          revoke allowance
                        </Text>
                      </PopoverBody>
                    </PopoverContent>
                  </Portal>
                </Popover>
              )}
            </HStack>
            {disabledReason && (
              <Text mt={1} pl="34px" fontSize="xs" color="fg.secondary">
                {disabledReason}
              </Text>
            )}
          </Box>
        );
      })}

      {showRevokeAll && (
        <Box pt={1} textAlign="center">
          <Button
            size="sm"
            variant="outline"
            minH="36px"
            h="36px"
            minW="112px"
            px={4}
            fontSize="xs"
            fontWeight="700"
            bg="status.warning.bg"
            color="status.warning.fg"
            borderColor="status.warning.border"
            _hover={{
              bg: "accent.highlight",
              color: "accentFg.highlight",
              borderColor: "accent.highlight",
            }}
            isLoading={allPending}
            isDisabled={!!pendingKey || !!cleanup.disabledReason}
            loadingText="Adding all"
            aria-label={`Add ${remainingApprovals.length} approval revoke calls after this transaction`}
            onClick={() => {
              setAllPending(true);
              setError(null);
              void cleanup
                .onRevokeAll(remainingApprovals)
                .then((result) => {
                  setAllPending(false);
                  if (!result.success) {
                    setError(
                      result.error ||
                        "Could not add all approval cleanups",
                    );
                    return;
                  }
                  setCompleted((current) => {
                    const next = new Set(current);
                    remainingApprovals.forEach((approval) =>
                      next.add(approvalKey(approval))
                    );
                    return next;
                  });
                })
                .catch((caught) => {
                  setAllPending(false);
                  setError(
                    caught instanceof Error
                      ? caught.message
                      : "Could not add all approval cleanups",
                  );
                });
            }}
          >
            Revoke all
          </Button>
        </Box>
      )}

      {!cleanup && (
        <Text fontSize="xs" color="fg.secondary">
          Revoke this allowance separately after the transaction.
        </Text>
      )}
      {error && (
        <Text role="alert" fontSize="xs" color="status.error.fg">
          {error}
        </Text>
      )}
    </VStack>
  );
}
