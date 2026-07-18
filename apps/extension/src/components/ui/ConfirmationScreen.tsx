import { Box, VStack } from "@chakra-ui/react";
import {
  forwardRef,
  type ReactNode,
  type Ref,
} from "react";
import {
  AppScreen,
  ScreenBody,
  ScreenSection,
  type AppScreenProps,
  type ScreenBodyProps,
} from "./AppScreen";
import { AppHeader } from "./AppHeader";
import { StickyActionBar } from "./StickyActionBar";

export interface ConfirmationScreenProps
  extends Omit<AppScreenProps, "children" | "title"> {
  title: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  trailing?: ReactNode;
  headingRef?: Ref<HTMLHeadingElement>;
  bodyRef?: Ref<HTMLDivElement>;
  bodyProps?: ScreenBodyProps;
  navigation?: ReactNode;
  outcome: ReactNode;
  financialImpact?: ReactNode;
  financialImpactTitle?: ReactNode;
  context?: ReactNode;
  contextTitle?: ReactNode;
  contextHeaderAction?: ReactNode;
  advancedDetails?: ReactNode;
  advancedLabel?: string;
  actionSummary?: ReactNode;
  actionNotice?: ReactNode;
  confirmAction: ReactNode;
  rejectAction?: ReactNode;
}

/**
 * Domain-free confirmation composition with a fixed information order:
 * outcome, financial impact, request context, then advanced detail.
 */
export const ConfirmationScreen = forwardRef<
  HTMLDivElement,
  ConfirmationScreenProps
>(function ConfirmationScreen(
  {
    title,
    onBack,
    backLabel,
    trailing,
    headingRef,
    bodyRef,
    bodyProps,
    navigation,
    outcome,
    financialImpact,
    financialImpactTitle = "Financial impact",
    context,
    contextTitle = "Request details",
    contextHeaderAction,
    advancedDetails,
    advancedLabel = "Advanced details",
    actionSummary,
    actionNotice,
    confirmAction,
    rejectAction,
    ...screenProps
  },
  ref,
) {
  return (
    <AppScreen ref={ref} {...screenProps}>
      <AppHeader
        title={title}
        onBack={onBack}
        backLabel={backLabel}
        trailing={trailing}
        headingRef={headingRef}
      />

      <ScreenBody ref={bodyRef} pt={3} {...bodyProps}>
        <VStack align="stretch" spacing={5} minW={0}>
          {navigation}

          {outcome}

          {financialImpact && (
            <ScreenSection title={financialImpactTitle}>
              {financialImpact}
            </ScreenSection>
          )}

          {context && (
            <ScreenSection title={contextTitle} headerAction={contextHeaderAction}>
              {context}
            </ScreenSection>
          )}

          {advancedDetails && (
            <Box as="section" aria-label={advancedLabel} minW={0}>
              {advancedDetails}
            </Box>
          )}
        </VStack>
      </ScreenBody>

      <StickyActionBar
        summary={actionSummary}
        notice={actionNotice}
        primaryAction={confirmAction}
        secondaryAction={rejectAction}
      />
    </AppScreen>
  );
});
