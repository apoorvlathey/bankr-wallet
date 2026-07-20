import { Box, HStack, usePrefersReducedMotion } from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { MidnightDotPulseLoader } from "@/components/MidnightDotPulseLoader";
import { isDarkThemeId, useTheme } from "@/theme";

interface ShapesLoaderProps {
  color?: string;
  size?: string;
  variant?: "adaptive" | "dots";
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

export function ShapesLoader({
  color,
  size = "10px",
  variant = "adaptive",
}: ShapesLoaderProps) {
  const { themeId } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const prefersReducedMotion = usePrefersReducedMotion();

  if (variant === "dots") {
    return (
      <Box color={color ?? "currentColor"} display="flex">
        <MidnightDotPulseLoader size={size} />
      </Box>
    );
  }

  return isDarkTheme ? (
    <Box color="accent.primary" display="flex">
      <MidnightDotPulseLoader size={size} />
    </Box>
  ) : (
    <BauhausShapesLoader size={size} reduceMotion={prefersReducedMotion} />
  );
}

export default ShapesLoader;
