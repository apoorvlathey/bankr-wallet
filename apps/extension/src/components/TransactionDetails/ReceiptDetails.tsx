import {
  Box,
  Button,
  HStack,
  StackDivider,
  Text,
  VStack,
  type BoxProps,
} from "@chakra-ui/react";
import type { ReactNode } from "react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { CopyButton } from "@/components/CopyButton";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import { formatEth } from "@/lib/gasFormatUtils";
import { formatLocalTimestamp } from "./formatting";

function ReceiptRow({
  label,
  children,
  align = "center",
}: {
  label: string;
  children: ReactNode;
  align?: BoxProps["alignItems"];
}) {
  return (
    <HStack
      minH="48px"
      px={3}
      py={2.5}
      spacing={3}
      align={align}
      justify="space-between"
    >
      <Text color="fg.secondary" fontSize="xs" fontWeight="600" flexShrink={0}>
        {label}
      </Text>
      <Box minW={0} textAlign="right">
        {children}
      </Box>
    </HStack>
  );
}

export default function ReceiptDetails({
  tx,
  nativeSym,
  txFee,
  estimatedMaxCost,
  displayTimestamp,
  explorerBase,
  onViewExplorer,
  formatWeiUsd,
}: {
  tx: CompletedTransaction;
  nativeSym: string;
  txFee: string | undefined;
  estimatedMaxCost: string | undefined;
  displayTimestamp: number;
  explorerBase: string;
  onViewExplorer: () => void;
  formatWeiUsd: (raw: string | undefined | null) => string | null;
}) {
  const feeRaw = txFee ?? estimatedMaxCost;
  const feeLabel = feeRaw ? formatEth(feeRaw, nativeSym) : null;
  const feeUsd = formatWeiUsd(feeRaw);
  const transactionHash = tx.txHash?.match(/0x[a-fA-F0-9]{64}/u)?.[0] ?? null;

  return (
    <Box
      bg="surface.raised"
      borderWidth="1px"
      borderStyle="solid"
      borderColor="border.default"
      borderRadius="lg"
      overflow="hidden"
    >
      <VStack
        spacing={0}
        align="stretch"
        divider={<StackDivider borderColor="border.subtle" />}
      >
        <ReceiptRow label="Signing account" align="flex-start">
          <FromAccountDisplay address={tx.tx.from} />
        </ReceiptRow>

        {feeLabel && (
          <ReceiptRow label={txFee ? "Network fee" : "Maximum fee"}>
            <VStack spacing={0} align="flex-end">
              <Text color="fg.primary" fontSize="xs" fontWeight="700">
                {feeLabel}
              </Text>
              {feeUsd && (
                <Text color="fg.secondary" fontSize="2xs" fontWeight="600">
                  {feeUsd}
                </Text>
              )}
            </VStack>
          </ReceiptRow>
        )}

        <ReceiptRow
          label={
            tx.status === "pending" || tx.status === "processing"
              ? "Submitted"
              : "Recorded"
          }
        >
          <Text
            color="fg.primary"
            fontSize="xs"
            fontWeight="600"
            sx={{ fontVariantNumeric: "tabular-nums" }}
          >
            {formatLocalTimestamp(displayTimestamp)}
          </Text>
        </ReceiptRow>

        {tx.parentBundleId && tx.bundleIndex !== undefined && (
          <ReceiptRow label="Batch">
            <VStack spacing={0} align="flex-end">
              <Text color="fg.primary" fontSize="xs" fontWeight="700">
                Sequential call {tx.bundleIndex + 1}
              </Text>
              <Text color="fg.secondary" fontSize="2xs" fontWeight="600">
                Submitted as an individual transaction
              </Text>
            </VStack>
          </ReceiptRow>
        )}

        {transactionHash && (
          <ReceiptRow label="Transaction">
            <HStack spacing={0.5} justify="flex-end">
              {explorerBase ? (
                <Button
                  type="button"
                  variant="unstyled"
                  display="inline-flex"
                  alignItems="center"
                  minH="24px"
                  color="fg.primary"
                  fontFamily="mono"
                  fontSize="xs"
                  fontWeight="600"
                  onClick={onViewExplorer}
                  aria-label="View transaction on explorer"
                  _hover={{ color: "accent.highlight" }}
                  _focusVisible={{ boxShadow: "focus" }}
                >
                  {transactionHash.slice(0, 8)}…{transactionHash.slice(-6)}
                </Button>
              ) : (
                <Text
                  color="fg.primary"
                  fontFamily="mono"
                  fontSize="xs"
                  fontWeight="600"
                >
                  {transactionHash.slice(0, 8)}…{transactionHash.slice(-6)}
                </Text>
              )}
              <CopyButton value={transactionHash} label="Copy transaction hash" />
            </HStack>
          </ReceiptRow>
        )}
      </VStack>
    </Box>
  );
}
