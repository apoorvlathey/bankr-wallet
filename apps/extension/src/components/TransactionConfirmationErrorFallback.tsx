import { useState } from "react";
import {
  Box,
  Button,
  HStack,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { WarningIcon } from "@chakra-ui/icons";

interface TransactionConfirmationErrorFallbackProps {
  txId: string;
  totalCount: number;
  onRejected: () => void;
  onRejectAll: () => void;
  onBeforeReject?: () => void;
}

export default function TransactionConfirmationErrorFallback({
  txId,
  totalCount,
  onRejected,
  onRejectAll,
  onBeforeReject,
}: TransactionConfirmationErrorFallbackProps) {
  const [isRejecting, setIsRejecting] = useState(false);

  const handleReject = () => {
    if (isRejecting) return;
    setIsRejecting(true);
    onBeforeReject?.();
    chrome.runtime.sendMessage({ type: "rejectTransaction", txId }, () => {
      onRejected();
    });
  };

  return (
    <Box h="100%" overflowY="auto" bg="surface.base" p={4}>
      <VStack h="100%" align="stretch" justify="center" spacing={4}>
        <VStack
          align="stretch"
          spacing={3}
          p={4}
          bg="status.error.bg"
          color="status.error.fg"
          borderWidth="2px"
          borderColor="status.error.border"
          borderRadius="lg"
          boxShadow="card"
        >
          <HStack spacing={3} align="flex-start">
            <WarningIcon boxSize={5} flexShrink={0} mt={0.5} />
            <VStack spacing={1} align="stretch">
              <Text
                fontSize="lg"
                fontWeight="900"
                textTransform="uppercase"
                lineHeight="short"
              >
                Unable to display transaction
              </Text>
              <Text fontSize="sm" fontWeight="600" lineHeight="short">
                This request contains malformed data. Reject it and ask the site
                to send the request again.
              </Text>
            </VStack>
          </HStack>
        </VStack>

        <HStack spacing={3}>
          <Button
            variant="secondary"
            flex={1}
            onClick={handleReject}
            isLoading={isRejecting}
            spinner={<Spinner size="sm" sx={{ animationDirection: "reverse" }} />}
          >
            Reject
          </Button>
          {totalCount > 1 && (
            <Button
              variant="secondary"
              flex={1}
              onClick={onRejectAll}
              isDisabled={isRejecting}
            >
              Reject All
            </Button>
          )}
        </HStack>
      </VStack>
    </Box>
  );
}
