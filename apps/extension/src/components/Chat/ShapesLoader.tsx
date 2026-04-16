import { Box, HStack } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { useIsDarkTheme } from "@/theme";

interface ShapesLoaderProps {
  size?: string;
}

/**
 * Bauhaus loader: three colored shapes (red circle, blue square, green
 * triangle) bounce in sequence. Reads as the constructivist mark on every
 * pending message bubble.
 */
function BauhausShapesLoader({ size }: { size: string }) {
  const sizeNum = parseInt(size);
  const bounceDistance = Math.round(sizeNum * 0.67);

  const bounce = keyframes`
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-${bounceDistance}px);
    }
  `;

  return (
    <HStack spacing={1} justify="center">
      {/* Circle - Red */}
      <Box
        animation={`${bounce} 0.6s ease-in-out infinite`}
        sx={{ animationDelay: "0ms" }}
      >
        <Box w={size} h={size} borderRadius="full" bg="accent.primary" />
      </Box>
      {/* Square - Blue */}
      <Box
        animation={`${bounce} 0.6s ease-in-out infinite`}
        sx={{ animationDelay: "150ms" }}
      >
        <Box
          w={size}
          h={size}
          bg="accent.secondary"
          transform="rotate(45deg)"
        />
      </Box>
      {/* Triangle - Green */}
      <Box
        animation={`${bounce} 0.6s ease-in-out infinite`}
        sx={{ animationDelay: "300ms" }}
      >
        <Box
          w={0}
          h={0}
          borderLeft={`${sizeNum / 2}px solid transparent`}
          borderRight={`${sizeNum / 2}px solid transparent`}
          borderBottom={`${Math.round(sizeNum * 0.866)}px solid`}
          borderBottomColor="chart.positive"
        />
      </Box>
    </HStack>
  );
}

/**
 * Midnight loader: three identical iridescent dots fade in/out in sequence.
 * Restrained pulse instead of Bauhaus's bouncing geometric shapes — fits the
 * dark mode aesthetic where the loader should sit quietly while the model
 * thinks rather than dance.
 */
function MidnightDotPulseLoader({ size }: { size: string }) {
  const pulse = keyframes`
    0%, 80%, 100% {
      opacity: 0.25;
      transform: scale(0.9);
    }
    40% {
      opacity: 1;
      transform: scale(1);
    }
  `;

  return (
    <HStack spacing={1.5} justify="center">
      {[0, 1, 2].map((i) => (
        <Box
          key={i}
          w={size}
          h={size}
          borderRadius="full"
          bg="accent.primary"
          animation={`${pulse} 1.2s ease-in-out infinite`}
          sx={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </HStack>
  );
}

export function ShapesLoader({ size = "10px" }: ShapesLoaderProps) {
  const isDarkTheme = useIsDarkTheme();

  return isDarkTheme ? (
    <MidnightDotPulseLoader size={size} />
  ) : (
    <BauhausShapesLoader size={size} />
  );
}

export default ShapesLoader;
