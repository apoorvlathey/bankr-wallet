import {
  Box,
  Flex,
  Heading,
  Text,
  VStack,
  type BoxProps,
} from "@chakra-ui/react";
import { forwardRef, useId, type ReactNode } from "react";

export interface OutcomeCardProps extends Omit<BoxProps, "title"> {
  outcome: ReactNode;
  label?: ReactNode;
  context?: ReactNode;
  status?: ReactNode;
  media?: ReactNode;
  headingId?: string;
}

/** The single emphasized, plain-language outcome surface on a decision screen. */
export const OutcomeCard = forwardRef<HTMLDivElement, OutcomeCardProps>(
  function OutcomeCard(
    {
      outcome,
      label = "Expected outcome",
      context,
      status,
      media,
      headingId,
      ...rest
    },
    ref,
  ) {
    const generatedId = useId();
    const resolvedHeadingId = headingId ?? `${generatedId}-outcome`;

    return (
      <Box
        ref={ref}
        as="section"
        aria-labelledby={resolvedHeadingId}
        {...rest}
        w="full"
        minW={0}
        p={4}
        bg="surface.accentTint"
        borderWidth="1px"
        borderStyle="solid"
        borderColor="border.default"
        borderRadius="lg"
        boxShadow="none"
      >
        <Flex align="flex-start" gap={3} minW={0} flexWrap="wrap">
          {media && (
            <Flex flexShrink={0} align="center" justify="center">
              {media}
            </Flex>
          )}

          <VStack align="stretch" spacing={1.5} flex="1 1 180px" minW={0}>
            {label && (
              <Text color="fg.secondary" fontSize="xs" fontWeight="600">
                {label}
              </Text>
            )}
            <Heading
              as="h2"
              id={resolvedHeadingId}
              color="fg.primary"
              fontSize="xl"
              lineHeight="1.3"
              overflowWrap="anywhere"
            >
              {outcome}
            </Heading>
            {context && (
              <Box color="fg.secondary" fontSize="sm" lineHeight="1.45" minW={0}>
                {context}
              </Box>
            )}
          </VStack>

          {status && (
            <Flex flex="0 1 auto" minW={0} maxW="full" align="center">
              {status}
            </Flex>
          )}
        </Flex>
      </Box>
    );
  },
);
