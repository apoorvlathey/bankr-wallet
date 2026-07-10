import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Grid,
  HStack,
  IconButton,
  Spinner,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ChevronLeftIcon, ChevronRightIcon } from "@chakra-ui/icons";

import type { PendingErc7715PermissionRequest } from "@/chrome/pendingErc7715PermissionStorage";
import { Erc7715PermissionReview } from "@/components/Erc7715PermissionReview";
import { ConfirmationScreen } from "@/components/ui";
import { useThemedToast } from "@/hooks/useThemedToast";

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

function PermissionQueueNavigation({
  currentIndex,
  totalCount,
  onNavigate,
}: Pick<
  Erc7715PermissionConfirmationProps,
  "currentIndex" | "totalCount" | "onNavigate"
>) {
  if (totalCount <= 1) return null;

  return (
    <HStack spacing={1} aria-label="Permission request queue">
      <IconButton
        aria-label="Previous request"
        icon={<ChevronLeftIcon />}
        size="sm"
        variant="ghost"
        onClick={() => onNavigate("prev")}
      />
      <Text
        minW="34px"
        textAlign="center"
        fontSize="xs"
        fontWeight="600"
        color="fg.secondary"
        sx={{ fontVariantNumeric: "tabular-nums" }}
      >
        {currentIndex + 1}/{totalCount}
      </Text>
      <IconButton
        aria-label="Next request"
        icon={<ChevronRightIcon />}
        size="sm"
        variant="ghost"
        onClick={() => onNavigate("next")}
      />
    </HStack>
  );
}

export default function Erc7715PermissionConfirmation({
  permissionRequest,
  currentIndex,
  totalCount,
  accountType,
  onBack,
  onConfirmed,
  onCancelled,
  onCancelAll,
  onBeforeCancel,
  onNavigate,
}: Erc7715PermissionConfirmationProps) {
  const toast = useThemedToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [editedRequest, setEditedRequest] = useState(permissionRequest.request);
  const [draftError, setDraftError] = useState<string | null>(null);
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

  const actions = isLocalSigner ? (
    <VStack align="stretch" spacing={2} w="full">
      <Grid templateColumns="repeat(2, minmax(0, 1fr))" gap={3}>
        <Button
          variant="secondary"
          onClick={handleCancel}
          isDisabled={isSubmitting}
          isLoading={isRejecting}
          spinner={<Spinner size="sm" sx={{ animationDirection: "reverse" }} />}
        >
          Reject
        </Button>
        <Button
          variant="primary"
          onClick={handleConfirm}
          isDisabled={isRejecting || Boolean(draftError)}
          isLoading={isSubmitting}
          loadingText="Granting..."
        >
          Grant permission
        </Button>
      </Grid>
      {totalCount > 1 && (
        <Button variant="ghost" size="sm" onClick={onCancelAll}>
          Reject all {totalCount} requests
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
  );

  return (
    <Box
      h="100%"
      minH={0}
      bg="surface.base"
    >
      <Erc7715PermissionReview
        permissionRequest={permissionRequest}
        editedRequest={editedRequest}
        validationError={draftError}
        onEditedRequestChange={setEditedRequest}
        onValidationErrorChange={setDraftError}
      >
        {({ outcome, financialImpact, context, advancedDetails }) => (
          <ConfirmationScreen
            title="Permission"
            onBack={onBack}
            backLabel="Back from permission request"
            trailing={
              <PermissionQueueNavigation
                currentIndex={currentIndex}
                totalCount={totalCount}
                onNavigate={onNavigate}
              />
            }
            outcome={outcome}
            financialImpact={financialImpact}
            financialImpactTitle="Permission limits"
            context={context}
            contextTitle="Who can use this permission"
            advancedDetails={advancedDetails}
            advancedLabel="Technical permission details"
            confirmAction={actions}
          />
        )}
      </Erc7715PermissionReview>
    </Box>
  );
}
