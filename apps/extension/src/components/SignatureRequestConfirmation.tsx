import { useEffect, useState, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Badge,
  IconButton,
  Code,
  Flex,
  Spacer,
  Image,
  Spinner,
  Input,
  Collapse,
} from "@chakra-ui/react";
import { useThemedToast } from "@/hooks/useThemedToast";
import { ArrowBackIcon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "@chakra-ui/icons";
import { PendingSignatureRequest } from "@/chrome/pendingSignatureStorage";
import { getChainConfig } from "@/constants/chainConfig";
import TypedDataDisplay from "@/components/TypedDataDisplay";
import SiweMessageDisplay from "@/components/SiweMessageDisplay";
import { Eip712DigestDisplay } from "@/components/DigestDisplay";
import { ClearSigningView } from "@/components/ClearSigning/ClearSigningView";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import { CopyButton } from "@/components/CopyButton";
import ChainIcon from "@/components/ChainIcon";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";
import { analyzeSiweMessage } from "@/lib/siwe";
import { useTheme, useStripTokens, useIconChipBg, useChainBadgeStyle } from "@/theme";

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
   * Fired *before* the cancel message is sent to the background so the parent
   * can pre-navigate to an adjacent pending request, avoiding a flash of the
   * main screen between storage update and onCancelled navigation.
   */
  onBeforeCancel?: () => void;
  onNavigate: (direction: "prev" | "next") => void;
  onConfirmed?: () => void;
}

const scrollStyles = {
  "&::-webkit-scrollbar": { width: "6px" },
  "&::-webkit-scrollbar-track": { background: "var(--chakra-colors-bg-muted)" },
  "&::-webkit-scrollbar-thumb": { background: "var(--chakra-colors-border-default)" },
};

function getMethodDisplayName(method: string): string {
  switch (method) {
    case "personal_sign":
      return "Personal Sign";
    case "eth_sign":
      return "Eth Sign";
    case "eth_signTypedData":
      return "Sign Typed Data";
    case "eth_signTypedData_v3":
      return "Sign Typed Data v3";
    case "eth_signTypedData_v4":
      return "Sign Typed Data v4";
    default:
      return method;
  }
}

function getSignerAddress(method: string, params: any[]): string | null {
  if (method === "personal_sign" && params[1]) return params[1];
  if (method === "eth_sign" && params[0]) return params[0];
  if (method.startsWith("eth_signTypedData") && params[0]) return params[0];
  return null;
}

function formatSignatureData(method: string, params: any[]): { message: string; rawData: string; typedData?: any } {
  try {
    if (method === "personal_sign") {
      // params[0] is the message (hex or string), params[1] is the address
      const msgParam = params[0];
      let message = msgParam;

      // Try to decode hex to string
      if (typeof msgParam === "string" && msgParam.startsWith("0x")) {
        try {
          const hex = msgParam.slice(2);
          const bytes = new Uint8Array(hex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
          message = new TextDecoder().decode(bytes);
        } catch {
          message = msgParam;
        }
      }

      return {
        message,
        rawData: JSON.stringify(params, null, 2),
      };
    } else if (method === "eth_sign") {
      // params[0] is address, params[1] is the data hash
      return {
        message: params[1] || "",
        rawData: JSON.stringify(params, null, 2),
      };
    } else if (method.startsWith("eth_signTypedData")) {
      // params[0] is address, params[1] is the typed data
      const typedData = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
      return {
        message: typedData.message ? JSON.stringify(typedData.message, null, 2) : "",
        rawData: JSON.stringify(typedData, null, 2),
        typedData,
      };
    }
  } catch (e) {
    // Fall through to default
  }

  return {
    message: "",
    rawData: JSON.stringify(params, null, 2),
  };
}

/** Tabbed Message / Raw display for personal_sign and eth_sign */
function MessageDataDisplay({ message, rawData }: { message: string; rawData: string }) {
  const { tokens } = useTheme();
  // Same theme-aware tab strip pair as CalldataDecoder — see useStripTokens.
  const { bg: tabActiveBg, fg: tabActiveFg } = useStripTokens();
  const [tab, setTab] = useState<"message" | "raw">("message");

  const copyValue = tab === "message" ? message : rawData;

  return (
    <Box
      bg="surface.raised"
      border={tokens.borders.thin}
      borderColor="border.default"
      borderRadius="lg"
      boxShadow="card"
      overflow="hidden"
    >
      {/* Tab header */}
      <HStack p={0} borderBottom={tokens.borders.thin} borderColor="border.default" spacing={0}>
        <Box
          flex={1}
          py={2}
          px={3}
          cursor="pointer"
          bg={tab === "message" ? tabActiveBg : "transparent"}
          onClick={() => setTab("message")}
        >
          <Text
            fontSize="xs"
            fontWeight="800"
            textTransform="uppercase"
            letterSpacing="wide"
            textAlign="center"
            color={tab === "message" ? tabActiveFg : "text.secondary"}
          >
            Message
          </Text>
        </Box>
        <Box w="2px" bg="border.default" alignSelf="stretch" />
        <Box
          flex={1}
          py={2}
          px={3}
          cursor="pointer"
          bg={tab === "raw" ? tabActiveBg : "transparent"}
          onClick={() => setTab("raw")}
        >
          <Text
            fontSize="xs"
            fontWeight="800"
            textTransform="uppercase"
            letterSpacing="wide"
            textAlign="center"
            color={tab === "raw" ? tabActiveFg : "text.secondary"}
          >
            Raw
          </Text>
        </Box>
        <Spacer />
        <Box pr={1}>
          <CopyButton value={copyValue} />
        </Box>
      </HStack>

      {/* Message tab */}
      <Box p={3} display={tab === "message" ? "block" : "none"}>
        {message ? (
          <Box
            p={3}
            bg="status.info.bg"
            border={tokens.borders.thin}
            borderColor="border.default"
            borderRadius="md"
            maxH="200px"
            overflowY="auto"
            css={scrollStyles}
          >
            <Text fontSize="xs" fontFamily="mono" color="text.primary" wordBreak="break-all" whiteSpace="pre-wrap">
              {message}
            </Text>
          </Box>
        ) : (
          <Text fontSize="xs" color="text.secondary" fontWeight="600">
            No message data
          </Text>
        )}
      </Box>

      {/* Raw tab */}
      <Box p={3} display={tab === "raw" ? "block" : "none"}>
        <Box
          p={3}
          bg="status.info.bg"
          border={tokens.borders.thin}
          borderColor="border.default"
          borderRadius="md"
          maxH="200px"
          overflowY="auto"
          css={scrollStyles}
        >
          <Text fontSize="xs" fontFamily="mono" color="text.primary" wordBreak="break-all" whiteSpace="pre-wrap">
            {rawData}
          </Text>
        </Box>
      </Box>
    </Box>
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
  const { themeId, tokens } = useTheme();
  const isDarkTheme = themeId === "midnight";
  // Same theme-aware count badge pair as TransactionConfirmation — see useStripTokens.
  const { bg: stripBg, fg: stripFg } = useStripTokens();
  const iconChipBg = useIconChipBg();
  const { networksInfo } = useNetworks();
  const { signature, origin, chainName, favicon } = sigRequest;
  const resolvedChain = getResolvedChainById(signature.chainId, networksInfo);
  // Chain badge colors — mirrors TransactionConfirmation so the pill looks
  // identical across surfaces. All per-theme branching lives in
  // `useChainBadgeStyle`.
  const chainBadgeConfig = getChainConfig(signature.chainId);
  const chainBadgeBrandBg = resolvedChain?.bg ?? chainBadgeConfig.bg;
  const chainBadgeBrandFg = resolvedChain?.text ?? chainBadgeConfig.text;
  const chainBadgeStyle = useChainBadgeStyle(
    chainBadgeBrandBg,
    chainBadgeBrandFg,
    resolvedChain?.isCustom ?? false,
  );
  const { message, rawData, typedData } = formatSignatureData(signature.method, signature.params);
  const signerAddress = getSignerAddress(signature.method, signature.params);
  const siweAnalysis =
    signature.method === "personal_sign"
      ? analyzeSiweMessage(message, {
          origin,
          signerAddress,
          connectedChainId: signature.chainId,
        })
      : null;
  const siweBlockingError = siweAnalysis?.errors[0]?.message;
  const [siweOverrideText, setSiweOverrideText] = useState("");
  const [siweOverrideOpen, setSiweOverrideOpen] = useState(false);
  const siweOverrideOk =
    siweOverrideText.trim().toLowerCase() === "i understand";
  const siweOverrideRequired = !!siweBlockingError;

  useEffect(() => {
    setSiweOverrideText("");
    setSiweOverrideOpen(false);
  }, [sigRequest.id]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  // Tracks the in-flight reject for immediate spinner feedback during the
  // ~100–300 ms gap between the click and the parent navigating away.
  const [isRejecting, setIsRejecting] = useState(false);
  // Clear-signing resolution lifecycle. Eligible = there's a verifyingContract
  // to look up; once eligible, we hold off rendering the raw structured/raw
  // tabs until resolution settles so we don't get a flash-then-collapse.
  const clearSigningEligible = !!typedData?.domain?.verifyingContract;
  const [clearSigningStatus, setClearSigningStatus] = useState<
    "loading" | "matched" | "absent"
  >(clearSigningEligible ? "loading" : "absent");

  const handleCancel = () => {
    if (isRejecting) return;
    setIsRejecting(true);
    onBeforeCancel?.();
    chrome.runtime.sendMessage(
      { type: "rejectSignatureRequest", sigId: sigRequest.id },
      () => {
        onCancelled();
      }
    );
  };

  const handleConfirm = async () => {
    if (accountType !== "privateKey" && accountType !== "seedPhrase" && accountType !== "bankr") {
      return;
    }

    setIsSubmitting(true);

    try {
      // Get the current tab ID
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tab?.id;

      // Send confirm signature request to background
      const result = await new Promise<{ success: boolean; signature?: string; error?: string }>((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "confirmSignatureRequest",
            sigId: sigRequest.id,
            password: "", // Use cached password
            tabId,
            allowUnsafeSiwe: siweOverrideRequired && siweOverrideOk,
          },
          resolve
        );
      });

      if (result.success) {
        toast({
          title: "Signed",
          description: "Message signed successfully",
          status: "success",
          duration: 2000,
        });
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
        description: error instanceof Error ? error.message : "Failed to sign",
        status: "error",
        duration: 3000,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Box pt="clamp(1.25rem, calc(8vh - 36px), 3rem)" px={3} pb={3} h="100%" overflowY="auto" overflowX="hidden" bg="surface.base" css={{
      "&::-webkit-scrollbar": { width: "4px" },
      "&::-webkit-scrollbar-track": { background: "transparent" },
      "&::-webkit-scrollbar-thumb": { background: "var(--chakra-colors-border-strong)", borderRadius: "2px" },
    }}>
      <VStack spacing={2} align="stretch" minH="100%">
        {/* Top row — navigation centered + Reject All on right, only when
            multiple pending requests. chart.negative is RED in both themes
            (status.error.fg is white in Bauhaus). */}
        {totalCount > 1 && (
          <Flex align="center" justify="center" position="relative">
            <HStack spacing={0}>
              <IconButton
                aria-label="Previous"
                icon={<ChevronLeftIcon />}
                variant="ghost"
                size="xs"
                isDisabled={currentIndex === 0}
                onClick={() => onNavigate("prev")}
                color="text.secondary"
                _hover={{ color: "text.primary", bg: "bg.muted" }}
                minW="auto"
                p={1}
              />
              <Badge
                bg={stripBg}
                color={stripFg}
                fontSize="xs"
                px={3}
                py={1}
                fontWeight="700"
              >
                {currentIndex + 1}/{totalCount}
              </Badge>
              <IconButton
                aria-label="Next"
                icon={<ChevronRightIcon />}
                variant="ghost"
                size="xs"
                isDisabled={currentIndex + 1 === totalCount}
                onClick={() => onNavigate("next")}
                color="text.secondary"
                _hover={{ color: "text.primary", bg: "bg.muted" }}
                minW="auto"
                p={1}
              />
            </HStack>
            <Button
              position="absolute"
              right={0}
              size="xs"
              variant="ghost"
              color="chart.negative"
              fontWeight="700"
              _hover={{ bg: "status.error.bg", color: "status.error.fg" }}
              onClick={onCancelAll}
              px={2}
            >
              Reject All
            </Button>
          </Flex>
        )}

        {/* Header row — back + title pill, inline. accent.primary (red in
            Bauhaus) signals "high stakes". `mb` only kicks in once the
            viewport is tall enough to warrant breathing room (~700px+);
            popup windows (~600px) stay tight against the info card. */}
        <HStack spacing={2} align="center" mb="clamp(0px, calc(8vh - 56px), 3rem)">
          <IconButton
            aria-label="Back"
            icon={<ArrowBackIcon />}
            variant="ghost"
            size="md"
            px={2}
            onClick={onBack}
            flexShrink={0}
          />

          <Box
            flex="1"
            minW={0}
            bg="accent.primary"
            border={tokens.borders.medium}
            borderColor="border.default"
            borderRadius="lg"
            boxShadow="card"
            py={1.5}
            px={3}
            position="relative"
          >
            {/* Bauhaus exuberance — Midnight drops the corner triangle */}
            {!isDarkTheme && (
              <Box
                position="absolute"
                top="-3px"
                right="-3px"
                w="0"
                h="0"
                borderLeft="6px solid transparent"
                borderRight="6px solid transparent"
                borderBottom="12px solid"
                borderBottomColor="accent.highlight"
              />
            )}
            <Text
              fontWeight="900"
              fontSize="sm"
              color="accentFg.primary"
              textAlign="center"
              textTransform="uppercase"
              letterSpacing="wider"
              noOfLines={1}
            >
              Signature Request
            </Text>
          </Box>

          {/* Mirror the back button's footprint so the title pill sits
              visually centered even though there's no right-side action. */}
          <Box w={10} flexShrink={0} aria-hidden />
        </HStack>

        {/* Clear-signing (ERC-7730) view — rendered ABOVE the request info
            card on purpose, mirroring how the ERC-20 approval display sits
            above the Origin/From/Network rows on tx confirmations. The
            human-readable intent ("what is this actually doing?") is the
            primary content the user needs; provenance metadata is secondary.
            We hold off rendering the structured/raw block further down until
            this resolves to avoid a flash-then-collapse. */}
        {clearSigningEligible && (
          <ClearSigningView
            kind="eip712"
            chainId={signature.chainId}
            verifyingContract={typedData.domain.verifyingContract}
            typedData={typedData}
            onResolved={(matched) =>
              setClearSigningStatus(matched ? "matched" : "absent")
            }
          />
        )}

        {siweAnalysis && (
          <SiweMessageDisplay
            analysis={siweAnalysis}
            connectedChainId={signature.chainId}
            chainName={resolvedChain?.name ?? chainName}
          />
        )}

        {/* Request Info Card */}
        <Box
          bg="surface.raised"
          border={tokens.borders.thin}
          borderColor="border.default"
          borderRadius="lg"
          boxShadow="card"
          overflow="hidden"
          position="relative"
        >
          {/* Corner decoration — Bauhaus exuberance only */}
          {!isDarkTheme && (
            <Box
              position="absolute"
              top="-2px"
              right="-2px"
              w="8px"
              h="8px"
              bg="accent.secondary"
              border="1.5px solid"
              borderColor="border.default"
            />
          )}

          {/* Rows use explicit borderTop instead of VStack's `divider` prop
              — see BatchTransactionConfirmation info card for the rationale. */}
          <VStack spacing={0} align="stretch">
            {/* Origin */}
            <HStack w="full" py={2} px={3} justify="space-between">
              <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                Origin
              </Text>
              <HStack spacing={1.5}>
                <Box
                  bg={iconChipBg}
                  border="1.5px solid"
                  borderColor="border.subtle"
                  borderRadius="md"
                  p={0.5}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  <Image
                    src={
                      favicon ||
                      googleFaviconUrl(new URL(origin).hostname)
                    }
                    alt="favicon"
                    boxSize="14px"
                    sx={{ filter: "drop-shadow(0 0 0.5px rgba(0,0,0,0.4)) drop-shadow(0 0 0.5px rgba(255,255,255,0.4))" }}
                    onError={(e) => {
                      const target = e.target as HTMLImageElement;
                      const googleFallback = googleFaviconUrl(new URL(origin).hostname);
                      if (target.src !== googleFallback) {
                        target.src = googleFallback;
                      }
                    }}
                    fallback={<Box boxSize="14px" bg="bg.muted" borderRadius="sm" />}
                  />
                </Box>
                <Text fontSize="xs" fontWeight="700" color="text.primary">
                  {new URL(origin).hostname}
                </Text>
              </HStack>
            </HStack>

            {/* From */}
            {signerAddress && (
              <HStack
                w="full"
                py={2}
                px={3}
                justify="space-between"
                borderTop="1px solid"
                borderColor="border.subtle"
              >
                <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                  From
                </Text>
                <FromAccountDisplay address={signerAddress} />
              </HStack>
            )}

            {/* Network */}
            <HStack
              w="full"
              py={2}
              px={3}
              justify="space-between"
              borderTop="1px solid"
              borderColor="border.subtle"
            >
              <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                Network
              </Text>
              <Badge
                fontSize="xs"
                bg={chainBadgeStyle.bg}
                color={chainBadgeStyle.fg}
                border="1.5px solid"
                borderColor={chainBadgeStyle.border}
                fontWeight="700"
                px={2}
                py={0.5}
                display="flex"
                alignItems="center"
                gap={1}
              >
                <ChainIcon
                  chainId={signature.chainId}
                  chainName={resolvedChain?.name ?? chainName}
                  size="12px"
                  withChip
                />
                {resolvedChain?.name ?? chainName}
              </Badge>
            </HStack>

            {/* Method */}
            <HStack
              w="full"
              py={2}
              px={3}
              justify="space-between"
              borderTop="1px solid"
              borderColor="border.subtle"
            >
              <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                Method
              </Text>
              <Code
                px={1.5}
                py={0.5}
                fontSize="xs"
                bg="surface.raised"
                color="text.primary"
                fontFamily="mono"
                border="1.5px solid"
                borderColor="border.default"
                fontWeight="700"
              >
                {getMethodDisplayName(signature.method)}
              </Code>
            </HStack>
          </VStack>
        </Box>

        {/* Typed Data Display (structured + raw). Defaults collapsed when a
            clear-signing card sits above it — the human-readable view is the
            primary surface, raw stays available behind a one-tap toggle. */}
        {clearSigningStatus !== "loading" &&
          (typedData ? (
            <TypedDataDisplay
              typedData={typedData}
              rawData={rawData}
              defaultCollapsed={clearSigningStatus === "matched"}
              connectedChainId={signature.chainId}
            />
          ) : !siweAnalysis ? (
            <MessageDataDisplay message={message} rawData={rawData} />
          ) : null)}

        {/* Pinned bottom section — `mt="auto"` keeps it anchored to the
            bottom when content is shorter than the viewport; `position:sticky`
            keeps it in view while scrolling long typed-data messages. */}
        <Box
          mt="auto"
          position="sticky"
          bottom={-3}
          bg="surface.base"
          pt={1}
          pb={3}
          mx={-3}
          px={3}
          zIndex={1}
        >
        <VStack spacing={2} align="stretch">
          {/* ERC-8213: EIP-712 Digest */}
          {typedData && (
            <Eip712DigestDisplay typedData={typedData} />
          )}

          {/* Impersonator Info Box */}
          {accountType === "impersonator" && (
            <Box
              bg="accent.highlight"
              border={tokens.borders.medium}
              borderColor="border.default"
              borderRadius="lg"
              boxShadow="card"
              p={3}
              mb={2}
            >
              <Text fontSize="sm" color="accentFg.highlight" fontWeight="700">
                Connected via Impersonated account — signing is disabled.
              </Text>
            </Box>
          )}

          {siweOverrideRequired &&
            (accountType === "privateKey" || accountType === "seedPhrase" || accountType === "bankr") && (
              <Box
                bg="status.warning.bg"
                border={tokens.borders.thin}
                borderColor="status.warning.border"
                borderRadius="lg"
                overflow="hidden"
                mt={2}
              >
                <HStack
                  as="button"
                  type="button"
                  w="full"
                  p={3}
                  justify="space-between"
                  textAlign="left"
                  onClick={() => setSiweOverrideOpen((open) => !open)}
                  disabled={isSubmitting || isRejecting}
                  _hover={{ bg: "status.warning.bg" }}
                  _disabled={{ cursor: "not-allowed", opacity: 0.65 }}
                  aria-expanded={siweOverrideOpen}
                >
                  <Text fontSize="sm" color="status.warning.fg" fontWeight="900">
                    Continue Anyways?
                  </Text>
                  <ChevronDownIcon
                    color="status.warning.fg"
                    transform={
                      siweOverrideOpen ? "rotate(180deg)" : "rotate(0deg)"
                    }
                    transition="transform 0.15s ease"
                    flexShrink={0}
                  />
                </HStack>
                <Collapse in={siweOverrideOpen} animateOpacity>
                  <VStack
                    spacing={2}
                    align="stretch"
                    px={3}
                    pb={3}
                    pt={0}
                  >
                    <Text
                      fontSize="xs"
                      color="status.warning.fg"
                      fontWeight="800"
                      lineHeight="short"
                    >
                      This SIWE message failed validation. Signing anyway may
                      log you into the wrong site, chain, or account.
                    </Text>
                    <Text fontSize="2xs" color="status.warning.fg" fontWeight="700">
                      Type{" "}
                      <Text as="span" fontWeight="900">
                        I understand
                      </Text>{" "}
                      to sign anyway.
                    </Text>
                    <Input
                      placeholder="I understand"
                      value={siweOverrideText}
                      onChange={(e) => setSiweOverrideText(e.target.value)}
                      isDisabled={isSubmitting || isRejecting}
                      fontSize="sm"
                      bg="surface.sunken"
                    />
                  </VStack>
                </Collapse>
              </Box>
            )}

          {/* Action Buttons */}
          {(accountType === "privateKey" || accountType === "seedPhrase" || accountType === "bankr") ? (
            <HStack spacing={3}>
              <Button
                variant="secondary"
                flex={1}
                onClick={handleCancel}
                isDisabled={isSubmitting}
                isLoading={isRejecting}
                spinner={
                  <Spinner size="sm" sx={{ animationDirection: "reverse" }} />
                }
              >
                Reject
              </Button>
              <Button
                variant="highlight"
                flex={1}
                onClick={handleConfirm}
                isLoading={isSubmitting}
                loadingText="Signing..."
                isDisabled={isRejecting || (siweOverrideRequired && !siweOverrideOk)}
                title={siweBlockingError && !siweOverrideOk ? `SIWE validation failed: ${siweBlockingError}` : undefined}
              >
                Sign
              </Button>
            </HStack>
          ) : (
            <Button
              variant="danger"
              w="full"
              onClick={handleCancel}
              isLoading={isRejecting}
              spinner={
                <Spinner size="sm" sx={{ animationDirection: "reverse" }} />
              }
            >
              Reject
            </Button>
          )}
        </VStack>
        </Box>
      </VStack>
    </Box>
  );
}

export default memo(SignatureRequestConfirmation);
