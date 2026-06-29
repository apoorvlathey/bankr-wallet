import { useEffect, useState } from "react";
import {
  Box,
  Button,
  HStack,
  IconButton,
  Image,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ChevronLeftIcon, ChevronRightIcon } from "@chakra-ui/icons";

import type { PendingErc7715PermissionRequest } from "@/chrome/pendingErc7715PermissionStorage";
import { Erc7715PermissionReview } from "@/components/Erc7715PermissionReview";
import { useThemedToast } from "@/hooks/useThemedToast";
import { displayPermissionOrigin } from "@/lib/erc7715PermissionDisplay";
import { useTheme } from "@/theme";

interface Erc7715PermissionConfirmationProps {
  permissionRequest: PendingErc7715PermissionRequest;
  currentIndex: number;
  totalCount: number;
  isInSidePanel: boolean;
  accountType?: "bankr" | "privateKey" | "seedPhrase" | "impersonator";
  onBack: () => void;
  onConfirmed: () => void;
  onCancelled: () => void;
  onCancelAll: () => void;
  onBeforeCancel?: () => void;
  onNavigate: (direction: "prev" | "next") => void;
}

export default function Erc7715PermissionConfirmation({
  permissionRequest,
  currentIndex,
  totalCount,
  isInSidePanel,
  accountType,
  onBack,
  onConfirmed,
  onCancelled,
  onCancelAll,
  onBeforeCancel,
  onNavigate,
}: Erc7715PermissionConfirmationProps) {
  const { tokens } = useTheme();
  const toast = useThemedToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [editedRequest, setEditedRequest] = useState(permissionRequest.request);
  const [draftError, setDraftError] = useState<string | null>(null);
  const displayOrigin = displayPermissionOrigin(permissionRequest);
  const isLocalSigner =
    accountType === "privateKey" || accountType === "seedPhrase";

  useEffect(() => {
    setEditedRequest(permissionRequest.request);
    setDraftError(null);
  }, [permissionRequest]);

  const handleCancel = () => {
    if (isRejecting) return;
    setIsRejecting(true);
    onBeforeCancel?.();
    chrome.runtime.sendMessage(
      {
        type: "rejectErc7715PermissionRequest",
        requestId: permissionRequest.id,
      },
      () => {
        onCancelled();
      },
    );
  };

  const handleConfirm = async () => {
    if (!isLocalSigner || draftError) return;
    setIsSubmitting(true);

    const result = await new Promise<{
      success: boolean;
      error?: string;
    }>((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "confirmErc7715PermissionRequest",
          requestId: permissionRequest.id,
          password: "",
          editedRequest,
        },
        resolve,
      );
    });

    setIsSubmitting(false);
    if (result?.success) {
      toast({
        title: "Permission granted",
        status: "success",
        duration: 2000,
      });
      onConfirmed();
      return;
    }

    toast({
      title: "Grant failed",
      description: result?.error || "Failed to grant permission",
      status: "error",
      duration: 3000,
    });
    onCancelled();
  };

  return (
    <Box
      bg="surface.base"
      minH={isInSidePanel ? "100vh" : "600px"}
      display="flex"
      flexDirection="column"
    >
      <Box p={3} borderBottom={tokens.borders.thick} borderColor="border.default">
        <HStack justify="space-between" spacing={2}>
          <HStack spacing={2} minW={0}>
            <IconButton
              aria-label="Back"
              icon={<ChevronLeftIcon />}
              size="sm"
              variant="ghost"
              onClick={onBack}
            />
            {permissionRequest.favicon && (
              <Image
                src={permissionRequest.favicon}
                alt=""
                w="24px"
                h="24px"
                border={tokens.borders.thin}
                borderColor="border.default"
                borderRadius={tokens.radii.input}
              />
            )}
            <Box minW={0}>
              <Text fontSize="md" fontWeight="900" color="text.primary" noOfLines={1}>
                Delegated Permission
              </Text>
              <Text fontSize="xs" color="text.secondary" fontWeight="700" noOfLines={1}>
                {displayOrigin}
              </Text>
            </Box>
          </HStack>

          {totalCount > 1 && (
            <HStack spacing={1}>
              <IconButton
                aria-label="Previous request"
                icon={<ChevronLeftIcon />}
                size="xs"
                variant="outline"
                onClick={() => onNavigate("prev")}
              />
              <Text fontSize="xs" fontWeight="900" color="text.secondary">
                {currentIndex + 1}/{totalCount}
              </Text>
              <IconButton
                aria-label="Next request"
                icon={<ChevronRightIcon />}
                size="xs"
                variant="outline"
                onClick={() => onNavigate("next")}
              />
            </HStack>
          )}
        </HStack>
      </Box>

      <Box p={3} flex="1" overflowY="auto">
        <Erc7715PermissionReview
          permissionRequest={permissionRequest}
          editedRequest={editedRequest}
          onEditedRequestChange={setEditedRequest}
          onValidationErrorChange={setDraftError}
        />
      </Box>

      <Box
        p={3}
        borderTop={tokens.borders.thick}
        borderColor="border.default"
        bg="surface.base"
      >
        {isLocalSigner ? (
          <VStack align="stretch" spacing={2}>
            {draftError && (
              <Text fontSize="xs" fontWeight="800" color="chart.negative">
                {draftError}
              </Text>
            )}
            <HStack spacing={3}>
              <Button
                variant="secondary"
                flex={1}
                onClick={handleCancel}
                isDisabled={isSubmitting}
                isLoading={isRejecting}
                spinner={<Spinner size="sm" sx={{ animationDirection: "reverse" }} />}
              >
                Reject
              </Button>
              <Button
                variant="highlight"
                flex={1}
                onClick={handleConfirm}
                isDisabled={isRejecting || Boolean(draftError)}
                isLoading={isSubmitting}
                loadingText="Granting..."
              >
                Grant
              </Button>
            </HStack>
            {totalCount > 1 && (
              <Button variant="ghost" size="sm" onClick={onCancelAll}>
                Reject All
              </Button>
            )}
          </VStack>
        ) : (
          <Button
            variant="danger"
            w="full"
            onClick={handleCancel}
            isLoading={isRejecting}
          >
            Reject
          </Button>
        )}
      </Box>
    </Box>
  );
}
