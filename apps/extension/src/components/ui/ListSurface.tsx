import { Box, type BoxProps } from "@chakra-ui/react";
import { forwardRef } from "react";

export interface ListSurfaceProps extends BoxProps {}

/**
 * The single visual boundary for a related set of rows.
 *
 * Defaults to a native unordered list. When rendering another list element,
 * keep `role="list"` so list semantics survive the visual style reset.
 */
export const ListSurface = forwardRef<HTMLElement, ListSurfaceProps>(
  function ListSurface({ as = "ul", role, children, ...rest }, ref) {
    const hasNativeListSemantics = as === "ul" || as === "ol";

    return (
      <Box
        ref={ref}
        as={as}
        role={role ?? (hasNativeListSemantics ? "list" : undefined)}
        {...rest}
        w="full"
        m={0}
        p={0}
        overflow="hidden"
        listStyleType="none"
        bg="surface.raised"
        borderWidth="1px"
        borderStyle="solid"
        borderColor="border.default"
        borderRadius="lg"
      >
        {children}
      </Box>
    );
  },
);
