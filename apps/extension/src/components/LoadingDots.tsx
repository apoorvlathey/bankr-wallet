import { Box, HStack } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";

const dotBounce = keyframes`
  0%, 80%, 100% { transform: translateY(0); opacity: 0.35; }
  40% { transform: translateY(-4px); opacity: 1; }
`;

/** Three bouncing dots used wherever we render an inline "pending /
 *  awaiting" placeholder (quote loaders, bridge destination tx hash, etc.). */
export default function LoadingDots() {
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
          animation={`${dotBounce} 1.1s ease-in-out infinite`}
          style={{ animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </HStack>
  );
}
