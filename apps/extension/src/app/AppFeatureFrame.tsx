import { Suspense, type ReactNode } from "react";
import { Box } from "@chakra-ui/react";
import LoadingFallback from "./LoadingFallback";

/** Shared full-height frame for lazy first-party wallet feature screens. */
export default function AppFeatureFrame({
  isFullscreenTab,
  children,
}: {
  isFullscreenTab: boolean;
  children: ReactNode;
}) {
  return (
    <Box bg="bg.base" h="100%" display="flex" flexDirection="column">
      <Box
        maxW={isFullscreenTab ? "480px" : "100%"}
        mx="auto"
        w="100%"
        h="100%"
        display="flex"
        flexDirection="column"
      >
        <Suspense fallback={<LoadingFallback />}>{children}</Suspense>
      </Box>
    </Box>
  );
}
