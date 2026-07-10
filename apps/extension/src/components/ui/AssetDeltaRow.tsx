import {
  Box,
  Flex,
  Grid,
  HStack,
  Text,
  VStack,
  type GridProps,
} from "@chakra-ui/react";
import { ArrowDownIcon, ArrowUpIcon, MinusIcon } from "@chakra-ui/icons";
import { forwardRef, type ReactNode } from "react";

export type AssetDeltaDirection = "send" | "receive" | "neutral";

export interface AssetDeltaRowProps extends Omit<GridProps, "direction"> {
  direction: AssetDeltaDirection;
  asset: ReactNode;
  amount: ReactNode;
  media?: ReactNode;
  fiat?: ReactNode;
  meta?: ReactNode;
  directionLabel?: ReactNode;
}

const DIRECTION_PRESENTATION = {
  send: {
    label: "Send",
    color: "chart.negative",
    icon: ArrowUpIcon,
  },
  receive: {
    label: "Receive",
    color: "chart.positive",
    icon: ArrowDownIcon,
  },
  neutral: {
    label: "Change",
    color: "fg.secondary",
    icon: MinusIcon,
  },
} as const;

/** A color-independent, long-number-safe financial impact row. */
export const AssetDeltaRow = forwardRef<HTMLDivElement, AssetDeltaRowProps>(
  function AssetDeltaRow(
    {
      direction,
      asset,
      amount,
      media,
      fiat,
      meta,
      directionLabel,
      ...rest
    },
    ref,
  ) {
    const presentation = DIRECTION_PRESENTATION[direction];
    const DirectionIcon = presentation.icon;

    return (
      <Grid
        ref={ref}
        {...rest}
        w="full"
        minW={0}
        gridTemplateColumns="minmax(0, 1fr) minmax(88px, auto)"
        columnGap={3}
        alignItems="center"
        py={3}
        borderBottomWidth="1px"
        borderBottomStyle="solid"
        borderBottomColor="border.subtle"
        _last={{ borderBottomWidth: 0 }}
      >
        <HStack spacing={3} minW={0} align="center">
          {media && (
            <Flex flexShrink={0} align="center" justify="center">
              {media}
            </Flex>
          )}
          <VStack align="stretch" spacing={0.5} minW={0}>
            <HStack spacing={1.5} color={presentation.color} minW={0}>
              <DirectionIcon boxSize={3} flexShrink={0} aria-hidden />
              <Text fontSize="xs" fontWeight="600" overflowWrap="anywhere">
                {directionLabel ?? presentation.label}
              </Text>
            </HStack>
            <Box color="fg.primary" fontSize="md" fontWeight="600" minW={0} overflowWrap="anywhere">
              {asset}
            </Box>
            {meta && (
              <Box color="fg.secondary" fontSize="xs" minW={0} overflowWrap="anywhere">
                {meta}
              </Box>
            )}
          </VStack>
        </HStack>

        <VStack align="flex-end" spacing={0.5} minW={0} maxW="55vw">
          <Box
            color={presentation.color}
            fontSize="md"
            fontWeight="600"
            sx={{ fontVariantNumeric: "tabular-nums" }}
            textAlign="right"
            lineHeight="1.3"
            minW={0}
            maxW="full"
            overflowWrap="anywhere"
            wordBreak="break-word"
          >
            {amount}
          </Box>
          {fiat && (
            <Box
              color="fg.secondary"
              fontSize="xs"
              sx={{ fontVariantNumeric: "tabular-nums" }}
              textAlign="right"
              minW={0}
              maxW="full"
              overflowWrap="anywhere"
            >
              {fiat}
            </Box>
          )}
        </VStack>
      </Grid>
    );
  },
);
