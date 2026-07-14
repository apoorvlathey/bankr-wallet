import { Suspense } from "react";
import { Box, Spinner } from "@chakra-ui/react";

import { CrossDappBatchConfirmation } from "@/app/lazyScreens";
import type { CrossDappBatch } from "@/chrome/crossDappBatch/storage";

type CrossDappBatchRequestScreenProps = {
  batch: CrossDappBatch;
  currentIndex: number;
  totalCount: number;
  isInSidePanel: boolean;
  isFullscreenTab: boolean;
  onBack: () => void;
  onConfirmed: () => void;
  onRejected: () => void;
  onRejectAll: () => void;
  onBeforeReject: () => void;
  onNavigate: (direction: "prev" | "next") => void;
};

const LoadingFallback = () => (
  <Box
    minH="200px"
    display="flex"
    alignItems="center"
    justifyContent="center"
    bg="bg.base"
  >
    <Spinner size="lg" color="accent.secondary" thickness="3px" />
  </Box>
);

export default function CrossDappBatchRequestScreen({
  batch,
  currentIndex,
  totalCount,
  isInSidePanel,
  isFullscreenTab,
  onBack,
  onConfirmed,
  onRejected,
  onRejectAll,
  onBeforeReject,
  onNavigate,
}: CrossDappBatchRequestScreenProps) {
  return (
    <Box
      bg="status.warning.tint"
      h="100%"
      display="flex"
      flexDirection="column"
    >
      <Box
        h="6px"
        w="100%"
        bg="accent.highlight"
        borderBottom="2px solid"
        borderColor="border.default"
        flexShrink={0}
      />
      <Box
        maxW={isFullscreenTab ? "480px" : "100%"}
        mx="auto"
        w="100%"
        h="100%"
        display="flex"
        flexDirection="column"
      >
        <Suspense fallback={<LoadingFallback />}>
          <CrossDappBatchConfirmation
            batch={batch}
            currentIndex={currentIndex}
            totalCount={totalCount}
            isInSidePanel={isInSidePanel || isFullscreenTab}
            onBack={onBack}
            onConfirmed={onConfirmed}
            onRejected={onRejected}
            onRejectAll={onRejectAll}
            onBeforeReject={onBeforeReject}
            onNavigate={onNavigate}
          />
        </Suspense>
      </Box>
    </Box>
  );
}
