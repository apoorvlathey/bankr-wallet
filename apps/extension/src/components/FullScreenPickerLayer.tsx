import { Box, Portal, type BoxProps } from "@chakra-ui/react";
import { useEffect, type ReactNode } from "react";

interface FullScreenPickerLayerProps extends BoxProps {
  children: ReactNode;
}

/**
 * Portals a nested picker above the current app screen and makes the covered
 * application tree inert while the picker is active.
 */
export function FullScreenPickerLayer({
  children,
  ...rest
}: FullScreenPickerLayerProps) {
  useEffect(() => {
    const appRoot =
      document.getElementById("root") ??
      document.getElementById("preview-root");
    if (!appRoot) return;

    const previousAriaHidden = appRoot.getAttribute("aria-hidden");
    const wasInert = appRoot.hasAttribute("inert");
    appRoot.setAttribute("aria-hidden", "true");
    appRoot.setAttribute("inert", "");

    return () => {
      if (previousAriaHidden === null) appRoot.removeAttribute("aria-hidden");
      else appRoot.setAttribute("aria-hidden", previousAriaHidden);
      if (!wasInert) appRoot.removeAttribute("inert");
    };
  }, []);

  return (
    <Portal>
      <Box
        position="fixed"
        inset={0}
        zIndex="modal"
        bg="surface.base"
        {...rest}
      >
        {children}
      </Box>
    </Portal>
  );
}
