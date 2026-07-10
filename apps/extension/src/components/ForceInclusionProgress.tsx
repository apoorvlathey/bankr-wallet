/**
 * Progress display for force inclusion (L1 deposit) transactions.
 * Listens to fiProgress:{txId} storage key for stage updates.
 */

import { useState, useEffect, useRef, memo } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Spinner,
  IconButton,
  usePrefersReducedMotion,
} from "@chakra-ui/react";
import { ExternalLinkIcon, CheckIcon } from "@chakra-ui/icons";
import { getChainConfig } from "@/constants/chainConfig";
import type {
  ForceInclusionProgressData,
  ForceInclusionStage,
} from "@/chrome/forceInclusion";

interface ForceInclusionProgressProps {
  txId: string;
  l1ChainId: number;
  l2ChainId: number;
  onComplete: () => void;
  onError: (error: string) => void;
}

const STAGES: { key: ForceInclusionStage; label: string }[] = [
  { key: "building", label: "Building deposit transaction" },
  { key: "submitting", label: "Submitting to L1" },
  { key: "waiting-l1", label: "Waiting for L1 confirmation" },
  { key: "complete", label: "Force inclusion complete" },
];

function stageIndex(stage: ForceInclusionStage): number {
  if (stage === "error") return -1;
  return STAGES.findIndex((s) => s.key === stage);
}

function ForceInclusionProgress({
  txId,
  l1ChainId,
  l2ChainId,
  onComplete,
  onError,
}: ForceInclusionProgressProps) {
  const [progress, setProgress] = useState<ForceInclusionProgressData | null>(
    null,
  );
  const [elapsed, setElapsed] = useState(0);
  const completeFired = useRef(false);
  const prefersReducedMotion = usePrefersReducedMotion();

  const l1Config = getChainConfig(l1ChainId);
  const l2Config = getChainConfig(l2ChainId);

  // Listen for progress updates
  useEffect(() => {
    const key = `fiProgress:${txId}`;

    // Initial read
    chrome.storage.local.get(key, (result) => {
      if (result[key]) setProgress(result[key]);
    });

    // Listen for changes
    const listener = (
      changes: { [k: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area === "local" && changes[key]?.newValue) {
        setProgress(changes[key].newValue);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [txId]);

  // Elapsed time counter during waiting-l1
  useEffect(() => {
    if (progress?.stage !== "waiting-l1") {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [progress?.stage]);

  // Fire callbacks
  useEffect(() => {
    if (!progress) return;
    if (progress.stage === "complete" && !completeFired.current) {
      completeFired.current = true;
      // Small delay so user can see the complete state
      setTimeout(() => onComplete(), 1500);
    }
    if (progress.stage === "error" && progress.error) {
      onError(progress.error);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress?.stage, progress?.error]);

  const currentIdx = progress ? stageIndex(progress.stage) : 0;
  const isError = progress?.stage === "error";

  return (
    <VStack spacing={3} align="stretch" p={3}>
      <Box px={1}>
        <Text fontWeight="600" fontSize="md" color="fg.primary">
          Force inclusion in progress
        </Text>
        <Text mt={0.5} fontSize="xs" color="fg.secondary">
          Sending the transaction through Ethereum L1 for guaranteed inclusion.
        </Text>
      </Box>

      {/* Steps */}
      <Box
        bg="surface.raised"
        borderWidth="1px"
        borderColor="border.default"
        borderRadius="lg"
        p={3}
      >
        <VStack spacing={3} align="stretch">
          {STAGES.map((stage, idx) => {
            const isActive = idx === currentIdx;
            const isDone = idx < currentIdx || progress?.stage === "complete";
            const isPending = idx > currentIdx;

            return (
              <HStack key={stage.key} spacing={3} align="flex-start">
                {/* Step indicator */}
                <Box
                  w="24px"
                  h="24px"
                  flexShrink={0}
                  borderWidth="1px"
                  borderColor="border.default"
                  borderRadius="full"
                  bg={
                    isDone
                      ? "accent.highlight"
                      : isActive
                        ? "accent.secondary"
                        : "surface.raisedHover"
                  }
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  {isDone ? (
                    <CheckIcon boxSize={3} color="accentFg.highlight" />
                  ) : isActive && !isError && !prefersReducedMotion ? (
                    <Spinner size="xs" color="accentFg.secondary" />
                  ) : isActive && !isError ? (
                    <Box boxSize="6px" borderRadius="full" bg="accentFg.secondary" />
                  ) : (
                    <Text
                      fontSize="xs"
                      fontWeight="600"
                      color={isPending ? "fg.muted" : "accentFg.secondary"}
                    >
                      {idx + 1}
                    </Text>
                  )}
                </Box>

                {/* Step content */}
                <VStack spacing={0.5} align="flex-start" flex={1} minW={0}>
                  <Text
                    fontSize="xs"
                    fontWeight="600"
                    color={
                      isPending ? "text.tertiary" : "text.primary"
                    }
                  >
                    {stage.label}
                  </Text>

                  {/* L1 tx hash */}
                  {stage.key === "waiting-l1" &&
                    progress?.l1Hash &&
                    currentIdx >= idx && (
                      <HStack spacing={1}>
                        <Text
                          fontSize="2xs"
                          fontFamily="mono"
                          color="text.secondary"
                        >
                          {progress.l1Hash.slice(0, 10)}...
                          {progress.l1Hash.slice(-8)}
                        </Text>
                        {l1Config.explorer && (
                          <IconButton
                            aria-label="View on explorer"
                            icon={<ExternalLinkIcon boxSize="10px" />}
                            size="xs"
                            variant="ghost"
                            minW="18px"
                            h="18px"
                            color="text.tertiary"
                            onClick={() =>
                              window.open(
                                `${l1Config.explorer}/tx/${progress.l1Hash}`,
                                "_blank",
                              )
                            }
                            _hover={{
                              color: "accent.secondary",
                              bg: "bg.muted",
                            }}
                          />
                        )}
                      </HStack>
                    )}

                  {/* Elapsed time during waiting */}
                  {stage.key === "waiting-l1" && isActive && elapsed > 0 && (
                    <Text fontSize="2xs" color="text.tertiary">
                      {elapsed}s elapsed
                    </Text>
                  )}

                  {/* L2 hash on complete */}
                  {stage.key === "complete" && progress?.l2Hash && isDone && (
                    <HStack spacing={1}>
                      <Text
                        fontSize="2xs"
                        fontFamily="mono"
                        color="text.secondary"
                      >
                        L2: {progress.l2Hash.slice(0, 10)}...
                        {progress.l2Hash.slice(-8)}
                      </Text>
                      {l2Config.explorer && (
                        <IconButton
                          aria-label="View on L2 explorer"
                          icon={<ExternalLinkIcon boxSize="10px" />}
                          size="xs"
                          variant="ghost"
                          minW="18px"
                          h="18px"
                          color="text.tertiary"
                          onClick={() =>
                            window.open(
                              `${l2Config.explorer}/tx/${progress.l2Hash}`,
                              "_blank",
                            )
                          }
                          _hover={{
                            color: "accent.secondary",
                            bg: "bg.muted",
                          }}
                        />
                      )}
                    </HStack>
                  )}
                </VStack>
              </HStack>
            );
          })}
        </VStack>
      </Box>

      {/* Error display */}
      {isError && progress?.error && (
        <Box
          bg="status.error.bg"
          borderWidth="1px"
          borderColor="status.error.border"
          borderRadius="lg"
          p={3}
        >
          <Text color="status.error.fg" fontSize="sm" fontWeight="700">
            {progress.error}
          </Text>
        </Box>
      )}

      {/* Info text */}
      {!isError && progress?.stage !== "complete" && (
        <Box
          bg="status.info.bg"
          borderWidth="1px"
          borderColor="status.info.border"
          borderRadius="lg"
          px={3}
          py={2}
        >
          <Text
            fontSize="2xs"
            color="status.info.fg"
            fontWeight="500"
          >
            Your transaction is being submitted via L1 deposit. The L2 is
            required to include it within ~10 minutes.
          </Text>
        </Box>
      )}
    </VStack>
  );
}

export default memo(ForceInclusionProgress);
