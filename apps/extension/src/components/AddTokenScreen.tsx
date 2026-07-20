import { type FormEvent, type Ref } from "react";
import {
  Box,
  Button,
  FormControl,
  FormHelperText,
  FormLabel,
  HStack,
  IconButton,
  Input,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ChevronRightIcon,
  ExternalLinkIcon,
  InfoOutlineIcon,
  WarningIcon,
} from "@chakra-ui/icons";

import ChainIcon from "@/components/ChainIcon";
import { CopyButton } from "@/components/CopyButton";
import {
  AppHeader,
  AppScreen,
  ScreenBody,
  ScreenSection,
  StickyActionBar,
} from "@/components/ui";

interface SelectedTokenChain {
  chainId: number;
  name: string;
}

interface AddTokenScreenProps {
  headingRef: Ref<HTMLHeadingElement>;
  selectedChain?: SelectedTokenChain;
  selectedChainId: number;
  tokenAddress: string;
  name: string;
  symbol: string;
  decimals: string;
  loading: boolean;
  saving: boolean;
  fetched: boolean;
  error: string | null;
  isDuplicate: boolean;
  isHiddenToken: boolean;
  explorerUrl: string | null;
  canSave: boolean;
  saveLabel: string;
  onBack: () => void;
  onChooseChain: () => void;
  onAddressChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onSymbolChange: (value: string) => void;
  onDecimalsChange: (value: string) => void;
  onSubmit: (event?: FormEvent) => void;
}

export default function AddTokenScreen({
  headingRef,
  selectedChain,
  selectedChainId,
  tokenAddress,
  name,
  symbol,
  decimals,
  loading,
  saving,
  fetched,
  error,
  isDuplicate,
  isHiddenToken,
  explorerUrl,
  canSave,
  saveLabel,
  onBack,
  onChooseChain,
  onAddressChange,
  onNameChange,
  onSymbolChange,
  onDecimalsChange,
  onSubmit,
}: AddTokenScreenProps) {
  return (
    <AppScreen stickyActionClearance={4}>
      <AppHeader title="Add token" onBack={onBack} headingRef={headingRef} />

      <ScreenBody pt={4}>
        <Box as="form" id="add-token-form" onSubmit={onSubmit}>
          <VStack align="stretch" spacing={6}>
            <ScreenSection
              title="Token contract"
              description="Choose the network, then paste the token's contract address."
              headingProps={{ fontSize: "lg" }}
            >
              <VStack align="stretch" spacing={4}>
                <FormControl>
                  <FormLabel>Network</FormLabel>
                  <Button
                    type="button"
                    variant="secondary"
                    w="full"
                    minH="48px"
                    justifyContent="space-between"
                    px={3}
                    onClick={onChooseChain}
                  >
                    <HStack spacing={2} minW={0}>
                      <ChainIcon
                        chainId={selectedChainId}
                        chainName={selectedChain?.name}
                        size="22px"
                        withChip
                      />
                      <Text noOfLines={1}>
                        {selectedChain?.name ?? `Chain ${selectedChainId}`}
                      </Text>
                    </HStack>
                    <ChevronRightIcon boxSize={5} />
                  </Button>
                </FormControl>

                <FormControl isInvalid={!!error && !fetched}>
                  <FormLabel htmlFor="token-contract-address">
                    Contract address
                  </FormLabel>
                  <Input
                    id="token-contract-address"
                    placeholder="0x..."
                    value={tokenAddress}
                    onChange={(event) => onAddressChange(event.target.value)}
                    fontFamily="mono"
                    fontSize="md"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                  <FormHelperText>
                    WalletChan reads the token name, symbol, and decimals from
                    the contract.
                  </FormHelperText>
                </FormControl>

                {loading && (
                  <HStack role="status" spacing={2} color="fg.secondary">
                    <Spinner size="sm" />
                    <Text fontSize="sm">Reading token details...</Text>
                  </HStack>
                )}

                {fetched && tokenAddress && (
                  <HStack
                    justify="space-between"
                    py={2}
                    borderTop="1px solid"
                    borderColor="border.subtle"
                  >
                    <Text
                      fontFamily="mono"
                      fontSize="xs"
                      color="fg.secondary"
                      noOfLines={1}
                    >
                      {tokenAddress}
                    </Text>
                    <HStack spacing={0} flexShrink={0}>
                      <CopyButton value={tokenAddress} />
                      {explorerUrl && (
                        <IconButton
                          aria-label="View token contract"
                          icon={<ExternalLinkIcon />}
                          size="xs"
                          variant="ghost"
                          color="fg.secondary"
                          onClick={() => chrome.tabs.create({ url: explorerUrl })}
                        />
                      )}
                    </HStack>
                  </HStack>
                )}

                {error && (
                  <HStack role="alert" align="start" spacing={2} color="chart.negative">
                    <WarningIcon mt={1} boxSize={3} />
                    <Text fontSize="sm">{error}</Text>
                  </HStack>
                )}

                {isDuplicate && (
                  <HStack align="start" spacing={2} color="fg.secondary">
                    <InfoOutlineIcon mt={1} boxSize={3} />
                    <Text fontSize="sm">This token is already in your holdings.</Text>
                  </HStack>
                )}

                {isHiddenToken && (
                  <HStack align="start" spacing={2} color="fg.secondary">
                    <InfoOutlineIcon mt={1} boxSize={3} />
                    <Text fontSize="sm">
                      This token is hidden. Adding it back will make it visible
                      in all portfolios again.
                    </Text>
                  </HStack>
                )}
              </VStack>
            </ScreenSection>

            {fetched && !isDuplicate && (
              <ScreenSection
                title="Token details"
                description="You can correct the display details before adding the token."
                headingProps={{ fontSize: "lg" }}
              >
                <VStack align="stretch" spacing={4}>
                  <FormControl>
                    <FormLabel htmlFor="token-name">Name</FormLabel>
                    <Input
                      id="token-name"
                      value={name}
                      onChange={(event) => onNameChange(event.target.value)}
                    />
                  </FormControl>
                  <HStack spacing={3} align="start">
                    <FormControl>
                      <FormLabel htmlFor="token-symbol">Symbol</FormLabel>
                      <Input
                        id="token-symbol"
                        value={symbol}
                        onChange={(event) => onSymbolChange(event.target.value)}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel htmlFor="token-decimals">Decimals</FormLabel>
                      <Input
                        id="token-decimals"
                        value={decimals}
                        onChange={(event) => onDecimalsChange(event.target.value)}
                        type="number"
                        inputMode="numeric"
                      />
                    </FormControl>
                  </HStack>
                </VStack>
              </ScreenSection>
            )}
          </VStack>
        </Box>
      </ScreenBody>

      <StickyActionBar
        primaryAction={
          <Button
            type="submit"
            form="add-token-form"
            variant="brand"
            isDisabled={!canSave}
            isLoading={saving}
          >
            {saveLabel}
          </Button>
        }
      />
    </AppScreen>
  );
}
