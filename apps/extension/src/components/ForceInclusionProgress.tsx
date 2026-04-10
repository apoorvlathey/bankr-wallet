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
      {/* Title */}
      <Box
        bg="bauhaus.blue"
        border="3px solid"
        borderColor="bauhaus.black"
        boxShadow="3px 3px 0px 0px #121212"
        py={1.5}
        px={3}
      >
        <Text
          fontWeight="900"
          fontSize="sm"
          color="white"
          textAlign="center"
          textTransform="uppercase"
          letterSpacing="wider"
        >
          Force Inclusion in Progress
        </Text>
      </Box>

      {/* Steps */}
      <Box
        bg="bauhaus.white"
        border="2px solid"
        borderColor="bauhaus.black"
        boxShadow="2px 2px 0px 0px #121212"
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
                  border="2px solid"
                  borderColor="bauhaus.black"
                  bg={
                    isDone
                      ? "bauhaus.yellow"
                      : isActive
                        ? "bauhaus.blue"
                        : "gray.100"
                  }
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  {isDone ? (
                    <CheckIcon boxSize={3} color="bauhaus.black" />
                  ) : isActive && !isError ? (
                    <Spinner size="xs" color="white" />
                  ) : (
                    <Text
                      fontSize="xs"
                      fontWeight="900"
                      color={isPending ? "gray.400" : "white"}
                    >
                      {idx + 1}
                    </Text>
                  )}
                </Box>

                {/* Step content */}
                <VStack spacing={0.5} align="flex-start" flex={1} minW={0}>
                  <Text
                    fontSize="xs"
                    fontWeight="700"
                    color={
                      isPending ? "text.tertiary" : "text.primary"
                    }
                    textTransform="uppercase"
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
                              color: "bauhaus.blue",
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
                            color: "bauhaus.blue",
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
          bg="bauhaus.red"
          border="3px solid"
          borderColor="bauhaus.black"
          boxShadow="3px 3px 0px 0px #121212"
          p={3}
        >
          <Text color="white" fontSize="sm" fontWeight="700">
            {progress.error}
          </Text>
        </Box>
      )}

      {/* Info text */}
      {!isError && progress?.stage !== "complete" && (
        <Box
          border="2px solid"
          borderColor="bauhaus.black"
          px={3}
          py={2}
        >
          <Text
            fontSize="2xs"
            color="text.secondary"
            fontWeight="600"
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
