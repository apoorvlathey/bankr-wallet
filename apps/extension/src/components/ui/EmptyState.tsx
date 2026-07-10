import {
  Flex,
  Heading,
  Text,
  type FlexProps,
  type HeadingProps,
  type TextProps,
} from "@chakra-ui/react";
import { forwardRef } from "react";

export interface EmptyStateProps extends FlexProps {}

/**
 * An unboxed, composable empty state. Pair its explanation with an action or
 * a clear next step; no decorative or "sad" icon is supplied by default.
 */
export const EmptyState = forwardRef<HTMLElement, EmptyStateProps>(
  function EmptyState({ children, ...rest }, ref) {
    return (
      <Flex
        ref={ref}
        as="section"
        data-empty-state
        {...rest}
        w="full"
        minH="176px"
        py={8}
        px={4}
        direction="column"
        align="center"
        justify="center"
        gap={4}
        textAlign="center"
        color="fg.primary"
      >
        {children}
      </Flex>
    );
  },
);
export interface EmptyStateHeaderProps extends FlexProps {}

export const EmptyStateHeader = forwardRef<HTMLElement, EmptyStateHeaderProps>(
  function EmptyStateHeader({ children, ...rest }, ref) {
    return (
      <Flex
        ref={ref}
        as="header"
        data-empty-state-slot="header"
        {...rest}
        maxW="28rem"
        direction="column"
        align="center"
        gap={1}
      >
        {children}
      </Flex>
    );
  },
);

export interface EmptyStateMediaProps extends FlexProps {}

export const EmptyStateMedia = forwardRef<HTMLElement, EmptyStateMediaProps>(
  function EmptyStateMedia({ children, ...rest }, ref) {
    return (
      <Flex
        ref={ref}
        as="div"
        data-empty-state-slot="media"
        aria-hidden="true"
        {...rest}
        minW="32px"
        minH="32px"
        align="center"
        justify="center"
        color="fg.secondary"
      >
        {children}
      </Flex>
    );
  },
);

export interface EmptyStateTitleProps extends HeadingProps {}

export const EmptyStateTitle = forwardRef<HTMLElement, EmptyStateTitleProps>(
  function EmptyStateTitle({ children, ...rest }, ref) {
    return (
      <Heading
        ref={ref}
        as="h2"
        data-empty-state-slot="title"
        {...rest}
        color="fg.primary"
        fontSize="lg"
        fontWeight={600}
        lineHeight="1.3"
        overflowWrap="anywhere"
      >
        {children}
      </Heading>
    );
  },
);

export interface EmptyStateDescriptionProps extends TextProps {}

export const EmptyStateDescription = forwardRef<
  HTMLElement,
  EmptyStateDescriptionProps
>(function EmptyStateDescription({ children, ...rest }, ref) {
  return (
    <Text
      ref={ref}
      as="p"
      data-empty-state-slot="description"
      {...rest}
      m={0}
      color="fg.secondary"
      fontSize="sm"
      fontWeight={400}
      lineHeight="1.45"
      overflowWrap="anywhere"
    >
      {children}
    </Text>
  );
});

export interface EmptyStateActionsProps extends FlexProps {}

export const EmptyStateActions = forwardRef<HTMLElement, EmptyStateActionsProps>(
  function EmptyStateActions({ children, ...rest }, ref) {
    return (
      <Flex
        ref={ref}
        as="div"
        data-empty-state-slot="actions"
        {...rest}
        align="center"
        justify="center"
        wrap="wrap"
        gap={2}
        sx={{ "> *": { minHeight: "44px" } }}
      >
        {children}
      </Flex>
    );
  },
);
