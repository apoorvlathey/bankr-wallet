import {
  Box,
  Flex,
  Skeleton,
  SkeletonCircle,
  usePrefersReducedMotion,
  type BoxProps,
} from "@chakra-ui/react";
import { forwardRef } from "react";
import type { ListItemDensity } from "./ListItem";

export interface SkeletonRowProps extends BoxProps {
  density?: ListItemDensity;
  showMedia?: boolean;
  showMeta?: boolean;
}

/** Loading placeholder that preserves the same geometry as a ListItem. */
export const SkeletonRow = forwardRef<HTMLElement, SkeletonRowProps>(
  function SkeletonRow(
    {
      as = "li",
      density = "default",
      showMedia = true,
      showMeta = true,
      ...rest
    },
    ref,
  ) {
    const prefersReducedMotion = usePrefersReducedMotion();
    const animation = prefersReducedMotion ? "none" : undefined;
    const mediaSize = density === "compact" ? "32px" : "36px";

    const skeletonProps = {
      startColor: "surface.sunken",
      endColor: "surface.raisedHover",
      animation,
    };

    return (
      <Flex
        ref={ref}
        as={as}
        aria-hidden="true"
        data-skeleton-row
        {...rest}
        w="full"
        minH={density === "compact" ? "48px" : "56px"}
        px={density === "compact" ? 3 : 4}
        py={density === "compact" ? 2 : 3}
        gap={3}
        align="center"
        bg="transparent"
        borderBottomWidth="1px"
        borderBottomStyle="solid"
        borderBottomColor="border.subtle"
        _last={{ borderBottomWidth: 0 }}
      >
        {showMedia && (
          <SkeletonCircle
            {...skeletonProps}
            size={mediaSize}
            flexShrink={0}
          />
        )}

        <Flex minW={0} flex="1 1 auto" direction="column" gap={1.5}>
          <Skeleton
            {...skeletonProps}
            h="14px"
            w="42%"
            minW="72px"
            maxW="160px"
            borderRadius="sm"
          />
          <Skeleton
            {...skeletonProps}
            h="12px"
            w="68%"
            minW="112px"
            maxW="240px"
            borderRadius="sm"
          />
        </Flex>

        {showMeta && (
          <Box flex="0 0 auto" w="64px">
            <Skeleton
              {...skeletonProps}
              h="14px"
              w="full"
              borderRadius="sm"
            />
          </Box>
        )}
      </Flex>
    );
  },
);
