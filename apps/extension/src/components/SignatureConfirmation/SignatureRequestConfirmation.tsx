import { memo, useEffect, useMemo, useState } from "react";
import { Button, Spinner, VStack } from "@chakra-ui/react";

import type { PendingSignatureRequest } from "@/chrome/requests/pendingSignatureStorage";
import {
  ClearSigningView,
} from "@/components/ClearSigning/ClearSigningView";
import { CopyButton } from "@/components/CopyButton";
import { Eip712DigestDisplay } from "@/components/DigestDisplay";
import Erc7710DelegationDisplay from "@/components/Erc7710DelegationDisplay";
import SiweMessageDisplay from "@/components/SiweMessageDisplay";
import TypedDataDisplay from "@/components/TypedDataDisplay";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { useNetworks } from "@/contexts/NetworksContext";
import { useThemedToast } from "@/hooks/useThemedToast";
import { getResolvedChainById } from "@/lib/chains";
import { isErc7710DelegationTypedData } from "@/lib/erc7710Delegation";
import { analyzeSiweMessage } from "@/lib/siwe";
import { useIconChipBg, useStripTokens } from "@/theme";
import { SignatureConfirmationScreen } from "./SignatureConfirmationScreen";
import { SignatureDecisionSummary } from "./SignatureDecisionSummary";
import {
  RawSignatureData,
  SignatureMessageData,
} from "./SignatureMessageData";
import {
  formatSignatureData,
  getMethodDisplayName,
  getOriginHostname,
  getSignatureIntent,
  getSignerAddress,
  isClearSigningTypedData,
} from "./signaturePresentation";

interface SignatureRequestConfirmationProps {
  sigRequest: PendingSignatureRequest;
  currentIndex: number;
  totalCount: number;
  isInSidePanel: boolean;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  onBack: () => void;
  onCancelled: () => void;
  onRejectAll: () => void;
  onBeforeCancel?: () => void;
  onNavigate: (direction: "prev" | "next") => void;
  onConfirmed?: () => void;
}

function SignatureRequestConfirmation({
  sigRequest,
  currentIndex,
  totalCount,
  accountType = "bankr",
  onBack,
  onCancelled,
  onRejectAll,
  onBeforeCancel,
  onNavigate,
  onConfirmed,
}: SignatureRequestConfirmationProps) {
  const toast = useThemedToast();
  const { networksInfo } = useNetworks();
  const iconChipBg = useIconChipBg();
  const { bg: stripBg, fg: stripFg } = useStripTokens();
  const { signature, origin, chainName, favicon } = sigRequest;
  const trustedOrigin = sigRequest.senderOrigin ?? origin;
  const originHostname = getOriginHostname(trustedOrigin, origin);
  const fallbackFavicon = googleFaviconUrl(originHostname);
  const trustedFavicon = favicon || fallbackFavicon;
  const resolvedChain = getResolvedChainById(signature.chainId, networksInfo);
  const displayChainName = resolvedChain?.name ?? chainName;
  const explorer = resolvedChain?.explorer;
  const formatted = useMemo(
    () => formatSignatureData(signature.method, signature.params),
    [signature.method, signature.params],
  );
  const signerAddress =
    getSignerAddress(signature.method, signature.params) ??
    sigRequest.accountAddress ??
    null;
  const siweAnalysis =
    signature.method === "personal_sign" && formatted.messageReadable
      ? analyzeSiweMessage(formatted.message, {
          origin: trustedOrigin,
          signerAddress,
          connectedChainId: signature.chainId,
        })
      : null;
  const siweBlockingError = siweAnalysis?.errors[0]?.message;
  const siweOverrideRequired = Boolean(siweBlockingError);
  const [siweOverrideAcknowledged, setSiweOverrideAcknowledged] =
    useState(false);
  const [siweOverrideOpen, setSiweOverrideOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const erc7710Delegation = isErc7710DelegationTypedData(formatted.typedData)
    ? formatted.typedData
    : null;
  const clearSigningTypedData = isClearSigningTypedData(formatted.typedData)
    ? formatted.typedData
    : null;
  const clearSigningVerifyingContract =
    typeof clearSigningTypedData?.domain?.verifyingContract === "string"
      ? clearSigningTypedData.domain.verifyingContract
      : null;
  const clearSigningEligible = Boolean(
    clearSigningVerifyingContract && !erc7710Delegation,
  );
  const [clearSigningStatus, setClearSigningStatus] = useState<
    "loading" | "matched" | "absent"
  >(
    erc7710Delegation
      ? "matched"
      : clearSigningEligible
        ? "loading"
        : "absent",
  );

  useEffect(() => {
    setSiweOverrideAcknowledged(false);
    setSiweOverrideOpen(false);
    setClearSigningStatus(
      erc7710Delegation
        ? "matched"
        : clearSigningEligible
          ? "loading"
          : "absent",
    );
  }, [sigRequest.id, erc7710Delegation, clearSigningEligible]);

  const canSign =
    accountType === "privateKey" ||
    accountType === "seedPhrase" ||
    accountType === "bankr";

  const handleCancel = () => {
    if (isRejecting) return;
    setIsRejecting(true);
    onBeforeCancel?.();
    chrome.runtime.sendMessage(
      { type: "rejectSignatureRequest", sigId: sigRequest.id },
      () => onCancelled(),
    );
  };

  const handleConfirm = async () => {
    if (!canSign) return;
    setIsSubmitting(true);

    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      const result = await new Promise<{
        success: boolean;
        signature?: string;
        error?: string;
      }>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "confirmSignatureRequest",
            sigId: sigRequest.id,
            password: "",
            tabId: tab?.id,
            allowUnsafeSiwe:
              siweOverrideRequired && siweOverrideAcknowledged,
          },
          resolve,
        );
      });

      if (result.success) {
        onConfirmed?.();
      } else {
        toast({
          title: "Signing failed",
          description: result.error || "Failed to sign message",
          status: "error",
          duration: 3000,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to sign",
        status: "error",
        duration: 3000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const intent = getSignatureIntent({
    method: signature.method,
    originHostname,
    typedData: formatted.typedData,
    isSiwe: Boolean(siweAnalysis),
    isDelegation: Boolean(erc7710Delegation),
    messageReadable: formatted.messageReadable,
  });

  const readableDetails = erc7710Delegation ? (
    <Erc7710DelegationDisplay
      typedData={erc7710Delegation}
      chainId={signature.chainId}
    />
  ) : clearSigningTypedData &&
    clearSigningVerifyingContract &&
    clearSigningEligible &&
    clearSigningStatus !== "absent" ? (
    <ClearSigningView
      kind="eip712"
      chainId={signature.chainId}
      from={signerAddress}
      verifyingContract={clearSigningVerifyingContract}
      typedData={clearSigningTypedData}
      onResolved={(matched) =>
        setClearSigningStatus(matched ? "matched" : "absent")
      }
    />
  ) : siweAnalysis ? (
    <SiweMessageDisplay analysis={siweAnalysis} />
  ) : formatted.typedData ? (
    <TypedDataDisplay
      typedData={formatted.typedData}
      rawData={formatted.rawPayload}
      connectedChainId={signature.chainId}
      explorer={explorer}
      mode="message"
    />
  ) : (
    <SignatureMessageData
      message={formatted.message}
      messageReadable={formatted.messageReadable}
      rawPayload={formatted.rawPayload}
    />
  );

  const advancedDetails = formatted.typedData ? (
    <VStack align="stretch" spacing={4}>
      <TypedDataDisplay
        typedData={formatted.typedData}
        rawData={formatted.rawPayload}
        connectedChainId={signature.chainId}
        explorer={explorer}
        mode="technical"
      />
      <Eip712DigestDisplay typedData={formatted.typedData} />
    </VStack>
  ) : (
    <RawSignatureData
      message={siweAnalysis ? formatted.message : undefined}
      rawPayload={formatted.rawPayload}
      rawData={formatted.rawData}
      includeRawPayload={formatted.messageReadable}
    />
  );

  const rejectButton = (
    <Button
      variant="secondary"
      onClick={handleCancel}
      isDisabled={isSubmitting}
      isLoading={isRejecting}
      loadingText="Rejecting"
      spinner={<Spinner size="sm" sx={{ animationDirection: "reverse" }} />}
    >
      Reject
    </Button>
  );
  const confirmButton = canSign ? (
    <Button
      variant="brand"
      onClick={handleConfirm}
      isLoading={isSubmitting}
      loadingText="Signing"
      isDisabled={
        isRejecting ||
        (siweOverrideRequired && !siweOverrideAcknowledged)
      }
      title={
        siweBlockingError && !siweOverrideAcknowledged
          ? `SIWE validation failed: ${siweBlockingError}`
          : undefined
      }
    >
      Sign
    </Button>
  ) : (
    <Button
      variant="danger"
      onClick={handleCancel}
      isLoading={isRejecting}
      loadingText="Rejecting"
      spinner={<Spinner size="sm" sx={{ animationDirection: "reverse" }} />}
    >
      Reject request
    </Button>
  );
  const originInitials = (originHostname || origin || "?")
    .split(/[.\s-]+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "?";

  return (
    <SignatureConfirmationScreen
      onBack={onBack}
      trailing={
        <CopyButton
          label="Copy signature request"
          value={formatted.rawData}
        />
      }
      origin={origin}
      originHostname={originHostname}
      faviconUrl={trustedFavicon}
      iconChipBg={iconChipBg}
      originInitials={originInitials}
      intent={intent.title}
      intentDescription={intent.description}
      intentStatus={
        !canSign
          ? { label: "View only", variant: "warning" }
          : siweBlockingError
            ? { label: "Validation failed", variant: "error" }
            : undefined
      }
      currentIndex={currentIndex}
      totalCount={totalCount}
      stripBg={stripBg}
      stripFg={stripFg}
      onNavigate={onNavigate}
      onRejectAll={onRejectAll}
      readableDetails={readableDetails}
      readableDetailsTitle={
        siweAnalysis
          ? "Sign-in details"
          : erc7710Delegation
            ? "Permissions requested"
            : formatted.typedData
              ? "Message fields"
              : "Message"
      }
      methodName={getMethodDisplayName(signature.method)}
      chainId={signature.chainId}
      chainName={displayChainName}
      advancedDetails={advancedDetails}
      actionSummary={
        signerAddress ? (
          <SignatureDecisionSummary
            address={signerAddress}
            unsafeSiweDecision={
              siweOverrideRequired && canSign && siweBlockingError
                ? {
                    isOpen: siweOverrideOpen,
                    isAcknowledged: siweOverrideAcknowledged,
                    blockingError: siweBlockingError,
                    isDisabled: isSubmitting || isRejecting,
                    onOpenChange: setSiweOverrideOpen,
                    onAcknowledgedChange: setSiweOverrideAcknowledged,
                  }
                : undefined
            }
          />
        ) : undefined
      }
      confirmAction={confirmButton}
      rejectAction={canSign ? rejectButton : undefined}
    />
  );
}

export default memo(SignatureRequestConfirmation);
