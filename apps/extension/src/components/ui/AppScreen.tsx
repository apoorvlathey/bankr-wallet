import {
  Box,
  Heading,
  HStack,
  Text,
  VStack,
  type BoxProps,
  type HeadingProps,
  type TextProps,
} from "@chakra-ui/react";
import {
  createContext,
  forwardRef,
  useContext,
  useId,
  type ReactNode,
} from "react";

type ActionClearance = BoxProps["paddingBottom"];

const StickyActionClearanceContext = createContext<ActionClearance>(4);

export interface AppScreenProps extends BoxProps {
  /** Bottom padding inherited by ScreenBody. Increase for an overlaying action bar. */
  stickyActionClearance?: ActionClearance;
}

/** Full-height screen boundary. ScreenBody is the only child that scrolls. */
export const AppScreen = forwardRef<HTMLDivElement, AppScreenProps>(
  function AppScreen(
    { stickyActionClearance = 4, children, ...rest },
    ref,
  ) {
    return (
      <StickyActionClearanceContext.Provider value={stickyActionClearance}>
        <Box
          ref={ref}
          {...rest}
          w="full"
          h="100%"
          minH={0}
          bg="surface.base"
          color="fg.primary"
          display="flex"
          flexDirection="column"
          overflow="hidden"
          position="relative"
        >
          {children}
        </Box>
      </StickyActionClearanceContext.Provider>
    );
  },
);

export interface ScreenBodyProps extends BoxProps {
  /** Overrides the clearance supplied by AppScreen for this body only. */
  stickyActionClearance?: ActionClearance;
}

/** The sole vertical scroll owner inside AppScreen. */
export const ScreenBody = forwardRef<HTMLDivElement, ScreenBodyProps>(
  function ScreenBody(
    { stickyActionClearance, pb, children, ...rest },
    ref,
  ) {
    const inheritedClearance = useContext(StickyActionClearanceContext);

    return (
      <Box
        ref={ref}
        data-screen-scroll-owner
        {...rest}
        flex="1 1 auto"
        minH={0}
        w="full"
        overflowX="hidden"
        overflowY="auto"
        overscrollBehaviorY="contain"
        px={4}
        pb={pb ?? stickyActionClearance ?? inheritedClearance}
      >
        {children}
      </Box>
    );
  },
);

export interface ScreenSectionProps extends Omit<BoxProps, "title"> {
  title?: ReactNode;
  headerAction?: ReactNode;
  description?: ReactNode;
  titleId?: string;
  descriptionId?: string;
  headingAs?: HeadingProps["as"];
  headingProps?: Omit<HeadingProps, "id" | "as" | "children">;
  descriptionProps?: Omit<TextProps, "id" | "children">;
}

/** Spacing-first, unboxed grouping for related screen content. */
export const ScreenSection = forwardRef<HTMLDivElement, ScreenSectionProps>(
  function ScreenSection(
    {
      title,
      headerAction,
      description,
      titleId,
      descriptionId,
      headingAs = "h2",
      headingProps,
      descriptionProps,
      children,
      ...rest
    },
    ref,
  ) {
    const generatedId = useId();
    const resolvedTitleId = titleId ?? `${generatedId}-title`;
    const resolvedDescriptionId = descriptionId ?? `${generatedId}-description`;

    return (
      <Box
        ref={ref}
        as="section"
        w="full"
        aria-labelledby={title ? resolvedTitleId : undefined}
        aria-describedby={description ? resolvedDescriptionId : undefined}
        {...rest}
      >
        {(title || description) && (
          <VStack align="stretch" spacing={1} mb={3}>
            {title && (
              <HStack align="center" justify="space-between" spacing={3}>
                <Heading
                  as={headingAs}
                  id={resolvedTitleId}
                  flex="1"
                  minW={0}
                  fontSize="xl"
                  overflowWrap="anywhere"
                  {...headingProps}
                >
                  {title}
                </Heading>
                {headerAction && <Box flexShrink={0}>{headerAction}</Box>}
              </HStack>
            )}
            {description && (
              <Text
                id={resolvedDescriptionId}
                color="fg.secondary"
                fontSize="sm"
                lineHeight="1.45"
                {...descriptionProps}
              >
                {description}
              </Text>
            )}
          </VStack>
        )}
        {children}
      </Box>
    );
  },
);
