import { Box, HStack, usePrefersReducedMotion } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { isDarkThemeId, useTheme } from "@/theme";

interface ShapesLoaderProps {
  size?: string;
}

/**
 * Bauhaus loader: three colored shapes pulse in sequence. It keeps the
 * constructivist identity without drawing attention away from live tool text.
 */
function BauhausShapesLoader({
  size,
  reduceMotion,
}: {
  size: string;
  reduceMotion: boolean;
}) {
  const sizeNum = parseInt(size);

  const pulse = keyframes`
    0%, 100% {
      opacity: 0.35;
    }
    50% {
      opacity: 1;
    }
  `;

  return (
    <HStack spacing={1} justify="center">
      {/* Circle - Red */}
      <Box
        animation={reduceMotion ? undefined : `${pulse} 1s ease-in-out infinite`}
        sx={{ animationDelay: "0ms" }}
      >
        <Box w={size} h={size} borderRadius="full" bg="accent.primary" />
      </Box>
      {/* Square - Blue */}
      <Box
        animation={reduceMotion ? undefined : `${pulse} 1s ease-in-out infinite`}
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
        animation={reduceMotion ? undefined : `${pulse} 1s ease-in-out infinite`}
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
function MidnightDotPulseLoader({
  size,
  reduceMotion,
}: {
  size: string;
  reduceMotion: boolean;
}) {
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
          animation={reduceMotion ? undefined : `${pulse} 1.2s ease-in-out infinite`}
          sx={{ animationDelay: `${i * 160}ms` }}
        />
      ))}
    </HStack>
  );
}

export function ShapesLoader({ size = "10px" }: ShapesLoaderProps) {
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const prefersReducedMotion = usePrefersReducedMotion();

  return isDarkTheme ? (
    <MidnightDotPulseLoader size={size} reduceMotion={prefersReducedMotion} />
  ) : (
    <BauhausShapesLoader size={size} reduceMotion={prefersReducedMotion} />
  );
}

export default ShapesLoader;
