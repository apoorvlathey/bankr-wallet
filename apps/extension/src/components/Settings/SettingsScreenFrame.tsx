import { Box, type BoxProps } from "@chakra-ui/react";
import type { ReactNode } from "react";

import {
  AppHeader,
  AppScreen,
  ScreenBody,
  StickyActionBar,
} from "@/components/ui";

interface SettingsScreenFrameProps extends Omit<BoxProps, "title"> {
  title: ReactNode;
  onBack: () => void;
  backLabel?: string;
  trailing?: ReactNode;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
  children: ReactNode;
}

/**
 * Bridges legacy Settings container padding to the mobile application shell.
 * The screen body remains the only scroll owner and actions stay reachable.
 */
export function SettingsScreenFrame({
  title,
  onBack,
  backLabel,
  trailing,
  primaryAction,
  secondaryAction,
  children,
  ...rest
}: SettingsScreenFrameProps) {
  return (
    <Box
      flex="1 1 auto"
      minH={0}
      mx={-4}
      my={-4}
      w="calc(100% + 2rem)"
      h="calc(100% + 2rem)"
      {...rest}
    >
      <AppScreen>
        <AppHeader
          title={title}
          onBack={onBack}
          backLabel={backLabel}
          trailing={trailing}
        />
        <ScreenBody pt={4} pb={6}>
          {children}
        </ScreenBody>
        {primaryAction && (
          <StickyActionBar
            primaryAction={primaryAction}
            secondaryAction={secondaryAction}
          />
        )}
      </AppScreen>
    </Box>
  );
}
