import { useState, memo } from "react";
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
} from "@chakra-ui/react";
import { useThemedToast } from "@/hooks/useThemedToast";
import { ArrowBackIcon, ChevronLeftIcon, ChevronRightIcon } from "@chakra-ui/icons";
import { PendingSignatureRequest } from "@/chrome/pendingSignatureStorage";
import { getChainConfig } from "@/constants/chainConfig";
import TypedDataDisplay from "@/components/TypedDataDisplay";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import { CopyButton } from "@/components/CopyButton";
import ChainIcon from "@/components/ChainIcon";
import { googleFaviconUrl } from "@/constants/externalUrls";
import { useNetworks } from "@/contexts/NetworksContext";
import { getResolvedChainById } from "@/lib/chains";
import { useTheme, useStripTokens, useIconChipBg } from "@/theme";

interface SignatureRequestConfirmationProps {
  sigRequest: PendingSignatureRequest;
  currentIndex: number;
  totalCount: number;
  isInSidePanel: boolean;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  onBack: () => void;
  onCancelled: () => void;
  onCancelAll: () => void;
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
  isInSidePanel,
  accountType = "bankr",
  onBack,
  onCancelled,
  onCancelAll,
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
  const { message, rawData, typedData } = formatSignatureData(signature.method, signature.params);
  const signerAddress = getSignerAddress(signature.method, signature.params);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCancel = () => {
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

        {/* Secondary row — navigation + Reject All, only when multiple
            pending requests. chart.negative is RED in both themes
            (status.error.fg is white in Bauhaus). */}
        {totalCount > 1 && (
          <Flex align="center">
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
            <Spacer />
            <Button
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
              {(() => {
                const config = getChainConfig(signature.chainId);
                const badgeChain = resolvedChain ?? {
                  name: chainName,
                  bg: config.bg,
                  text: config.text,
                  icon: config.icon,
                  isCustom: false,
                };
                return (
                  <Badge
                    fontSize="xs"
                    bg={badgeChain.isCustom ? "surface.raised" : badgeChain.bg}
                    color={badgeChain.isCustom ? "fg.primary" : badgeChain.text}
                    border="1.5px solid"
                    borderColor="border.default"
                    fontWeight="700"
                    px={2}
                    py={0.5}
                    display="flex"
                    alignItems="center"
                    gap={1}
                  >
                    <ChainIcon
                      chainId={signature.chainId}
                      chainName={badgeChain.name}
                      size="12px"
                    />
                    {badgeChain.name}
                  </Badge>
                );
              })()}
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

        {/* Typed Data Display (structured + raw) */}
        {typedData ? (
          <TypedDataDisplay typedData={typedData} rawData={rawData} />
        ) : (
          <MessageDataDisplay message={message} rawData={rawData} />
        )}

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

          {/* Action Buttons */}
          {(accountType === "privateKey" || accountType === "seedPhrase" || accountType === "bankr") ? (
            <HStack spacing={3}>
              <Button
                variant="secondary"
                flex={1}
                onClick={handleCancel}
                isDisabled={isSubmitting}
              >
                Reject
              </Button>
              <Button
                variant="highlight"
                flex={1}
                onClick={handleConfirm}
                isLoading={isSubmitting}
                loadingText="Signing..."
              >
                Sign
              </Button>
            </HStack>
          ) : (
            <Button
              variant="danger"
              w="full"
              onClick={handleCancel}
            >
              Reject
            </Button>
          )}
        </Box>
      </VStack>
    </Box>
  );
}

export default memo(SignatureRequestConfirmation);
