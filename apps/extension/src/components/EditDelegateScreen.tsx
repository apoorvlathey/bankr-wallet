import { useEffect, useRef } from "react";
import {
  AlertDialog,
  AlertDialogBody,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogOverlay,
  Badge,
  Box,
  Button,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  HStack,
  IconButton,
  Image,
  Input,
  InputGroup,
  InputRightElement,
  Spinner,
  Text,
  Tooltip,
  VStack,
} from "@chakra-ui/react";
import {
  CheckCircleIcon,
  ExternalLinkIcon,
  WarningTwoIcon,
} from "@chakra-ui/icons";

import { CopyButton } from "@/components/CopyButton";
import { FullScreenPickerLayer } from "@/components/FullScreenPickerLayer";
import {
  AppHeader,
  AppScreen,
  ListItem,
  ListItemActions,
  ListItemContent,
  ListItemDescription,
  ListItemTitle,
  ListSurface,
  ScreenBody,
  ScreenSection,
  StickyActionBar,
} from "@/components/ui";

type Choice = "default" | "custom";

interface EditDelegateScreenProps {
  accountAddress: string;
  chainName: string;
  chainIcon?: string;
  explorer?: string;
  currentDelegate: string | null;
  currentDelegateLabel: string | null;
  defaultDelegate: string;
  hasDefaultDelegate: boolean;
  choice: Choice;
  submitting: boolean;
  customAddress: string;
  inlineError: string | null;
  probeKind: "idle" | "queued" | "checking" | "supported" | "unsupported" | "rpcError";
  setDisabled: boolean;
  setDisabledReason: string | null;
  confirmingCustom: boolean;
  delegateLabels: string[];
  understandText: string;
  understandOk: boolean;
  onBack: () => void;
  onChoiceChange: (choice: Choice) => void;
  onCustomAddressChange: (value: string) => void;
  onRevoke: () => void;
  onSet: () => void;
  onCloseCustomConfirmation: () => void;
  onUnderstandTextChange: (value: string) => void;
  onConfirmCustom: () => void;
}

function AddressActions({
  address,
  explorer,
  label,
}: {
  address: string;
  explorer?: string;
  label: string;
}) {
  const explorerUrl = explorer
    ? `${explorer.replace(/\/+$/, "")}/address/${address}`
    : null;

  return (
    <ListItemActions>
      <CopyButton value={address} />
      {explorerUrl && (
        <Tooltip label={`View ${label} on explorer`} hasArrow>
          <IconButton
            as="a"
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`View ${label} on explorer`}
            icon={<ExternalLinkIcon boxSize={3.5} />}
            variant="ghost"
            size="xs"
            minW="24px"
            w="24px"
            h="24px"
          />
        </Tooltip>
      )}
    </ListItemActions>
  );
}

export function EditDelegateScreen({
  accountAddress,
  chainName,
  chainIcon,
  explorer,
  currentDelegate,
  currentDelegateLabel,
  defaultDelegate,
  hasDefaultDelegate,
  choice,
  submitting,
  customAddress,
  inlineError,
  probeKind,
  setDisabled,
  setDisabledReason,
  confirmingCustom,
  delegateLabels,
  understandText,
  understandOk,
  onBack,
  onChoiceChange,
  onCustomAddressChange,
  onRevoke,
  onSet,
  onCloseCustomConfirmation,
  onUnderstandTextChange,
  onConfirmCustom,
}: EditDelegateScreenProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cancelCustomRef = useRef<HTMLButtonElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const customExplorerUrl = explorer
    ? `${explorer.replace(/\/+$/, "")}/address/${customAddress.trim()}`
    : null;

  useEffect(() => {
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const focusFrame = requestAnimationFrame(() => headingRef.current?.focus());
    return () => {
      cancelAnimationFrame(focusFrame);
      requestAnimationFrame(() => {
        if (returnFocusRef.current?.isConnected) returnFocusRef.current.focus();
      });
    };
  }, []);

  return (
    <FullScreenPickerLayer>
      <AppScreen>
        <AppHeader
          title={
            <HStack spacing={2} minW={0}>
              {chainIcon && <Image src={chainIcon} alt="" boxSize="20px" />}
              <Text as="span" noOfLines={1}>Edit delegate</Text>
            </HStack>
          }
          onBack={onBack}
          backLabel="Close delegate settings"
          headingRef={headingRef}
        />

        <ScreenBody pt={4} pb={6}>
          <VStack spacing={6} align="stretch">
            <ScreenSection
              title="Delegation status"
              description={`Account and onchain delegate on ${chainName}.`}
              headingProps={{ fontSize: "lg" }}
            >
              <ListSurface>
                <ListItem density="compact">
                  <ListItemContent>
                    <ListItemTitle fontSize="sm">Account</ListItemTitle>
                    <ListItemDescription fontFamily="mono" fontSize="xs" noOfLines={1}>
                      {accountAddress}
                    </ListItemDescription>
                  </ListItemContent>
                  <AddressActions address={accountAddress} explorer={explorer} label="account" />
                </ListItem>
                <ListItem density="compact">
                  <ListItemContent>
                    <HStack spacing={2} minW={0}>
                      <ListItemTitle fontSize="sm">Current delegate</ListItemTitle>
                      {currentDelegateLabel && (
                        <Badge
                          bg="status.warning.tint"
                          color="fg.primary"
                          borderWidth="1px"
                          borderColor="border.subtle"
                          borderRadius="full"
                          px={2}
                          fontSize="2xs"
                          fontWeight="600"
                          textTransform="none"
                          noOfLines={1}
                        >
                          {currentDelegateLabel}
                        </Badge>
                      )}
                    </HStack>
                    <ListItemDescription
                      fontFamily={currentDelegate ? "mono" : "inherit"}
                      fontSize="xs"
                      noOfLines={1}
                    >
                      {currentDelegate ?? "Not delegated"}
                    </ListItemDescription>
                  </ListItemContent>
                  {currentDelegate && (
                    <AddressActions address={currentDelegate} explorer={explorer} label="delegate" />
                  )}
                </ListItem>
              </ListSurface>
            </ScreenSection>

            <ScreenSection
              title="Choose a delegate"
              description="Changing this setting creates an onchain transaction for review."
              headingProps={{ fontSize: "lg" }}
            >
              <VStack spacing={4} align="stretch">
                {hasDefaultDelegate && (
                  <HStack
                    role="group"
                    aria-label="Delegate type"
                    spacing={1}
                    p={1}
                    bg="surface.sunken"
                    borderRadius="md"
                    borderWidth="1px"
                    borderColor="border.subtle"
                  >
                    {(["default", "custom"] as const).map((option) => (
                      <Button
                        key={option}
                        flex={1}
                        size="sm"
                        variant="ghost"
                        bg={choice === option ? "surface.raisedHover" : "transparent"}
                        aria-pressed={choice === option}
                        onClick={() => onChoiceChange(option)}
                        isDisabled={submitting}
                      >
                        {option === "default" ? "WalletChan default" : "Custom contract"}
                      </Button>
                    ))}
                  </HStack>
                )}

                {choice === "default" ? (
                  <VStack spacing={3} align="stretch">
                    <ListSurface>
                      <ListItem>
                        <ListItemContent>
                          <ListItemTitle fontSize="sm">WalletChan default</ListItemTitle>
                          <ListItemDescription>
                            MetaMask EIP7702StatelessDeleGator v1.3
                          </ListItemDescription>
                          <ListItemDescription fontFamily="mono" fontSize="xs" noOfLines={1}>
                            {defaultDelegate}
                          </ListItemDescription>
                        </ListItemContent>
                        <AddressActions
                          address={defaultDelegate}
                          explorer={explorer}
                          label="WalletChan default delegate"
                        />
                      </ListItem>
                    </ListSurface>
                    <Text fontSize="sm" color="fg.secondary" lineHeight="1.45">
                      Delegates your account to WalletChan's verified default contract. Future
                      atomic batches can reuse it without another setup transaction.
                    </Text>
                  </VStack>
                ) : (
                  <VStack spacing={3} align="stretch">
                    <FormControl isInvalid={!!inlineError}>
                      <Text
                        as="label"
                        display="block"
                        htmlFor="custom-delegate-address"
                        mb={2}
                        fontSize="sm"
                        fontWeight="600"
                      >
                        Custom contract
                      </Text>
                      <InputGroup>
                        <Input
                          id="custom-delegate-address"
                          placeholder="0x…"
                          value={customAddress}
                          onChange={(event) => onCustomAddressChange(event.target.value)}
                          isDisabled={submitting}
                          fontFamily="mono"
                          fontSize="sm"
                          autoComplete="off"
                          spellCheck={false}
                        />
                        {probeKind === "checking" && (
                          <InputRightElement pointerEvents="none" h="full">
                            <Spinner size="xs" color="fg.secondary" />
                          </InputRightElement>
                        )}
                      </InputGroup>
                      <FormHelperText fontSize="xs" color="fg.secondary">
                        Must implement ERC-7821 batch execution. WalletChan checks support before
                        preparing the transaction.
                      </FormHelperText>
                      {inlineError && (
                        <FormErrorMessage color="chart.negative" fontSize="xs">
                          {inlineError}
                        </FormErrorMessage>
                      )}
                      {probeKind === "supported" && (
                        <HStack mt={2} spacing={1.5} color="status.success.fg">
                          <CheckCircleIcon boxSize={3.5} />
                          <Text fontSize="xs">ERC-7821 support confirmed.</Text>
                        </HStack>
                      )}
                    </FormControl>
                    <HStack
                      align="flex-start"
                      spacing={2.5}
                      p={3}
                      bg="status.warning.tint"
                      borderWidth="1px"
                      borderColor="status.warning.border"
                      borderRadius="lg"
                    >
                      <WarningTwoIcon mt={0.5} boxSize={4} color="status.warning.fg" flexShrink={0} />
                      <VStack spacing={1} align="stretch">
                        <Text fontSize="sm" fontWeight="600" lineHeight="1.4">
                          A custom delegate gains full control of this account.
                        </Text>
                        <Text fontSize="xs" color="fg.secondary" lineHeight="1.45">
                          Only continue if you have audited the contract and trust its deployer.
                        </Text>
                      </VStack>
                    </HStack>
                    {!hasDefaultDelegate && (
                      <Text fontSize="sm" color="fg.secondary" lineHeight="1.45">
                        WalletChan does not ship a default delegate for this custom EVM chain.
                        Atomic batching activates after you set and authorize a compatible
                        contract here.
                      </Text>
                    )}
                  </VStack>
                )}
              </VStack>
            </ScreenSection>

            <ScreenSection
              title="Onchain controls"
              description={
                currentDelegate
                  ? "Revoking clears the current delegation and requires gas."
                  : "This account is not delegated onchain."
              }
              headingProps={{ fontSize: "lg" }}
            >
              <Button
                variant="ghost"
                color="chart.negative"
                justifyContent="flex-start"
                px={0}
                onClick={onRevoke}
                isDisabled={submitting || !currentDelegate}
                isLoading={submitting}
                loadingText="Preparing…"
              >
                Revoke delegation
              </Button>
            </ScreenSection>
          </VStack>
        </ScreenBody>

        <StickyActionBar
          primaryAction={
            <VStack w="full" spacing={2} align="stretch">
              {setDisabledReason && (
                <Text
                  id="set-delegate-disabled-reason"
                  color="fg.secondary"
                  fontSize="xs"
                  lineHeight="1.4"
                  textAlign="center"
                >
                  {setDisabledReason}
                </Text>
              )}
              <Button
                w="full"
                variant="primary"
                onClick={onSet}
                isDisabled={setDisabled}
                isLoading={submitting && choice === "default"}
                loadingText="Preparing…"
                aria-describedby={
                  setDisabledReason ? "set-delegate-disabled-reason" : undefined
                }
              >
                Set delegate
              </Button>
            </VStack>
          }
        />
      </AppScreen>

      <AlertDialog
        isOpen={confirmingCustom}
        leastDestructiveRef={cancelCustomRef}
        onClose={onCloseCustomConfirmation}
        isCentered
        closeOnEsc={!submitting}
        closeOnOverlayClick={!submitting}
      >
        <AlertDialogOverlay bg="surface.overlay" />
        <AlertDialogContent mx={4} maxW="360px">
          <AlertDialogHeader as="h2" fontSize="lg" color="chart.negative">
            Delegate full EOA control?
          </AlertDialogHeader>
          <AlertDialogBody>
            <VStack spacing={3} align="stretch">
              <Box
                p={3}
                bg="status.warning.tint"
                borderWidth="1px"
                borderColor="status.warning.border"
                borderRadius="lg"
              >
                <VStack spacing={2} align="stretch">
                  <Text fontSize="sm" fontWeight="600" lineHeight="1.45">
                    Once you delegate, this contract can move any asset out of your EOA on{" "}
                    <Text as="span" fontWeight="700">{chainName}</Text>{" "}
                    — including future deposits. A malicious or buggy contract can drain you
                    instantly.
                  </Text>
                  <Text fontSize="xs" color="fg.secondary" lineHeight="1.45">
                    Only proceed if you've audited the source code and trust the deployer. You
                    can Revoke later but anything stolen before then is gone.
                  </Text>
                </VStack>
              </Box>
              <Box
                p={3}
                bg="surface.raised"
                borderWidth="1px"
                borderColor="border.default"
                borderRadius="lg"
              >
                <Text fontSize="xs" color="fg.secondary" fontWeight="600" mb={1}>
                  Delegating to
                </Text>
                <HStack spacing={1.5} align="flex-start">
                  <Text
                    fontSize="xs"
                    fontFamily="mono"
                    wordBreak="break-all"
                    flex={1}
                    minW={0}
                  >
                    {customAddress.trim()}
                  </Text>
                  <CopyButton value={customAddress.trim()} />
                  {customExplorerUrl && (
                    <IconButton
                      as="a"
                      href={customExplorerUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label="View custom delegate on explorer"
                      icon={<ExternalLinkIcon boxSize={3.5} />}
                      variant="ghost"
                      size="xs"
                      minW="24px"
                      w="24px"
                      h="24px"
                    />
                  )}
                </HStack>
                {delegateLabels.length > 0 && (
                  <Badge
                    mt={1.5}
                    bg="surface.raisedHover"
                    color="fg.primary"
                    fontSize="2xs"
                    fontWeight="600"
                    px={2}
                    py={0.5}
                    borderWidth="1px"
                    borderColor="border.subtle"
                    borderRadius="full"
                    textTransform="none"
                  >
                    {delegateLabels[0]}
                  </Badge>
                )}
              </Box>
              <FormControl>
                <Text
                  as="label"
                  display="block"
                  htmlFor="delegate-understand-phrase"
                  mb={1.5}
                  fontSize="sm"
                  fontWeight="600"
                >
                  Confirmation phrase
                </Text>
                <FormHelperText fontSize="xs" color="fg.secondary" mt={0} mb={2}>
                  Type <Text as="span" color="fg.primary" fontWeight="700">I understand</Text>{" "}
                  to continue.
                </FormHelperText>
                <Input
                  id="delegate-understand-phrase"
                  placeholder="I understand"
                  value={understandText}
                  onChange={(event) => onUnderstandTextChange(event.target.value)}
                  isDisabled={submitting}
                  fontSize="sm"
                  autoFocus
                />
              </FormControl>
            </VStack>
          </AlertDialogBody>
          <AlertDialogFooter gap={2}>
            <Button
              ref={cancelCustomRef}
              variant="secondary"
              onClick={onCloseCustomConfirmation}
              isDisabled={submitting}
            >
              Back
            </Button>
            <Button
              variant="primary"
              onClick={onConfirmCustom}
              isDisabled={!understandOk || submitting}
              isLoading={submitting}
              loadingText="Preparing…"
            >
              Continue
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </FullScreenPickerLayer>
  );
}
