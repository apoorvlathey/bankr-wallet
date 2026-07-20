import { Box, HStack, IconButton, Text, VStack } from "@chakra-ui/react";
import { ArrowBackIcon } from "@chakra-ui/icons";
import type { ReactNode } from "react";
import {
  AppHeader,
  AppScreen,
  ScreenBody,
  StickyActionBar,
} from "@/components/ui";

interface SetupFrameProps {
  isOnboarding: boolean;
  title: string;
  onBack: () => void;
  action?: ReactNode;
  actionSummary?: ReactNode;
  children: ReactNode;
}

export function SetupFrame({
  isOnboarding,
  title,
  onBack,
  action,
  actionSummary,
  children,
}: SetupFrameProps) {
  if (isOnboarding) {
    return (
      <VStack spacing={6} w="full" maxW="600px" align="stretch">
        <HStack w="full" justify="space-between" align="center">
          <IconButton
            aria-label="Back"
            icon={<ArrowBackIcon />}
            variant="ghost"
            size="sm"
            onClick={onBack}
          />
          <Text fontWeight="700" fontSize="md" color="fg.primary" flex={1} textAlign="center" mx={2}>
            {title}
          </Text>
          <Box w="32px" flexShrink={0} />
        </HStack>
        {children}
        {actionSummary}
        {action}
      </VStack>
    );
  }

  return (
    <AppScreen>
      <AppHeader title={title} onBack={onBack} />
      <ScreenBody pt={5}>
        <VStack spacing={6} align="stretch">{children}</VStack>
      </ScreenBody>
      {action && (
        <StickyActionBar
          primaryAction={action}
          summary={actionSummary}
          summaryGap={2}
        />
      )}
    </AppScreen>
  );
}
