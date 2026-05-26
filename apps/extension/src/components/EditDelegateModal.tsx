/**
 * Modal for editing the EIP-7702 delegate for one account × one chain.
 *
 * Every action broadcasts a type-4 tx — there is no "next batch will do it"
 * indirection anymore. The user picks WalletChan default or pastes a custom
 * contract, hits Set, and the standard tx-confirmation screen comes up so
 * the change lands onchain immediately.
 *
 *   - Set WalletChan default (MM EIP7702StatelessDeleGator v1.3) — broadcasts
 *     a setDelegate tx pointing the EOA at the default contract.
 *   - Set custom delegate — same flow but with a user-pasted address. We
 *     re-prompt the user via a secondary "I understand" confirmation modal
 *     before broadcasting because the contract will gain full control of
 *     their EOA via EIP-7702.
 *   - Revoke — broadcasts a setDelegate tx that points at 0x0 (clears the
 *     onchain delegation).
 *
 * After the broadcast confirms, txHandlers mirrors the new onchain state to
 * the `customDelegates` storage entry so this modal pre-fills the right way
 * on the next open.
 */

import { useEffect, useState } from "react";
import {
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  VStack,
  HStack,
  Box,
  Text,
  Button,
  Badge,
  Input,
  InputGroup,
  InputRightElement,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  Spinner,
  Image,
  Divider,
  Icon,
  Link,
  Tooltip,
} from "@chakra-ui/react";
import { ExternalLinkIcon } from "@chakra-ui/icons";
import { isAddress } from "viem";
import { CopyButton } from "@/components/CopyButton";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";
import {
  CHAIN_REGISTRY,
  EIP_7702_DEFAULT_DELEGATE,
} from "@/constants/chainRegistry";
import { hasDefaultDelegateForChain } from "@/utils/delegationResolution";
import { useTheme } from "@/theme";
import { CHAIN_CONFIG } from "@/constants/chainConfig";
import { useThemedToast } from "@/hooks/useThemedToast";
import { getEthShLabels } from "@/lib/ethShLabelsCache";

type Address = `0x${string}`;

interface DelegationStatus {
  delegate: Address | null;
  source: "onchain" | "custom" | "default" | "none" | null;
  onchainDelegate: Address | null;
  customDelegate: Address | null;
}

interface Props {
  isOpen: boolean;
  accountId: string;
  accountAddress: Address;
  chainId: number;
  currentStatus?: DelegationStatus;
  onClose: () => void;
}

type Choice = "default" | "custom";

export default function EditDelegateModal({
  isOpen,
  accountId,
  chainId,
  currentStatus,
  onClose,
}: Props) {
  const toast = useThemedToast();
  const { tokens } = useTheme();
  // WalletChan's default delegate (MM DeleGator) is verified-deployed on
  // built-in Pectra chains and on every chainId in KNOWN_CHAINS (the MM
  // delegation-deployments registry). For custom EVM chains outside that
  // set we can't promise the default, so the Custom tab is the only option.
  const hasDefaultDelegate = hasDefaultDelegateForChain(chainId);
  // Pre-select the segmented control based on what's currently onchain so
  // the user lands on the matching tab when reopening the modal:
  //   - onchain == default     → "default" tab
  //   - onchain == custom      → "custom" tab (pre-filled with stored value)
  //   - not delegated, stored  → "custom" tab (so the saved value is visible)
  //   - else                   → "default" tab
  const initialChoice = (): Choice => {
    // No WalletChan default on this chain → only sensible landing is Custom.
    if (!hasDefaultDelegate) return "custom";
    const onchain = currentStatus?.onchainDelegate;
    if (
      onchain &&
      onchain.toLowerCase() === EIP_7702_DEFAULT_DELEGATE.toLowerCase()
    ) {
      return "default";
    }
    if (onchain || currentStatus?.customDelegate) return "custom";
    return "default";
  };
  const [choice, setChoice] = useState<Choice>(initialChoice);
  const [submitting, setSubmitting] = useState(false);
  const [customAddress, setCustomAddress] = useState(
    currentStatus?.customDelegate ?? currentStatus?.onchainDelegate ?? "",
  );
  const [customError, setCustomError] = useState<string | null>(null);
  // Secondary "I understand" confirmation modal for the custom path. Opens on
  // Set, closes on Back or after a successful broadcast.
  const [confirmingCustom, setConfirmingCustom] = useState(false);
  const [understandText, setUnderstandText] = useState("");
  // eth.sh label headline for the pasted address. Fetched only when the
  // confirmation popup is open + the address is valid, sharing the same cache
  // as every other label surface (single roundtrip per address×chain ever).
  const [delegateLabels, setDelegateLabels] = useState<string[]>([]);
  // eth.sh label for the current onchain delegate. Same cache as above, so
  // reopening the modal (or having seen this address on the tx-confirm screen)
  // is a free hit. Renders as a pill next to the raw address so users can
  // recognise reputable delegators (Uniswap Calibur, ZeroDev Kernel, …)
  // without us maintaining a hardcoded list.
  const [currentDelegateLabel, setCurrentDelegateLabel] = useState<string | null>(null);
  // Live ERC-7821 probe for the pasted/typed custom address. Fires as soon as
  // the field holds a syntactically-valid address so we can gate Set + surface
  // an inline error without making the user click Set first. Skipped when the
  // pasted value equals what's already onchain (no-op handled by the tooltip).
  // The backend handler stays in place as defense-in-depth — race between this
  // probe succeeding and Set being clicked is still re-checked server-side.
  //
  // "queued" exists separately from "checking" so the spinner doesn't flash on
  // every keystroke: while the user is still typing we sit in "queued" (Set
  // disabled, no spinner) and only flip to "checking" once the debounce
  // settles and the RPC actually fires.
  type ProbeState =
    | { kind: "idle" }
    | { kind: "queued" }
    | { kind: "checking" }
    | { kind: "supported" }
    | { kind: "unsupported" }
    | { kind: "rpcError"; message: string };
  const [probeState, setProbeState] = useState<ProbeState>({ kind: "idle" });

  const chain = CHAIN_REGISTRY.find((c) => c.chainId === chainId);
  const chainConfig = CHAIN_CONFIG[chainId];
  // Prefer the user-configured chain name from networksInfo so custom EVM
  // chains render with their actual name instead of "Chain <id>". Falls
  // back to the built-in registry, then a chainId placeholder.
  const { networksInfo } = useNetworks();
  const resolvedChain = getResolvedChainById(chainId, networksInfo);
  const chainName = resolvedChain?.name || chain?.name || `Chain ${chainId}`;

  // Re-sync local state when the modal opens for a different chain or after
  // the parent re-fetches the status.
  useEffect(() => {
    if (!isOpen) return;
    setChoice(initialChoice());
    setCustomAddress(
      currentStatus?.customDelegate ?? currentStatus?.onchainDelegate ?? "",
    );
    setCustomError(null);
    setSubmitting(false);
    setConfirmingCustom(false);
    setUnderstandText("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isOpen,
    currentStatus?.customDelegate,
    currentStatus?.onchainDelegate,
  ]);

  // eth.sh label fetch — only when the confirmation popup is open and the
  // address parses. The shared cache means reopening the popup later (or
  // landing on the tx-confirmation screen) is a no-op fetch.
  useEffect(() => {
    if (!confirmingCustom) {
      setDelegateLabels([]);
      return;
    }
    const trimmed = customAddress.trim();
    if (!isAddress(trimmed)) {
      setDelegateLabels([]);
      return;
    }
    let cancelled = false;
    getEthShLabels(trimmed, chainId).then((labels) => {
      if (cancelled) return;
      setDelegateLabels(labels);
    });
    return () => {
      cancelled = true;
    };
  }, [confirmingCustom, customAddress, chainId]);

  // Resolve the current onchain delegate's eth.sh label when the modal is
  // open. Shares the same cache so it's free if we've seen the address
  // anywhere else in the UI (tx-confirm screen, Smart Account section).
  useEffect(() => {
    if (!isOpen) {
      setCurrentDelegateLabel(null);
      return;
    }
    const addr = currentStatus?.onchainDelegate;
    if (!addr || !isAddress(addr)) {
      setCurrentDelegateLabel(null);
      return;
    }
    let cancelled = false;
    getEthShLabels(addr, chainId).then((labels) => {
      if (cancelled) return;
      setCurrentDelegateLabel(labels[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentStatus?.onchainDelegate, chainId]);

  // Live ERC-7821 probe. Debounced so paste-then-type bursts coalesce into a
  // single roundtrip; cancellation flag guards against the stale-response race
  // when the user keeps typing while a probe is in flight.
  useEffect(() => {
    if (!isOpen || choice !== "custom") {
      setProbeState({ kind: "idle" });
      return;
    }
    const trimmed = customAddress.trim();
    if (!trimmed || !isAddress(trimmed)) {
      setProbeState({ kind: "idle" });
      return;
    }
    // Re-pasting whatever's already onchain is a no-op the "matches onchain"
    // tooltip already covers; skip the roundtrip.
    const onchainLowerLocal =
      currentStatus?.onchainDelegate?.toLowerCase() ?? null;
    if (onchainLowerLocal && onchainLowerLocal === trimmed.toLowerCase()) {
      setProbeState({ kind: "idle" });
      return;
    }

    let cancelled = false;
    // Park in "queued" while the user is still typing. The state machine
    // treats queued same as checking for Set-disabled / tooltip purposes, but
    // the spinner JSX only renders on "checking" — so the indicator pops in
    // exactly when we start the RPC, not on every keystroke.
    setProbeState({ kind: "queued" });
    const t = setTimeout(() => {
      if (cancelled) return;
      setProbeState({ kind: "checking" });
      chrome.runtime.sendMessage(
        { type: "probeDelegateContract", chainId, address: trimmed },
        (
          res:
            | { success: true; supports7821: boolean }
            | { success: false; error: string }
            | undefined,
        ) => {
          if (cancelled) return;
          if (!res) {
            setProbeState({
              kind: "rpcError",
              message: "No response from background.",
            });
            return;
          }
          if (!res.success) {
            setProbeState({ kind: "rpcError", message: res.error });
            return;
          }
          setProbeState({
            kind: res.supports7821 ? "supported" : "unsupported",
          });
        },
      );
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [
    isOpen,
    choice,
    customAddress,
    chainId,
    currentStatus?.onchainDelegate,
  ]);

  const reset = () => {
    setChoice(initialChoice());
    setCustomAddress(
      currentStatus?.customDelegate ?? currentStatus?.onchainDelegate ?? "",
    );
    setCustomError(null);
    setSubmitting(false);
    setConfirmingCustom(false);
    setUnderstandText("");
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const broadcastSet = (targetDelegate: `0x${string}`) => {
    setSubmitting(true);
    chrome.runtime.sendMessage(
      {
        type: "initiateSetDelegation",
        accountId,
        chainId,
        targetDelegate,
      },
      (
        res:
          | { success: true; txId: string }
          | { success: false; error: string }
          | undefined,
      ) => {
        setSubmitting(false);
        if (!res || !res.success) {
          const message =
            (res && !res.success && res.error) ||
            "Unknown error preparing the delegation transaction.";
          // Surface inline next to the custom field when the failure is about
          // the address itself (probe rejected); otherwise toast.
          if (
            choice === "custom" &&
            /erc-?7821|invalid|rpc/i.test(message)
          ) {
            setCustomError(message);
            setConfirmingCustom(false);
          } else {
            toast({
              title: "Couldn't start delegation",
              description: message,
              status: "error",
              duration: 4000,
              isClosable: true,
            });
          }
          return;
        }
        // The background fired `newPendingTxRequest`; App.tsx will switch to
        // the txConfirm view automatically. Reset our local state so reopening
        // the modal later starts clean.
        reset();
        onClose();
      },
    );
  };

  const handleSet = () => {
    if (choice === "default") {
      broadcastSet(EIP_7702_DEFAULT_DELEGATE as `0x${string}`);
      return;
    }
    const trimmed = customAddress.trim();
    if (!isAddress(trimmed)) {
      setCustomError("Invalid address");
      return;
    }
    setCustomError(null);
    setUnderstandText("");
    setConfirmingCustom(true);
  };

  const handleConfirmCustom = () => {
    const trimmed = customAddress.trim();
    if (!isAddress(trimmed)) {
      setCustomError("Invalid address");
      setConfirmingCustom(false);
      return;
    }
    broadcastSet(trimmed as `0x${string}`);
  };

  const handleRevoke = () => {
    setSubmitting(true);
    chrome.runtime.sendMessage(
      { type: "initiateRevokeDelegation", accountId, chainId },
      (
        res:
          | { success: true; txId: string }
          | { success: false; error: string }
          | undefined,
      ) => {
        setSubmitting(false);
        if (!res || !res.success) {
          toast({
            title: "Couldn't start revoke",
            description:
              (res && !res.success && res.error) ||
              "Unknown error preparing the revoke transaction.",
            status: "error",
            duration: 4000,
            isClosable: true,
          });
          return;
        }
        reset();
        onClose();
      },
    );
  };

  // Set is disabled when it would be a no-op (target matches what's already
  // onchain) or when the custom field is empty / invalid.
  const trimmedCustom = customAddress.trim();
  const onchainLower = currentStatus?.onchainDelegate?.toLowerCase() ?? null;
  const defaultLower = EIP_7702_DEFAULT_DELEGATE.toLowerCase();
  const defaultIsNoOp = choice === "default" && onchainLower === defaultLower;
  const customAddressIsValid = isAddress(trimmedCustom);
  const customMatchesOnchain =
    customAddressIsValid &&
    !!onchainLower &&
    onchainLower === trimmedCustom.toLowerCase();
  const customIsNoOp =
    choice === "custom" && (!customAddressIsValid || customMatchesOnchain);
  // The Custom path also has to clear the live 7821 probe before Set is
  // allowed. The matches-onchain shortcut above already skips the probe (and
  // is independently a no-op), so we only consult the probe when the address
  // is a fresh, non-onchain value.
  const customNeedsProbe =
    choice === "custom" && customAddressIsValid && !customMatchesOnchain;
  const probeBlocks =
    customNeedsProbe && probeState.kind !== "supported";
  const setDisabled =
    submitting || defaultIsNoOp || customIsNoOp || probeBlocks;
  // Hovering a disabled Set button should explain *why* — most often the user
  // is re-pasting whatever's already onchain, or the probe is still in flight.
  // Submitting state intentionally returns null so the existing "Preparing…"
  // label carries the explanation.
  const setDisabledReason: string | null = (() => {
    if (submitting) return null;
    if (defaultIsNoOp) {
      return "Already delegated to the WalletChan default.";
    }
    if (choice === "custom") {
      if (!customAddressIsValid) return "Enter a valid contract address.";
      if (customMatchesOnchain) {
        return "This contract is already the onchain delegate.";
      }
      if (probeState.kind === "queued" || probeState.kind === "checking") {
        return "Checking ERC-7821 support…";
      }
      if (probeState.kind === "unsupported") {
        return "Contract does not implement ERC-7821 batch execution.";
      }
      if (probeState.kind === "rpcError") {
        return `Couldn't probe contract: ${probeState.message}`;
      }
    }
    return null;
  })();
  // Inline error below the Custom input. Server-rejection failures from
  // broadcastSet still flow through `customError`; the live probe layers on
  // top of it. Either source disables Set via the tooltip path above.
  const inlineError: string | null = (() => {
    if (customError) return customError;
    if (choice !== "custom") return null;
    if (probeState.kind === "unsupported") {
      return "Contract does not implement ERC-7821 batch execution.";
    }
    if (probeState.kind === "rpcError") {
      return `Couldn't probe contract: ${probeState.message}`;
    }
    return null;
  })();
  const understandOk =
    understandText.trim().toLowerCase() === "i understand";

  return (
    <Modal isOpen={isOpen} onClose={handleClose} isCentered size="md">
      <ModalOverlay bg="surface.overlay" />
      <ModalContent mx={4}>
        <ModalHeader>
          <HStack spacing={2}>
            {chainConfig?.icon && (
              <Image src={chainConfig.icon} alt={chainName} boxSize="20px" />
            )}
            <Text>Edit delegate · {chainName}</Text>
          </HStack>
        </ModalHeader>
        <ModalBody>
          <VStack spacing={3} align="stretch">
              {/* Current delegate status */}
              <Box
                p={2}
                bg="surface.raised"
                border="1.5px solid"
                borderColor="border.subtle"
                borderRadius="md"
              >
                <HStack justify="space-between" align="center" mb={0.5}>
                  <Text fontSize="2xs" color="text.tertiary" fontWeight="700">
                    CURRENT
                  </Text>
                  {currentDelegateLabel && (
                    <Box
                      bg="accent.highlight"
                      color="accentFg.highlight"
                      border="1.5px solid"
                      borderColor="border.default"
                      borderRadius={tokens.radii.badge}
                      px={1.5}
                      py={0.5}
                      fontSize="9px"
                      fontWeight="900"
                      textTransform="uppercase"
                      letterSpacing="wider"
                      lineHeight="1"
                      noOfLines={1}
                    >
                      {currentDelegateLabel}
                    </Box>
                  )}
                </HStack>
                {currentStatus?.onchainDelegate ? (
                  <HStack spacing={1.5} align="center">
                    <Text
                      fontSize="xs"
                      fontFamily="mono"
                      color="text.primary"
                      flex={1}
                      minW={0}
                      isTruncated
                    >
                      {currentStatus.onchainDelegate}
                    </Text>
                    <CopyButton value={currentStatus.onchainDelegate} />
                    {chainConfig?.explorer && (
                      <Link
                        href={`${chainConfig.explorer}/address/${currentStatus.onchainDelegate}`}
                        isExternal
                        color="accentFg.secondary"
                        display="inline-flex"
                        alignItems="center"
                        aria-label="View delegate on explorer"
                      >
                        <Icon as={ExternalLinkIcon} boxSize="12px" />
                      </Link>
                    )}
                  </HStack>
                ) : (
                  <Text fontSize="xs" fontFamily="mono" color="text.primary">
                    Not delegated
                  </Text>
                )}
              </Box>

              {/* Segmented control — default vs custom. Hidden on chains
                  where we don't ship a verified default delegate; the modal
                  collapses to the Custom flow only. */}
              {hasDefaultDelegate && (
                <HStack
                  spacing={1}
                  p={1}
                  bg="surface.sunken"
                  borderRadius="md"
                  border="1.5px solid"
                  borderColor="border.subtle"
                >
                  <Button
                    flex={1}
                    size="sm"
                    variant={choice === "default" ? "primary" : "ghost"}
                    onClick={() => setChoice("default")}
                    isDisabled={submitting}
                  >
                    WalletChan default
                  </Button>
                  <Button
                    flex={1}
                    size="sm"
                    variant={choice === "custom" ? "primary" : "ghost"}
                    onClick={() => setChoice("custom")}
                    isDisabled={submitting}
                  >
                    Custom
                  </Button>
                </HStack>
              )}

              {/* Content panel — matches the active segment */}
              {choice === "default" ? (
                <Box
                  p={3}
                  bg="surface.raised"
                  border="1.5px solid"
                  borderColor="border.subtle"
                  borderRadius="md"
                >
                  <Text fontSize="xs" color="text.secondary" mb={1}>
                    MetaMask EIP7702StatelessDeleGator v1.3
                  </Text>
                  <Text fontSize="2xs" fontFamily="mono" color="text.tertiary">
                    {EIP_7702_DEFAULT_DELEGATE}
                  </Text>
                </Box>
              ) : (
                <VStack spacing={2} align="stretch">
                  <FormControl isInvalid={!!inlineError}>
                    <InputGroup>
                      <Input
                        placeholder="0x…"
                        value={customAddress}
                        onChange={(e) => {
                          setCustomAddress(e.target.value);
                          setCustomError(null);
                        }}
                        isDisabled={submitting}
                        fontFamily="mono"
                        fontSize="xs"
                        autoFocus={!customAddress}
                      />
                      {probeState.kind === "checking" && (
                        <InputRightElement
                          pointerEvents="none"
                          h="full"
                        >
                          <Spinner size="xs" color="text.tertiary" />
                        </InputRightElement>
                      )}
                    </InputGroup>
                    <FormHelperText fontSize="2xs" color="text.tertiary">
                      Must implement ERC-7821 batch execution. We probe before
                      broadcasting.
                    </FormHelperText>
                    {inlineError && (
                      <FormErrorMessage color="chart.negative" fontSize="2xs">
                        {inlineError}
                      </FormErrorMessage>
                    )}
                  </FormControl>
                  <Text fontSize="2xs" color="text.tertiary" lineHeight="short">
                    The contract you paste will gain full control of your EOA
                    via EIP-7702. Only proceed if you've audited the source
                    code.
                  </Text>
                  {!hasDefaultDelegate && (
                    <Text
                      fontSize="2xs"
                      color="text.tertiary"
                      lineHeight="short"
                    >
                      Atomic batching on this chain only activates after you
                      set + authorize a delegate here. WalletChan doesn't ship
                      a default delegate for custom EVM chains.
                    </Text>
                  )}
                </VStack>
              )}

              {/* Default-mode helper — explains the onchain tx. Custom mode
                  already has the "full control" warning above, plus the
                  secondary "I understand" confirmation modal before broadcast,
                  so a third explanation here is just noise. */}
              {choice === "default" && (
                <Text fontSize="2xs" color="text.tertiary" lineHeight="short">
                  Broadcasts a type-4 tx that delegates your EOA to the
                  WalletChan default contract onchain. Future batches reuse it
                  for free.
                </Text>
              )}

              {/* Revoke — small destructive link, separated from the choice */}
              <Divider borderColor="border.subtle" />
              <HStack justify="space-between" align="center">
                <Text fontSize="2xs" color="text.tertiary">
                  {currentStatus?.onchainDelegate
                    ? "Clears delegation onchain (gas cost)."
                    : "Not delegated onchain, nothing to revoke."}
                </Text>
                <Button
                  size="xs"
                  variant="ghost"
                  color="chart.negative"
                  onClick={handleRevoke}
                  isDisabled={submitting || !currentStatus?.onchainDelegate}
                  isLoading={submitting}
                  loadingText="Preparing…"
                >
                  Revoke
                </Button>
              </HStack>
            </VStack>
        </ModalBody>
        <ModalFooter gap={2}>
          <Button
            variant="secondary"
            onClick={handleClose}
            isDisabled={submitting}
          >
            Cancel
          </Button>
          <Tooltip
            label={setDisabledReason ?? ""}
            isDisabled={!setDisabledReason}
            hasArrow
            fontSize="xs"
            placement="top"
            shouldWrapChildren
          >
            <Button
              variant="primary"
              onClick={handleSet}
              isDisabled={setDisabled}
              leftIcon={
                submitting && choice === "default" ? (
                  <Spinner size="xs" />
                ) : undefined
              }
            >
              {submitting && choice === "default" ? "Preparing…" : "Set"}
            </Button>
          </Tooltip>
        </ModalFooter>
      </ModalContent>

      {/* Secondary confirmation modal for the custom path. Forces the user
          to type the exact phrase before we send them to the tx screen, so
          a misclick on Set won't broadcast a delegation to an unaudited
          contract. Two-step gate matches the gravity of handing over full
          EOA control via 7702. */}
      <Modal
        isOpen={confirmingCustom}
        onClose={() => {
          if (submitting) return;
          setConfirmingCustom(false);
          setUnderstandText("");
        }}
        isCentered
        size="md"
        closeOnOverlayClick={!submitting}
      >
        <ModalOverlay bg="surface.overlay" />
        <ModalContent mx={4}>
          <ModalHeader color="chart.negative">
            Delegate full EOA control?
          </ModalHeader>
          <ModalBody>
            <VStack spacing={3} align="stretch">
              <Box
                p={3}
                bg="status.warning.bg"
                border="1.5px solid"
                borderColor="status.warning.border"
                borderRadius="md"
              >
                <VStack spacing={2} align="stretch">
                  <Text
                    fontSize="xs"
                    color="status.warning.fg"
                    fontWeight="700"
                    lineHeight="short"
                  >
                    Once you delegate, this contract can move any asset out of
                    your EOA on{" "}
                    <Text as="span" fontWeight="900">
                      {chainName}
                    </Text>{" "}
                    — including future deposits. A malicious or buggy contract
                    can drain you instantly.
                  </Text>
                  <Text
                    fontSize="2xs"
                    color="status.warning.fg"
                    fontWeight="600"
                    lineHeight="short"
                  >
                    Only proceed if you've audited the source code and trust
                    the deployer. You can Revoke later but anything stolen
                    before then is gone.
                  </Text>
                </VStack>
              </Box>

              <Box
                p={2}
                bg="surface.raised"
                border="1.5px solid"
                borderColor="border.subtle"
                borderRadius="md"
              >
                <Text fontSize="2xs" color="text.tertiary" fontWeight="700">
                  DELEGATING TO
                </Text>
                <Text
                  fontSize="xs"
                  fontFamily="mono"
                  color="text.primary"
                  wordBreak="break-all"
                >
                  {customAddress.trim()}
                </Text>
                {/* eth.sh label headline — only renders once the cache hits.
                    Gives recognized contracts a friendly name next to the raw
                    hex so the user knows what they're delegating to. */}
                {delegateLabels.length > 0 && (
                  <HStack spacing={1} mt={1.5}>
                    <Badge
                      bg="accent.secondary"
                      color="accentFg.secondary"
                      fontSize="2xs"
                      fontWeight="800"
                      px={1.5}
                      py={0}
                      border="1px solid"
                      borderColor="border.default"
                    >
                      {delegateLabels[0]}
                    </Badge>
                  </HStack>
                )}
              </Box>

              <FormControl>
                <FormHelperText fontSize="2xs" color="text.tertiary" mb={1}>
                  Type{" "}
                  <Text as="span" fontWeight="800">
                    I understand
                  </Text>{" "}
                  to continue.
                </FormHelperText>
                <Input
                  placeholder="I understand"
                  value={understandText}
                  onChange={(e) => setUnderstandText(e.target.value)}
                  isDisabled={submitting}
                  fontSize="sm"
                  autoFocus
                />
              </FormControl>
            </VStack>
          </ModalBody>
          <ModalFooter gap={2}>
            <Button
              variant="secondary"
              onClick={() => {
                setConfirmingCustom(false);
                setUnderstandText("");
              }}
              isDisabled={submitting}
            >
              Back
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirmCustom}
              isDisabled={!understandOk || submitting}
              isLoading={submitting}
              loadingText="Preparing…"
            >
              Continue
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Modal>
  );
}
