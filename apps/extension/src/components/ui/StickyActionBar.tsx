import { Box, Grid, type BoxProps } from "@chakra-ui/react";
import { forwardRef, type ReactNode } from "react";

export interface StickyActionBarProps extends BoxProps {
  primaryAction: ReactNode;
  secondaryAction?: ReactNode;
}

/** Non-scrolling bottom action region for one primary or a secondary/primary pair. */
export const StickyActionBar = forwardRef<HTMLDivElement, StickyActionBarProps>(
  function StickyActionBar(
    { primaryAction, secondaryAction, ...rest },
    ref,
  ) {
    return (
      <Box
        ref={ref}
        {...rest}
        position="sticky"
        bottom={0}
        zIndex={2}
        w="full"
        flexShrink={0}
        overflow="visible"
        bg="surface.raised"
        borderTop="1px solid"
        borderColor="border.subtle"
        px={4}
        pt={3}
        pb="calc(12px + env(safe-area-inset-bottom, 0px))"
      >
        <Grid
          templateColumns={
            secondaryAction
              ? "repeat(auto-fit, minmax(min(140px, 100%), 1fr))"
              : "minmax(0, 1fr)"
          }
          gap={3}
          alignItems="stretch"
        >
          {secondaryAction && (
            <Box minW={0} sx={{ "> *": { width: "100%" } }}>
              {secondaryAction}
            </Box>
          )}
          <Box minW={0} sx={{ "> *": { width: "100%" } }}>
            {primaryAction}
          </Box>
        </Grid>
      </Box>
    );
  },
);
