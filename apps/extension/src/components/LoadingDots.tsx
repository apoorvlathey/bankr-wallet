import { Box, HStack, usePrefersReducedMotion } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";

const dotBounce = keyframes`
  0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
  40% { transform: translateY(-4px); opacity: 1; }
`;

/** Three bouncing dots used wherever we render an inline "pending /
 *  awaiting" placeholder (quote loaders, bridge destination tx hash, etc.). */
export default function LoadingDots() {
  const prefersReducedMotion = usePrefersReducedMotion();
  return (
    <HStack spacing="3px" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          as="span"
          display="inline-block"
          w="4px"
          h="4px"
          borderRadius="full"
          bg="text.tertiary"
          animation={prefersReducedMotion ? undefined : `${dotBounce} 1.1s ease-in-out infinite`}
          opacity={prefersReducedMotion ? 0.7 : undefined}
          style={prefersReducedMotion ? undefined : { animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </HStack>
  );
}
