import { useCallback, useEffect, useState } from "react";
import { Box, Button, HStack, Text } from "@chakra-ui/react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { useThemedToast } from "@/hooks/useThemedToast";

type ForceStatus = {
  applicable: boolean;
  state: "waiting" | "eligible" | "submitted" | "forced" | "consumed" | "unavailable";
  eligible: boolean;
};

function sendMessage<T>(message: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response as T);
    });
  });
}

export default function ArbitrumForceInclusionAction({
  isOpen,
  tx,
}: {
  isOpen: boolean;
  tx: CompletedTransaction;
}) {
  const [status, setStatus] = useState<ForceStatus | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const toast = useThemedToast();
  const isArbitrumPending =
    tx.status === "pending" &&
    tx.forceInclusionMeta?.protocol === "arbitrum" &&
    !tx.forceInclusionMeta.l2Confirmed;

  const refresh = useCallback(async () => {
    if (!isOpen || !isArbitrumPending) {
      setStatus(null);
      return;
    }
    try {
      const next = await sendMessage<ForceStatus>({
        type: "getArbitrumForceInclusionStatus",
        txId: tx.id,
      });
      setStatus(next);
    } catch {
      setStatus(null);
    }
  }, [isArbitrumPending, isOpen, tx.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const result = await sendMessage<{ success: boolean; error?: string }>({
        type: "submitArbitrumForceInclusion",
        txId: tx.id,
      });
      if (!result?.success) {
        toast({
          title: "Force inclusion failed",
          description: result.error || "Could not submit the Ethereum transaction",
          status: "error",
        });
      }
      await refresh();
    } catch (error) {
      toast({
        title: "Force inclusion failed",
        description: error instanceof Error ? error.message : "Could not submit the Ethereum transaction",
        status: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (!status || (!status.eligible && status.state !== "submitted" && status.state !== "forced")) {
    return null;
  }

  const submitted = status.state === "submitted" || status.state === "forced";
  return (
    <Box
      bg="surface.raised"
      border="1px solid"
      borderColor="border.default"
      borderRadius="lg"
      px={3}
      py={2.5}
      aria-live="polite"
    >
      <HStack justify="space-between" spacing={3}>
        <Text color="fg.secondary" fontSize="sm" fontWeight="600">
          {submitted ? "Force inclusion submitted on Ethereum." : "Still not included on Arbitrum."}
        </Text>
        {!submitted && (
          <Button
            type="button"
            size="sm"
            variant="primary"
            flexShrink={0}
            isLoading={submitting}
            loadingText="Sending"
            onClick={submit}
          >
            Force inclusion
          </Button>
        )}
      </HStack>
    </Box>
  );
}
