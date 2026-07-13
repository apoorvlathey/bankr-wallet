import { Box, Icon, Text, usePrefersReducedMotion } from "@chakra-ui/react";
import ForceInclusionProgress from "@/components/ForceInclusionProgress";
import type { ThemeTokens } from "@/theme";
import type { ForceInclusionInfo } from "./types";
import { checkmarkDraw, scaleIn } from "./animations";

interface ForceInclusionStateProps {
  txId: string;
  chainId: number;
  info: ForceInclusionInfo;
  isInSidePanel: boolean;
  onConfirmed: () => void;
  onSent: () => void;
  onError: () => void;
}

export function ForceInclusionState({
  txId,
  chainId,
  info,
  isInSidePanel,
  onConfirmed,
  onSent,
  onError,
}: ForceInclusionStateProps) {
  return (
    <Box h="100%" overflowY="auto" bg="surface.base">
      <ForceInclusionProgress
        txId={txId}
        l1ChainId={info.l1ChainId}
        l2ChainId={chainId}
        onComplete={() => {
          if (isInSidePanel) onConfirmed();
          else {
            onSent();
            setTimeout(() => window.close(), 1500);
          }
        }}
        onError={onError}
      />
    </Box>
  );
}

interface SentStateProps {
  isDarkTheme: boolean;
  borders: ThemeTokens["borders"];
}

export function SentState({ isDarkTheme, borders }: SentStateProps) {
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
        </>
      )}
      <Box
        w="100px"
        h="100px"
        bg="accent.highlight"
        border={borders.thick}
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
        Batch Sent
      </Text>
      <Text fontSize="sm" color="text.secondary" textAlign="center" fontWeight="500">
        Your batch transaction has been submitted
      </Text>
    </Box>
  );
}
