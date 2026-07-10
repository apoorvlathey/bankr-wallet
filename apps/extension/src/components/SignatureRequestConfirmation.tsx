import { memo, useEffect, useState } from "react";
import {
  Badge,
  Button,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";

import type { PendingSignatureRequest } from "@/chrome/pendingSignatureStorage";
import ChainIcon from "@/components/ChainIcon";
import {
  ClearSigningView,
  type ClearSigningViewProps,
} from "@/components/ClearSigning/ClearSigningView";
import { Eip712DigestDisplay } from "@/components/DigestDisplay";
import Erc7710DelegationDisplay from "@/components/Erc7710DelegationDisplay";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import { SignatureConfirmationScreen } from "@/components/SignatureConfirmation/SignatureConfirmationScreen";
import { SignatureMessageData } from "@/components/SignatureConfirmation/SignatureMessageData";
import {
  formatSignatureData,
  getMethodDisplayName,
  getSignatureIntent,
  getSignerAddress,
} from "@/components/SignatureConfirmation/signaturePresentation";
import SiweMessageDisplay from "@/components/SiweMessageDisplay";
import TypedDataDisplay from "@/components/TypedDataDisplay";
import { getChainConfig } from "@/constants/chainConfig";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { useNetworks } from "@/contexts/NetworksContext";
import { useThemedToast } from "@/hooks/useThemedToast";
import { getResolvedChainById } from "@/lib/chains";
import { isErc7710DelegationTypedData } from "@/lib/erc7710Delegation";
import { analyzeSiweMessage } from "@/lib/siwe";
import { useChainBadgeStyle } from "@/theme";

interface SignatureRequestConfirmationProps {
  sigRequest: PendingSignatureRequest;
  currentIndex: number;
  totalCount: number;
  isInSidePanel: boolean;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  onBack: () => void;
  onCancelled: () => void;
  onCancelAll: () => void;
  /**
   * Fired before cancellation so the parent can select the adjacent pending
   * request without flashing the root screen between storage updates.
   */
  onBeforeCancel?: () => void;
  onNavigate: (direction: "prev" | "next") => void;
  onConfirmed?: () => void;
}

type ClearSigningTypedData = Extract<
  ClearSigningViewProps,
  { kind: "eip712" }
>["typedData"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isClearSigningTypedData(
  value: unknown,
): value is ClearSigningTypedData {
  if (!isRecord(value)) return false;
  if (typeof value.primaryType !== "string") return false;
  if (!isRecord(value.types) || !isRecord(value.message)) return false;
  if (value.domain !== undefined && !isRecord(value.domain)) return false;

  return Object.values(value.types).every(
    (fields) =>
      Array.isArray(fields) &&
      fields.every(
        (field) =>
          isRecord(field) &&
          typeof field.name === "string" &&
          typeof field.type === "string",
      ),
  );
}

function SignatureRequestConfirmation({
  sigRequest,
  currentIndex,
  totalCount,
  accountType = "bankr",
  onBack,
  onCancelled,
  onCancelAll,
  onBeforeCancel,
  onNavigate,
  onConfirmed,
}: SignatureRequestConfirmationProps) {
  const toast = useThemedToast();
  const { networksInfo } = useNetworks();
  const { signature, origin, chainName, favicon } = sigRequest;
  const trustedOrigin = sigRequest.senderOrigin ?? origin;
  const trustedOriginHostname = (() => {
    try {
      return new URL(trustedOrigin).hostname;
    } catch {
      try {
        return new URL(origin).hostname;
      } catch {
        return trustedOrigin;
      }
    }
  })();
  const trustedFallbackFavicon = googleFaviconUrl(trustedOriginHostname);
  const trustedFavicon = favicon || trustedFallbackFavicon;
  const resolvedChain = getResolvedChainById(signature.chainId, networksInfo);
  const chainBadgeConfig = getChainConfig(signature.chainId);
  const chainBadgeStyle = useChainBadgeStyle(
    resolvedChain?.bg ?? chainBadgeConfig.bg,
    resolvedChain?.text ?? chainBadgeConfig.text,
    resolvedChain?.isCustom ?? false,
  );
  const displayChainName = resolvedChain?.name ?? chainName;
  const { message, rawData, typedData } = formatSignatureData(
    signature.method,
    signature.params,
  );
  const signerAddress = getSignerAddress(
    signature.method,
    signature.params,
  );
  const siweAnalysis =
    signature.method === "personal_sign"
      ? analyzeSiweMessage(message, {
          origin: trustedOrigin,
          signerAddress,
          connectedChainId: signature.chainId,
        })
      : null;
  const siweBlockingError = siweAnalysis?.errors[0]?.message;
  const siweOverrideRequired = Boolean(siweBlockingError);
  const [siweOverrideText, setSiweOverrideText] = useState("");
  const [siweOverrideOpen, setSiweOverrideOpen] = useState(false);
  const siweOverrideOk =
    siweOverrideText.trim().toLowerCase() === "i understand";

  useEffect(() => {
    setSiweOverrideText("");
    setSiweOverrideOpen(false);
  }, [sigRequest.id]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const erc7710Delegation = isErc7710DelegationTypedData(typedData)
    ? typedData
    : null;
  const clearSigningTypedData = isClearSigningTypedData(typedData)
    ? typedData
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
            allowUnsafeSiwe: siweOverrideRequired && siweOverrideOk,
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
    originHostname: trustedOriginHostname,
    typedData,
    isSiwe: Boolean(siweAnalysis),
    isDelegation: Boolean(erc7710Delegation),
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
    <SiweMessageDisplay
      analysis={siweAnalysis}
      connectedChainId={signature.chainId}
      chainName={displayChainName}
      faviconUrl={trustedFavicon}
      fallbackFaviconUrl={trustedFallbackFavicon}
    />
  ) : undefined;

  const advancedDetails =
    clearSigningStatus === "loading" ? undefined : typedData ? (
      <VStack align="stretch" spacing={4}>
        <TypedDataDisplay
          typedData={typedData}
          rawData={rawData}
          connectedChainId={signature.chainId}
        />
        <Eip712DigestDisplay typedData={typedData} />
      </VStack>
    ) : !siweAnalysis ? (
      <SignatureMessageData message={message} rawData={rawData} />
    ) : undefined;

  const networkBadge = (
    <Badge
      display="flex"
      alignItems="center"
      gap={1.5}
      px={2}
      py={1}
      bg={chainBadgeStyle.bg}
      color={chainBadgeStyle.fg}
      borderWidth="1px"
      borderColor={chainBadgeStyle.border}
      fontSize="xs"
      fontWeight="600"
      whiteSpace="normal"
      textAlign="right"
    >
      <ChainIcon
        chainId={signature.chainId}
        chainName={displayChainName}
        size="14px"
        withChip
      />
      {displayChainName}
    </Badge>
  );

  const intentStatus = !canSign ? (
    <Badge
      bg="status.warning.bg"
      color="status.warning.fg"
      borderWidth="1px"
      borderColor="status.warning.border"
      fontSize="xs"
    >
      View only
    </Badge>
  ) : siweBlockingError ? (
    <Badge
      bg="status.error.bg"
      color="status.error.fg"
      borderWidth="1px"
      borderColor="status.error.border"
      fontSize="xs"
    >
      Validation failed
    </Badge>
  ) : undefined;

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
      variant="primary"
      onClick={handleConfirm}
      isLoading={isSubmitting}
      loadingText="Signing"
      isDisabled={
        isRejecting || (siweOverrideRequired && !siweOverrideOk)
      }
      title={
        siweBlockingError && !siweOverrideOk
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

  return (
    <SignatureConfirmationScreen
      onBack={onBack}
      intent={intent.title}
      intentContext={
        <VStack align="stretch" spacing={1}>
          <Text color="fg.secondary" fontSize="sm" lineHeight="1.45">
            {intent.description}
          </Text>
          {!canSign && (
            <Text color="status.warning.fg" fontSize="sm" lineHeight="1.45">
              This is a view-only account and cannot create signatures. You
              can safely reject the request.
            </Text>
          )}
        </VStack>
      }
      faviconUrl={trustedFavicon}
      fallbackFaviconUrl={trustedFallbackFavicon}
      intentStatus={intentStatus}
      queue={{
        currentIndex,
        totalCount,
        onNavigate,
        onRejectAll: onCancelAll,
      }}
      requestContext={{
        originHostname: trustedOriginHostname,
        faviconUrl: trustedFavicon,
        fallbackFaviconUrl: trustedFallbackFavicon,
        account: signerAddress ? (
          <FromAccountDisplay address={signerAddress} />
        ) : undefined,
        network: networkBadge,
        methodName: getMethodDisplayName(signature.method),
      }}
      readableDetails={readableDetails}
      readableDetailsTitle={
        siweAnalysis
          ? "Sign-in details"
          : erc7710Delegation
            ? "Permissions requested"
            : "What you're authorizing"
      }
      advancedDetails={advancedDetails}
      unsafeSiweAcknowledgement={
        siweOverrideRequired && canSign && siweBlockingError
          ? {
              isOpen: siweOverrideOpen,
              value: siweOverrideText,
              blockingError: siweBlockingError,
              isValid: siweOverrideOk,
              isDisabled: isSubmitting || isRejecting,
              onOpenChange: setSiweOverrideOpen,
              onValueChange: setSiweOverrideText,
            }
          : undefined
      }
      confirmAction={confirmButton}
      rejectAction={canSign ? rejectButton : undefined}
    />
  );
}

export default memo(SignatureRequestConfirmation);
