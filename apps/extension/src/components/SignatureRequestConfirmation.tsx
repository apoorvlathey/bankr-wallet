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
import { useBauhausToast } from "@/hooks/useBauhausToast";
import { ArrowBackIcon, ChevronLeftIcon, ChevronRightIcon } from "@chakra-ui/icons";
import { PendingSignatureRequest } from "@/chrome/pendingSignatureStorage";
import { getChainConfig } from "@/constants/chainConfig";
import TypedDataDisplay from "@/components/TypedDataDisplay";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import { CopyButton } from "@/components/CopyButton";
import { googleFaviconUrl } from "@/constants/externalUrls";

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
  "&::-webkit-scrollbar-track": { background: "#E0E0E0" },
  "&::-webkit-scrollbar-thumb": { background: "#121212" },
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
  const [tab, setTab] = useState<"message" | "raw">("message");

  const copyValue = tab === "message" ? message : rawData;

  return (
    <Box
      bg="bauhaus.white"
      border="2px solid"
      borderColor="bauhaus.black"
      boxShadow="4px 4px 0px 0px #121212"
    >
      {/* Tab header */}
      <HStack p={0} borderBottom="2px solid" borderColor="bauhaus.black" spacing={0}>
        <Box
          flex={1}
          py={2}
          px={3}
          cursor="pointer"
          bg={tab === "message" ? "bauhaus.black" : "transparent"}
          onClick={() => setTab("message")}
        >
          <Text
            fontSize="xs"
            fontWeight="800"
            textTransform="uppercase"
            letterSpacing="wide"
            textAlign="center"
            color={tab === "message" ? "bauhaus.white" : "text.secondary"}
          >
            Message
          </Text>
        </Box>
        <Box w="2px" bg="bauhaus.black" alignSelf="stretch" />
        <Box
          flex={1}
          py={2}
          px={3}
          cursor="pointer"
          bg={tab === "raw" ? "bauhaus.black" : "transparent"}
          onClick={() => setTab("raw")}
        >
          <Text
            fontSize="xs"
            fontWeight="800"
            textTransform="uppercase"
            letterSpacing="wide"
            textAlign="center"
            color={tab === "raw" ? "bauhaus.white" : "text.secondary"}
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
            bg="#EEF2FF"
            border="2px solid"
            borderColor="bauhaus.black"
            maxH="200px"
            overflowY="auto"
            css={scrollStyles}
          >
            <Text fontSize="xs" fontFamily="mono" color="text.tertiary" wordBreak="break-all" whiteSpace="pre-wrap">
              {message}
            </Text>
          </Box>
        ) : (
          <Text fontSize="xs" color="text.tertiary" fontWeight="600">
            No message data
          </Text>
        )}
      </Box>

      {/* Raw tab */}
      <Box p={3} display={tab === "raw" ? "block" : "none"}>
        <Box
          p={3}
          bg="#EEF2FF"
          border="2px solid"
          borderColor="bauhaus.black"
          maxH="200px"
          overflowY="auto"
          css={scrollStyles}
        >
          <Text fontSize="xs" fontFamily="mono" color="text.tertiary" wordBreak="break-all" whiteSpace="pre-wrap">
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
  const toast = useBauhausToast();
  const { signature, origin, chainName, favicon } = sigRequest;
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
    <Box pt={1} px={3} pb={3} h="100%" overflowY="auto" overflowX="hidden" bg="bg.base" css={{
      "&::-webkit-scrollbar": { width: "4px" },
      "&::-webkit-scrollbar-track": { background: "transparent" },
      "&::-webkit-scrollbar-thumb": { background: "#ccc", borderRadius: "2px" },
    }}>
      <VStack spacing={2} align="stretch">
        {/* Top row - Back button, navigation, Reject All */}
        <Flex align="center" position="relative">
          {/* Left - Back button */}
          <IconButton
            aria-label="Back"
            icon={<ArrowBackIcon />}
            variant="ghost"
            size="sm"
            onClick={onBack}
            minW="auto"
          />

          {/* Center - Navigation (absolutely positioned for true centering) */}
          {totalCount > 1 && (
            <HStack
              spacing={0}
              position="absolute"
              left="50%"
              transform="translateX(-50%)"
            >
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
                bg="bauhaus.black"
                color="bauhaus.white"
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
          )}

          {/* Right - Reject All */}
          <Spacer />
          {totalCount > 1 && (
            <Button
              size="xs"
              variant="ghost"
              color="bauhaus.red"
              fontWeight="700"
              _hover={{ bg: "bauhaus.red", color: "white" }}
              onClick={onCancelAll}
              px={2}
            >
              Reject All
            </Button>
          )}
        </Flex>

        {/* Title row with red background */}
        <Box
          bg="bauhaus.red"
          border="3px solid"
          borderColor="bauhaus.black"
          boxShadow="4px 4px 0px 0px #121212"
          py={3}
          px={4}
          position="relative"
        >
          <Box
            position="absolute"
            top="-3px"
            right="-3px"
            w="0"
            h="0"
            borderLeft="6px solid transparent"
            borderRight="6px solid transparent"
            borderBottom="12px solid"
            borderBottomColor="bauhaus.yellow"
          />
          <Text fontWeight="900" fontSize="lg" color="white" textAlign="center" textTransform="uppercase" letterSpacing="wider">
            Signature Request
          </Text>
        </Box>

        {/* Request Info Card */}
        <Box
          bg="bauhaus.white"
          border="2px solid"
          borderColor="bauhaus.black"
          boxShadow="3px 3px 0px 0px #121212"
          position="relative"
        >
          {/* Corner decoration */}
          <Box
            position="absolute"
            top="-2px"
            right="-2px"
            w="8px"
            h="8px"
            bg="bauhaus.blue"
            border="1.5px solid"
            borderColor="bauhaus.black"
          />

          <VStack spacing={0} divider={<Box h="1px" bg="gray.300" w="full" />}>
            {/* Origin */}
            <HStack w="full" py={2} px={3} justify="space-between">
              <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                Origin
              </Text>
              <HStack spacing={1.5}>
                <Box
                  bg="gray.100"
                  border="1.5px solid"
                  borderColor="gray.300"
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
                    fallback={<Box boxSize="14px" bg="gray.300" borderRadius="sm" />}
                  />
                </Box>
                <Text fontSize="xs" fontWeight="700" color="text.primary">
                  {new URL(origin).hostname}
                </Text>
              </HStack>
            </HStack>

            {/* From */}
            {signerAddress && (
              <HStack w="full" py={2} px={3} justify="space-between">
                <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                  From
                </Text>
                <FromAccountDisplay address={signerAddress} />
              </HStack>
            )}

            {/* Network */}
            <HStack w="full" py={2} px={3} justify="space-between">
              <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                Network
              </Text>
              {(() => {
                const config = getChainConfig(signature.chainId);
                return (
                  <Badge
                    fontSize="xs"
                    bg={config.bg}
                    color={config.text}
                    border="1.5px solid"
                    borderColor="bauhaus.black"
                    fontWeight="700"
                    px={2}
                    py={0.5}
                    display="flex"
                    alignItems="center"
                    gap={1}
                  >
                    {config.icon && (
                      <Image src={config.icon} alt={chainName} boxSize="12px" />
                    )}
                    {chainName}
                  </Badge>
                );
              })()}
            </HStack>

            {/* Method */}
            <HStack w="full" py={2} px={3} justify="space-between">
              <Text fontSize="xs" color="text.secondary" fontWeight="700" textTransform="uppercase">
                Method
              </Text>
              <Code
                px={1.5}
                py={0.5}
                fontSize="xs"
                bg="bauhaus.white"
                color="text.primary"
                fontFamily="mono"
                border="1.5px solid"
                borderColor="bauhaus.black"
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

        {/* Pinned bottom section — sticky so buttons are always reachable */}
        <Box
          position="sticky"
          bottom={-3}
          bg="bg.base"
          pt={1}
          pb={3}
          mx={-3}
          px={3}
          zIndex={1}
        >
          {/* Impersonator Info Box */}
          {accountType === "impersonator" && (
            <Box
              bg="bauhaus.yellow"
              border="3px solid"
              borderColor="bauhaus.black"
              boxShadow="3px 3px 0px 0px #121212"
              p={3}
              mb={2}
            >
              <Text fontSize="sm" color="bauhaus.black" fontWeight="700">
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
                flex={1}
                onClick={handleConfirm}
                isLoading={isSubmitting}
                loadingText="Signing..."
                bg="bauhaus.yellow"
                color="bauhaus.black"
                border="3px solid"
                borderColor="bauhaus.black"
                boxShadow="4px 4px 0px 0px #121212"
                fontWeight="700"
                _hover={{
                  bg: "bauhaus.yellow",
                  transform: "translateY(-2px)",
                  boxShadow: "6px 6px 0px 0px #121212",
                }}
                _active={{
                  transform: "translate(2px, 2px)",
                  boxShadow: "none",
                }}
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
