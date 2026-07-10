import { useEffect, useState } from "react";
import { isAddress } from "viem";

import { EditDelegateScreen } from "@/components/EditDelegateScreen";
import { CHAIN_CONFIG } from "@/constants/chainConfig";
import {
  CHAIN_REGISTRY,
  EIP_7702_DEFAULT_DELEGATE,
} from "@/constants/chainRegistry";
import { useNetworks } from "@/contexts/NetworksContext";
import { useThemedToast } from "@/hooks/useThemedToast";
import { getResolvedChainById } from "@/lib/chains";
import { getEthShLabels } from "@/lib/ethShLabelsCache";
import { hasDefaultDelegateForChain } from "@/utils/delegationResolution";

type Address = `0x${string}`;
type Choice = "default" | "custom";
type ProbeState =
  | { kind: "idle" }
  | { kind: "queued" }
  | { kind: "checking" }
  | { kind: "supported" }
  | { kind: "unsupported" }
  | { kind: "rpcError"; message: string };

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

/**
 * Controls the EIP-7702 delegate flow. The visual destination is full-screen,
 * while custom contracts retain the typed high-risk confirmation gate.
 */
export default function EditDelegateModal({
  isOpen,
  accountId,
  accountAddress,
  chainId,
  currentStatus,
  onClose,
}: Props) {
  const toast = useThemedToast();
  const hasDefaultDelegate = hasDefaultDelegateForChain(chainId);
  const initialChoice = (): Choice => {
    if (!hasDefaultDelegate) return "custom";
    const onchain = currentStatus?.onchainDelegate;
    if (
      onchain?.toLowerCase() === EIP_7702_DEFAULT_DELEGATE.toLowerCase()
    ) {
      return "default";
    }
    return onchain || currentStatus?.customDelegate ? "custom" : "default";
  };

  const [choice, setChoice] = useState<Choice>(initialChoice);
  const [submitting, setSubmitting] = useState(false);
  const [customAddress, setCustomAddress] = useState(
    currentStatus?.customDelegate ?? currentStatus?.onchainDelegate ?? "",
  );
  const [customError, setCustomError] = useState<string | null>(null);
  const [confirmingCustom, setConfirmingCustom] = useState(false);
  const [understandText, setUnderstandText] = useState("");
  const [delegateLabels, setDelegateLabels] = useState<string[]>([]);
  const [currentDelegateLabel, setCurrentDelegateLabel] = useState<string | null>(null);
  const [probeState, setProbeState] = useState<ProbeState>({ kind: "idle" });

  const chain = CHAIN_REGISTRY.find((entry) => entry.chainId === chainId);
  const chainConfig = CHAIN_CONFIG[chainId];
  const { networksInfo } = useNetworks();
  const resolvedChain = getResolvedChainById(chainId, networksInfo);
  const chainName = resolvedChain?.name || chain?.name || `Chain ${chainId}`;

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
      if (!cancelled) setDelegateLabels(labels);
    });
    return () => {
      cancelled = true;
    };
  }, [confirmingCustom, customAddress, chainId]);

  useEffect(() => {
    if (!isOpen) {
      setCurrentDelegateLabel(null);
      return;
    }
    const address = currentStatus?.onchainDelegate;
    if (!address || !isAddress(address)) {
      setCurrentDelegateLabel(null);
      return;
    }
    let cancelled = false;
    getEthShLabels(address, chainId).then((labels) => {
      if (!cancelled) setCurrentDelegateLabel(labels[0] ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentStatus?.onchainDelegate, chainId]);

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
    if (
      currentStatus?.onchainDelegate?.toLowerCase() === trimmed.toLowerCase()
    ) {
      setProbeState({ kind: "idle" });
      return;
    }

    let cancelled = false;
    setProbeState({ kind: "queued" });
    const timeout = window.setTimeout(() => {
      if (cancelled) return;
      setProbeState({ kind: "checking" });
      chrome.runtime.sendMessage(
        { type: "probeDelegateContract", chainId, address: trimmed },
        (
          response:
            | { success: true; supports7821: boolean }
            | { success: false; error: string }
            | undefined,
        ) => {
          if (cancelled) return;
          if (!response) {
            setProbeState({ kind: "rpcError", message: "No response from background." });
          } else if (!response.success) {
            setProbeState({ kind: "rpcError", message: response.error });
          } else {
            setProbeState({
              kind: response.supports7821 ? "supported" : "unsupported",
            });
          }
        },
      );
    }, 300);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
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

  const broadcastSet = (targetDelegate: Address) => {
    setSubmitting(true);
    chrome.runtime.sendMessage(
      { type: "initiateSetDelegation", accountId, chainId, targetDelegate },
      (
        response:
          | { success: true; txId: string }
          | { success: false; error: string }
          | undefined,
      ) => {
        setSubmitting(false);
        if (!response?.success) {
          const message =
            (response && !response.success && response.error) ||
            "Unknown error preparing the delegation transaction.";
          if (choice === "custom" && /erc-?7821|invalid|rpc/i.test(message)) {
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
        reset();
        onClose();
      },
    );
  };

  const handleSet = () => {
    if (choice === "default") {
      broadcastSet(EIP_7702_DEFAULT_DELEGATE as Address);
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
    broadcastSet(trimmed as Address);
  };

  const handleRevoke = () => {
    setSubmitting(true);
    chrome.runtime.sendMessage(
      { type: "initiateRevokeDelegation", accountId, chainId },
      (
        response:
          | { success: true; txId: string }
          | { success: false; error: string }
          | undefined,
      ) => {
        setSubmitting(false);
        if (!response?.success) {
          toast({
            title: "Couldn't start revoke",
            description:
              (response && !response.success && response.error) ||
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

  const trimmedCustom = customAddress.trim();
  const onchainLower = currentStatus?.onchainDelegate?.toLowerCase() ?? null;
  const defaultIsNoOp =
    choice === "default" &&
    onchainLower === EIP_7702_DEFAULT_DELEGATE.toLowerCase();
  const customAddressIsValid = isAddress(trimmedCustom);
  const customMatchesOnchain =
    customAddressIsValid &&
    !!onchainLower &&
    onchainLower === trimmedCustom.toLowerCase();
  const customIsNoOp =
    choice === "custom" && (!customAddressIsValid || customMatchesOnchain);
  const customNeedsProbe =
    choice === "custom" && customAddressIsValid && !customMatchesOnchain;
  const probeBlocks = customNeedsProbe && probeState.kind !== "supported";
  const setDisabled =
    submitting || defaultIsNoOp || customIsNoOp || probeBlocks;

  const setDisabledReason: string | null = (() => {
    if (submitting) return null;
    if (defaultIsNoOp) return "Already delegated to the WalletChan default.";
    if (choice !== "custom") return null;
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
    return null;
  })();

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

  if (!isOpen) return null;

  return (
    <EditDelegateScreen
      accountAddress={accountAddress}
      chainName={chainName}
      chainIcon={chainConfig?.icon}
      explorer={chainConfig?.explorer}
      currentDelegate={currentStatus?.onchainDelegate ?? null}
      currentDelegateLabel={currentDelegateLabel}
      defaultDelegate={EIP_7702_DEFAULT_DELEGATE}
      hasDefaultDelegate={hasDefaultDelegate}
      choice={choice}
      submitting={submitting}
      customAddress={customAddress}
      inlineError={inlineError}
      probeKind={probeState.kind}
      setDisabled={setDisabled}
      setDisabledReason={setDisabledReason}
      confirmingCustom={confirmingCustom}
      delegateLabels={delegateLabels}
      understandText={understandText}
      understandOk={understandText.trim().toLowerCase() === "i understand"}
      onBack={handleClose}
      onChoiceChange={setChoice}
      onCustomAddressChange={(value) => {
        setCustomAddress(value);
        setCustomError(null);
      }}
      onRevoke={handleRevoke}
      onSet={handleSet}
      onCloseCustomConfirmation={() => {
        if (submitting) return;
        setConfirmingCustom(false);
        setUnderstandText("");
      }}
      onUnderstandTextChange={setUnderstandText}
      onConfirmCustom={handleConfirmCustom}
    />
  );
}
