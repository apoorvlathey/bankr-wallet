import {
  Box,
  usePrefersReducedMotion,
} from "@chakra-ui/react";
import {
  useEffect,
  useState,
  type ReactNode,
} from "react";
import InitialRequestLoadingScreen from "@/app/screens/InitialRequestLoadingScreen";

const REQUEST_BOOTSTRAP_TRANSITION_MS = 140;
const REQUEST_BOOTSTRAP_EASING = "cubic-bezier(0.2, 0.6, 0.2, 1)";

interface AppBootstrapTransitionProps {
  isLoading: boolean;
  showRequestSkeleton: boolean;
  children?: ReactNode;
}

/** Crossfades the approval skeleton into the resolved request without a blank frame. */
export default function AppBootstrapTransition({
  isLoading,
  showRequestSkeleton,
  children,
}: AppBootstrapTransitionProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const duration = prefersReducedMotion ? 0 : REQUEST_BOOTSTRAP_TRANSITION_MS;
  const transition = `opacity ${duration}ms ${REQUEST_BOOTSTRAP_EASING}`;
  const [isSkeletonMounted, setIsSkeletonMounted] = useState(
    showRequestSkeleton,
  );

  useEffect(() => {
    if (showRequestSkeleton && isLoading) {
      setIsSkeletonMounted(true);
      return;
    }
    if (isLoading || !isSkeletonMounted) return;

    const timeout = window.setTimeout(
      () => setIsSkeletonMounted(false),
      duration,
    );
    return () => window.clearTimeout(timeout);
  }, [duration, isLoading, isSkeletonMounted, showRequestSkeleton]);

  const isRequestTransition = showRequestSkeleton || isSkeletonMounted;

  return (
    <Box position="relative" w="full" h="100%" bg="surface.base">
      <Box
        w="full"
        h="100%"
        opacity={isRequestTransition && isLoading ? 0 : 1}
        transition={isRequestTransition ? transition : undefined}
      >
        {children}
      </Box>

      {!showRequestSkeleton && isLoading && (
        <Box position="absolute" inset={0} bg="surface.base" />
      )}

      {isSkeletonMounted && (
        <Box
          position="absolute"
          inset={0}
          zIndex={2}
          opacity={isLoading ? 1 : 0}
          transition={transition}
          pointerEvents={isLoading ? "auto" : "none"}
          aria-hidden={isLoading ? undefined : true}
        >
          <InitialRequestLoadingScreen />
        </Box>
      )}
    </Box>
  );
}
