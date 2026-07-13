import { ExternalLinkIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  Flex,
  HStack,
  Spacer,
  Text,
  Tooltip,
  VStack,
} from "@chakra-ui/react";
import type { PendingTxRequest } from "@/chrome/requests/pendingTxStorage";
import type { GasOverrides } from "@/chrome/txHandlers";
import CalldataDecoder from "@/components/CalldataDecoder";
import { CalldataDigestDisplay } from "@/components/DigestDisplay";
import GasEstimateDisplay from "@/components/GasEstimateDisplay";
import { InlineDisclosure } from "@/components/ui";
import { useTheme } from "@/theme";
import { CopyButton } from "./CopyButton";
import type { TransactionAccountType } from "./types";

interface AdvancedDetailsProps {
  txRequest: PendingTxRequest;
  accountType?: TransactionAccountType;
  gasEstimateKey: number;
  forceInclusion: boolean;
  isValueMalformed: boolean;
  clearSigningStatus: "loading" | "matched" | "absent";
  clearSigningMatched: boolean;
  parsedApproval: unknown;
  isErc7715PermissionRevoke: boolean;
  canBatchAccount: boolean;
  addToBatchDisabledReason: string | null;
  isAddingToBatch: boolean;
  batchedCount: number;
  onGasOverrides: (overrides: GasOverrides | null) => void;
  onGasValidityChange: (valid: boolean) => void;
  onFunctionName: (name: string | undefined) => void;
  onAddToBatch: () => void;
}

function TenderlyAndBatchControls({
  txRequest,
  canBatchAccount,
  addToBatchDisabledReason,
  isAddingToBatch,
  batchedCount,
  onAddToBatch,
}: Pick<
  AdvancedDetailsProps,
  | "txRequest"
  | "canBatchAccount"
  | "addToBatchDisabledReason"
  | "isAddingToBatch"
  | "batchedCount"
  | "onAddToBatch"
>) {
  const { tokens } = useTheme();
  const { tx } = txRequest;
  const params = new URLSearchParams({
    from: tx.from,
    value: tx.value || "0",
    rawFunctionInput: tx.data || "0x",
    network: String(tx.chainId),
    ...(tx.to ? { contractAddress: tx.to } : {}),
  });
  const tenderlyUrl = `https://dashboard.tenderly.co/simulator/new?${params}`;
  const tenderlyBox = (
    <HStack
      spacing={2}
      w="full"
      border={tokens.borders.thin}
      borderColor="border.default"
      borderRadius="md"
      px={3}
      py={1.5}
      justify="center"
      _hover={{ bg: "bg.muted" }}
      transition="background 0.15s"
    >
      <CopyButton value={tenderlyUrl} label="Copy Tenderly URL" />
      <HStack
        as="button"
        type="button"
        spacing={2}
        cursor="pointer"
        minH="32px"
        appearance="none"
        bg="transparent"
        border={0}
        color="inherit"
        onClick={() => chrome.tabs.create({ url: tenderlyUrl })}
      >
        <Text fontWeight="600" fontSize="xs">
          Simulate on Tenderly
        </Text>
        <ExternalLinkIcon boxSize={3} />
      </HStack>
    </HStack>
  );

  if (!canBatchAccount) return tenderlyBox;
  return (
    <HStack spacing={1.5} w="full" align="stretch">
      <Box flex={1} minW={0}>
        {tenderlyBox}
      </Box>
      <Tooltip
        label={addToBatchDisabledReason ?? ""}
        isDisabled={!addToBatchDisabledReason}
        hasArrow
        fontSize="xs"
      >
        <Flex alignSelf="stretch" flexShrink={0}>
          <Button
            variant="outline"
            onClick={onAddToBatch}
            isDisabled={!!addToBatchDisabledReason || isAddingToBatch}
            isLoading={isAddingToBatch}
            aria-label="Add to batch"
            fontWeight="600"
            textTransform="none"
            letterSpacing="normal"
            fontSize="xs"
            px={2.5}
            h="full"
            minH={8}
          >
            {batchedCount > 0 ? `+ Batch (${batchedCount})` : "+ Batch"}
          </Button>
        </Flex>
      </Tooltip>
    </HStack>
  );
}

export function AdvancedDetails({
  txRequest,
  accountType,
  gasEstimateKey,
  forceInclusion,
  isValueMalformed,
  clearSigningStatus,
  clearSigningMatched,
  parsedApproval,
  isErc7715PermissionRevoke,
  canBatchAccount,
  addToBatchDisabledReason,
  isAddingToBatch,
  batchedCount,
  onGasOverrides,
  onGasValidityChange,
  onFunctionName,
  onAddToBatch,
}: AdvancedDetailsProps) {
  const { tokens } = useTheme();
  const { tx } = txRequest;
  return (
    <InlineDisclosure label="Advanced details">
      <VStack spacing={3} align="stretch" pt={3}>
        {!isValueMalformed && (
          <GasEstimateDisplay
            key={gasEstimateKey}
            txRequest={txRequest}
            accountType={accountType}
            onGasOverrides={onGasOverrides}
            onValidityChange={onGasValidityChange}
            forceInclusion={forceInclusion}
          />
        )}

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
            />
          )}

        {tx.data && tx.data !== "0x" && !tx.to && (
          <Box
            bg="surface.raised"
            p={3}
            border={tokens.borders.medium}
            borderColor="border.default"
            borderRadius="lg"
            boxShadow="card"
          >
            <HStack mb={2} alignItems="center">
              <Text
                fontSize="sm"
                color="text.secondary"
                fontWeight="700"
                textTransform="uppercase"
              >
                Deploy Data
              </Text>
              <Spacer />
              <CopyButton value={tx.data} />
            </HStack>
            <Box
              p={3}
              bg="bg.muted"
              border={tokens.borders.thin}
              borderColor="border.default"
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
                color="text.primary"
                wordBreak="break-all"
                whiteSpace="pre-wrap"
              >
                {tx.data}
              </Text>
            </Box>
          </Box>
        )}

        {tx.data && tx.data !== "0x" && (
          <CalldataDigestDisplay calldata={tx.data} />
        )}

        <TenderlyAndBatchControls
          txRequest={txRequest}
          canBatchAccount={canBatchAccount}
          addToBatchDisabledReason={addToBatchDisabledReason}
          isAddingToBatch={isAddingToBatch}
          batchedCount={batchedCount}
          onAddToBatch={onAddToBatch}
        />
      </VStack>
    </InlineDisclosure>
  );
}
