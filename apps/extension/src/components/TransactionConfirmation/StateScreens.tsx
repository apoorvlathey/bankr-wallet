import { keyframes } from "@emotion/react";
import { Box, Icon, Text, usePrefersReducedMotion } from "@chakra-ui/react";
import ForceInclusionProgress from "@/components/ForceInclusionProgress";
import { isDarkThemeId, useTheme } from "@/theme";
import type { ForceInclusionInfo } from "./types";

const scaleIn = keyframes`
  0% { transform: scale(0) rotate(-10deg); opacity: 0; }
  50% { transform: scale(1.1) rotate(5deg); }
  100% { transform: scale(1) rotate(0deg); opacity: 1; }
`;

const checkmarkDraw = keyframes`
  0% { stroke-dashoffset: 50; }
  100% { stroke-dashoffset: 0; }
`;

interface ForceInclusionScreenProps {
  txId: string;
  l2ChainId: number;
  info: ForceInclusionInfo;
  onComplete: () => void;
  onError: (error: string) => void;
}

export function ForceInclusionScreen({
  txId,
  l2ChainId,
  info,
  onComplete,
  onError,
}: ForceInclusionScreenProps) {
  return (
    <Box h="100%" overflowY="auto" bg="surface.base">
      <ForceInclusionProgress
        txId={txId}
        l1ChainId={info.l1ChainId}
        l2ChainId={l2ChainId}
        onComplete={onComplete}
        onError={onError}
      />
    </Box>
  );
}

export function TransactionSentScreen() {
  const { themeId, tokens } = useTheme();
  const isDarkTheme = isDarkThemeId(themeId);
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <Box
      h="100vh"
      bg="surface.base"
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      p={8}
      position="relative"
    >
      {!isDarkTheme && (
        <>
          <Box
            position="absolute"
            top={6}
            left={6}
            w="16px"
            h="16px"
            bg="accent.primary"
            border="2px solid"
            borderColor="border.default"
          />
          <Box
            position="absolute"
            top={6}
            right={6}
            w="16px"
            h="16px"
            bg="accent.secondary"
            borderRadius="full"
            border="2px solid"
            borderColor="border.default"
          />
          <Box
            position="absolute"
            bottom={6}
            left={6}
            w="0"
            h="0"
            borderLeft="8px solid transparent"
            borderRight="8px solid transparent"
            borderBottom="16px solid"
            borderBottomColor="accent.highlight"
          />
        </>
      )}

      <Box
        w="100px"
        h="100px"
        bg="accent.highlight"
        border={tokens.borders.thick}
        borderColor="border.default"
        borderRadius="lg"
        boxShadow="modal"
        display="flex"
        alignItems="center"
        justifyContent="center"
        animation={prefersReducedMotion ? undefined : `${scaleIn} 0.4s ease-out`}
        mb={6}
      >
        <Icon viewBox="0 0 24 24" w="50px" h="50px" color="accentFg.highlight">
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="square"
            strokeLinejoin="miter"
            d="M5 13l4 4L19 7"
            style={{
              strokeDasharray: 50,
              strokeDashoffset: 0,
              animation: prefersReducedMotion
                ? undefined
                : `${checkmarkDraw} 0.4s ease-out 0.2s backwards`,
            }}
          />
        </Icon>
      </Box>
      <Text
        fontSize="2xl"
        fontWeight={isDarkTheme ? "700" : "900"}
        color="text.primary"
        mb={2}
        textTransform={isDarkTheme ? "none" : "uppercase"}
        letterSpacing="tight"
      >
        Transaction Sent
      </Text>
      <Text
        fontSize="sm"
        color="text.secondary"
        textAlign="center"
        fontWeight="500"
      >
        Your transaction has been submitted
      </Text>
    </Box>
  );
}
