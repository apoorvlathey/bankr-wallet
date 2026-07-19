import {
  Box,
  HStack,
  Spacer,
  StackDivider,
  Text,
  usePrefersReducedMotion,
  VStack,
} from "@chakra-ui/react";
import { useRef } from "react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import CalldataDecoder from "@/components/CalldataDecoder";
import { CalldataDigestDisplay } from "@/components/DigestDisplay";
import { RequestToolActions } from "@/components/RequestConfirmation/RequestToolActions";
import { InlineDisclosure } from "@/components/ui";
import { CopyButton } from "./CopyButton";
import { ForceInclusionOption } from "@/components/RequestConfirmation/ForceInclusionOption";
import type { ForceInclusionInfo } from "./types";
import type { FeePaymentQuoteSummary } from "@/components/FeePaymentSelector";
import { FeePaymentAdvancedDetails } from "@/components/FeePaymentAdvancedDetails";

interface AdvancedDetailsProps {
  txRequest: PendingTxRequest;
  clearSigningStatus: "loading" | "matched" | "absent";
  clearSigningMatched: boolean;
  parsedApproval: unknown;
  isErc7715PermissionRevoke: boolean;
  canBatchAccount: boolean;
  addToBatchDisabledReason: string | null;
  isAddingToBatch: boolean;
  batchedCount: number;
  forceInclusion: boolean;
  forceInclusionInfo: ForceInclusionInfo | null;
  feePaymentToken: "native" | `0x${string}`;
  feePaymentQuote: FeePaymentQuoteSummary | null;
  onFunctionName: (name: string | undefined) => void;
  onAddToBatch: () => void;
  onForceInclusionChange: (enabled: boolean) => void;
  isReadOnly?: boolean;
}

function TenderlyAndBatchControls({
  txRequest,
  canBatchAccount,
  addToBatchDisabledReason,
  isAddingToBatch,
  batchedCount,
  onAddToBatch,
  isReadOnly,
}: Pick<
  AdvancedDetailsProps,
  | "txRequest"
  | "canBatchAccount"
  | "addToBatchDisabledReason"
  | "isAddingToBatch"
  | "batchedCount"
  | "onAddToBatch"
  | "isReadOnly"
>) {
  const { tx } = txRequest;
  const params = new URLSearchParams({
    from: tx.from,
    value: tx.value || "0",
    rawFunctionInput: tx.data || "0x",
    network: String(tx.chainId),
    ...(tx.to ? { contractAddress: tx.to } : {}),
  });
  const tenderlyUrl = `https://dashboard.tenderly.co/simulator/new?${params}`;
  return (
    <RequestToolActions
      tenderlyUrl={tenderlyUrl}
      onOpenTenderly={() => chrome.tabs.create({ url: tenderlyUrl })}
      showAddToBatch={canBatchAccount}
      addToBatchDisabledReason={addToBatchDisabledReason}
      isAddingToBatch={isAddingToBatch}
      batchedCount={batchedCount}
      onAddToBatch={onAddToBatch}
      isInteractionDisabled={isReadOnly}
    />
  );
}

export function AdvancedDetails({
  txRequest,
  clearSigningStatus,
  clearSigningMatched,
  parsedApproval,
  isErc7715PermissionRevoke,
  canBatchAccount,
  addToBatchDisabledReason,
  isAddingToBatch,
  batchedCount,
  forceInclusion,
  forceInclusionInfo,
  feePaymentToken,
  feePaymentQuote,
  onFunctionName,
  onAddToBatch,
  onForceInclusionChange,
  isReadOnly = false,
}: AdvancedDetailsProps) {
  const { tx } = txRequest;
  const disclosureRef = useRef<HTMLDetailsElement>(null);
  const contentEndRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const handleOpenChange = (open: boolean) => {
    if (!open) return;
    requestAnimationFrame(() => {
      if (!disclosureRef.current?.open) return;
      contentEndRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "nearest",
      });
    });
  };

  return (
    <InlineDisclosure
      ref={disclosureRef}
      label="Advanced details"
      onOpenChange={handleOpenChange}
    >
      <VStack mt={2} spacing={2} align="stretch">
        <FeePaymentAdvancedDetails
          chainId={tx.chainId}
          token={feePaymentToken}
          quote={feePaymentQuote}
        />
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
          {tx.data &&
            tx.data !== "0x" &&
            tx.to &&
            clearSigningStatus !== "loading" && (
              <CalldataDecoder
                calldata={tx.data}
                to={tx.to}
                chainId={tx.chainId}
                onFunctionName={onFunctionName}
                defaultCollapsed={
                  !!parsedApproval ||
                  clearSigningMatched ||
                  isErc7715PermissionRevoke
                }
                flat
              />
            )}

          {tx.data && tx.data !== "0x" && !tx.to && (
            <Box px={3} py={2.5}>
              <HStack mb={2} alignItems="center">
                <Text fontSize="xs" color="fg.secondary" fontWeight="600">
                  Deploy data
                </Text>
                <Spacer />
                <CopyButton value={tx.data} />
              </HStack>
              <Box
                p={2.5}
                bg="surface.sunken"
                borderWidth="1px"
                borderStyle="solid"
                borderColor="border.subtle"
                borderRadius="md"
                maxH="100px"
                overflowY="auto"
                css={{
                  "&::-webkit-scrollbar": { width: "6px" },
                  "&::-webkit-scrollbar-track": {
                    background: "var(--chakra-colors-bg-muted)",
                  },
                  "&::-webkit-scrollbar-thumb": {
                    background: "var(--chakra-colors-border-default)",
                  },
                }}
              >
                <Text
                  fontSize="xs"
                  fontFamily="mono"
                  color="fg.primary"
                  wordBreak="break-all"
                  whiteSpace="pre-wrap"
                >
                  {tx.data}
                </Text>
              </Box>
            </Box>
          )}

          {tx.data && tx.data !== "0x" && (
            <Box>
              <CalldataDigestDisplay calldata={tx.data} quiet />
            </Box>
          )}

          <TenderlyAndBatchControls
            txRequest={txRequest}
            canBatchAccount={canBatchAccount}
            addToBatchDisabledReason={addToBatchDisabledReason}
            isAddingToBatch={isAddingToBatch}
            batchedCount={batchedCount}
            onAddToBatch={onAddToBatch}
            isReadOnly={isReadOnly}
          />

          {forceInclusionInfo && (
            <ForceInclusionOption
              enabled={forceInclusion}
              l1ChainName={forceInclusionInfo.l1ChainName}
              onChange={onForceInclusionChange}
              isDisabled={isReadOnly}
            />
          )}
        </VStack>
        </Box>
      </VStack>
      <Box ref={contentEndRef} h="1px" aria-hidden />
    </InlineDisclosure>
  );
}
