import {
  Alert,
  AlertIcon,
  Box,
  Button,
  FormControl,
  FormLabel,
  HStack,
  Input,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ExternalLinkIcon, WarningTwoIcon } from "@chakra-ui/icons";
import type {
  ChangeEventHandler,
  ClipboardEventHandler,
  ReactNode,
} from "react";

import ChainIcon from "@/components/ChainIcon";
import { CopyButton } from "@/components/CopyButton";
import {
  ConfirmationScreen,
  InlineDisclosure,
  ListItem,
  ListSurface,
  OutcomeCard,
} from "@/components/ui";

interface AddChainConfirmationScreenProps {
  chainName: string;
  chainId: string;
  requestedBy: string;
  requestOrigin: string;
  nameError: string;
  chainIdConflict: string;
  knownChainName?: string;
  rpc: string;
  rpcError: string;
  rpcWarning: string;
  isDetecting: boolean;
  explorer: string;
  currencySymbol: string;
  currencyDecimals: string;
  rawRequestData: string;
  technicalOpen: boolean;
  isSubmitting: boolean;
  isApproveDisabled: boolean;
  onBack: () => void;
  onApprove: () => void;
  onOpenChainlist: () => void;
  onChainNameChange: ChangeEventHandler<HTMLInputElement>;
  onChainIdChange: ChangeEventHandler<HTMLInputElement>;
  onRpcChange: ChangeEventHandler<HTMLInputElement>;
  onRpcPaste: ClipboardEventHandler<HTMLInputElement>;
  onExplorerChange: ChangeEventHandler<HTMLInputElement>;
  onCurrencySymbolChange: ChangeEventHandler<HTMLInputElement>;
  onCurrencyDecimalsChange: ChangeEventHandler<HTMLInputElement>;
  onTechnicalOpenChange: (open: boolean) => void;
}

function FieldRow({ children }: { children: ReactNode }) {
  return (
    <ListItem density="default" align="stretch">
      {children}
    </ListItem>
  );
}

export function AddChainConfirmationScreen({
  chainName,
  chainId,
  requestedBy,
  requestOrigin,
  nameError,
  chainIdConflict,
  knownChainName,
  rpc,
  rpcError,
  rpcWarning,
  isDetecting,
  explorer,
  currencySymbol,
  currencyDecimals,
  rawRequestData,
  technicalOpen,
  isSubmitting,
  isApproveDisabled,
  onBack,
  onApprove,
  onOpenChainlist,
  onChainNameChange,
  onChainIdChange,
  onRpcChange,
  onRpcPaste,
  onExplorerChange,
  onCurrencySymbolChange,
  onCurrencyDecimalsChange,
  onTechnicalOpenChange,
}: AddChainConfirmationScreenProps) {
  const parsedChainId = parseInt(chainId, 10);
  const displayChainId = Number.isFinite(parsedChainId) ? parsedChainId : 0;
  const displayName = chainName.trim() || `Network ${chainId || "unknown"}`;

  return (
    <ConfirmationScreen
      title="Add network"
      onBack={onBack}
      backLabel="Reject network request and go back"
      trailing={
        <Button
          size="sm"
          variant="link"
          rightIcon={<ExternalLinkIcon boxSize={3} />}
          onClick={onOpenChainlist}
        >
          Chainlist
        </Button>
      }
      outcome={
        <OutcomeCard
          label="Requested action"
          outcome={`Add ${displayName}`}
          context={
            <VStack align="stretch" spacing={1}>
              <Text color="fg.secondary" fontSize="sm" lineHeight="1.45">
                {requestedBy
                  ? `${requestedBy} wants WalletChan to connect to this network.`
                  : "A connected app wants WalletChan to connect to this network."}
              </Text>
              <Text color="fg.secondary" fontSize="sm" lineHeight="1.45">
                Only approve RPC endpoints you trust; they can observe requests
                and return incorrect network data.
              </Text>
            </VStack>
          }
          media={
            <Box
              boxSize="44px"
              display="flex"
              alignItems="center"
              justifyContent="center"
              bg="surface.raised"
              borderWidth="1px"
              borderColor="border.subtle"
              borderRadius="md"
            >
              <ChainIcon
                chainId={displayChainId}
                chainName={displayName}
                size="28px"
                withChip
              />
            </Box>
          }
        />
      }
      context={
        <ListSurface>
          <FieldRow>
            <FormControl isInvalid={!!nameError} w="full">
              <FormLabel mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
                Network name
              </FormLabel>
              <Input
                placeholder="e.g., Avalanche C-Chain"
                value={chainName}
                onChange={onChainNameChange}
              />
              <Text mt={1} color="fg.secondary" fontSize="xs">
                This is the name shown in WalletChan.
              </Text>
              {nameError && (
                <Text mt={1} color="chart.negative" fontSize="xs" fontWeight="600">
                  {nameError}
                </Text>
              )}
            </FormControl>
          </FieldRow>

          <FieldRow>
            <FormControl isInvalid={!!chainIdConflict} w="full">
              <FormLabel mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
                Chain ID
              </FormLabel>
              <Input
                placeholder="e.g., 43114"
                type="number"
                value={chainId}
                onChange={onChainIdChange}
              />
              {chainIdConflict && (
                <Alert status="warning" mt={2} py={2} px={3}>
                  <AlertIcon />
                  <Text color="status.warning.fg" fontSize="xs" fontWeight="600">
                    {chainIdConflict}
                  </Text>
                </Alert>
              )}
              {knownChainName && !chainIdConflict && (
                <Alert status="info" mt={2} py={2} px={3}>
                  <AlertIcon />
                  <Text color="status.info.fg" fontSize="xs" fontWeight="600">
                    EIP-7702 atomic batching is enabled by default for{" "}
                    {knownChainName}; no manual delegate setup is needed.
                  </Text>
                </Alert>
              )}
            </FormControl>
          </FieldRow>
        </ListSurface>
      }
      contextTitle="Network identity"
      advancedDetails={
        <VStack align="stretch" spacing={4}>
          <InlineDisclosure
            label="RPC and technical details"
            description="Verify the endpoint, explorer, and native currency metadata."
            open={technicalOpen}
            onOpenChange={onTechnicalOpenChange}
          >
            <VStack align="stretch" spacing={4} pt={2}>
              <FormControl isInvalid={!!rpcError}>
                <FormLabel mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
                  RPC URL
                </FormLabel>
                <HStack>
                  <Input
                    placeholder="https://..."
                    value={rpc}
                    onChange={onRpcChange}
                    onPaste={onRpcPaste}
                  />
                  {isDetecting && <Spinner size="sm" />}
                </HStack>
                <Text mt={1} color="fg.secondary" fontSize="xs">
                  The chain ID is checked against this endpoint.
                </Text>
                {rpcError && (
                  <Text mt={1} color="chart.negative" fontSize="xs" fontWeight="600">
                    {rpcError}
                  </Text>
                )}
              </FormControl>

              <FormControl>
                <FormLabel mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
                  Block explorer URL
                </FormLabel>
                <Input
                  placeholder="https://explorer.example.com"
                  value={explorer}
                  onChange={onExplorerChange}
                />
              </FormControl>

              <HStack spacing={3} align="flex-start">
                <FormControl flex={2}>
                  <FormLabel mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
                    Native token symbol
                  </FormLabel>
                  <Input
                    placeholder="ETH"
                    value={currencySymbol}
                    onChange={onCurrencySymbolChange}
                  />
                </FormControl>
                <FormControl flex={1}>
                  <FormLabel mb={1.5} color="fg.secondary" fontSize="sm" fontWeight="500">
                    Decimals
                  </FormLabel>
                  <Input
                    type="number"
                    value={currencyDecimals}
                    onChange={onCurrencyDecimalsChange}
                  />
                </FormControl>
              </HStack>

              {rawRequestData && (
                <Box>
                  <HStack mb={1} justify="space-between">
                    <Text color="fg.secondary" fontSize="xs" fontWeight="600">
                      Original request
                    </Text>
                    <CopyButton value={rawRequestData} />
                  </HStack>
                  <Box
                    maxH="180px"
                    overflowY="auto"
                    p={3}
                    bg="surface.sunken"
                    borderWidth="1px"
                    borderColor="border.subtle"
                    borderRadius="md"
                  >
                    <Text
                      color="fg.secondary"
                      fontFamily="mono"
                      fontSize="xs"
                      overflowWrap="anywhere"
                      whiteSpace="pre-wrap"
                    >
                      {rawRequestData}
                    </Text>
                  </Box>
                </Box>
              )}

              {requestOrigin && (
                <Text
                  color="fg.secondary"
                  fontFamily="mono"
                  fontSize="xs"
                  overflowWrap="anywhere"
                >
                  origin: {requestOrigin}
                </Text>
              )}
            </VStack>
          </InlineDisclosure>

          {rpcWarning && (
            <Alert status="warning" py={2} px={3}>
              <WarningTwoIcon mr={2} color="status.warning.fg" />
              <Text color="status.warning.fg" fontSize="xs" fontWeight="600">
                {rpcWarning}
              </Text>
            </Alert>
          )}
        </VStack>
      }
      confirmAction={
        <Button
          variant="primary"
          onClick={onApprove}
          isLoading={isSubmitting}
          loadingText="Adding"
          isDisabled={isApproveDisabled}
        >
          Add network
        </Button>
      }
      rejectAction={
        <Button variant="secondary" onClick={onBack}>
          Reject
        </Button>
      }
    />
  );
}
