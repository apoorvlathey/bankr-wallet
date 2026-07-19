import { Box, Spinner } from "@chakra-ui/react";
import { ViewOnlySigningNotice } from "@/components/shared/ViewOnlySigningNotice";
import { LedgerLogo } from "./LedgerLogo";

/** Keeps the hardware action visible without replacing the request review. */
export function LedgerSigningStatus({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <ViewOnlySigningNotice
      message="Sign the request in your Ledger"
      icon={
        <Box
          boxSize="28px"
          bg="black"
          color="white"
          borderRadius="sm"
          display="flex"
          alignItems="center"
          justifyContent="center"
          flexShrink={0}
        >
          <LedgerLogo variant="lettermark" w="16px" color="white" />
        </Box>
      }
      trailing={
        <Spinner size="sm" color="accentFg.highlight" flexShrink={0} />
      }
    />
  );
}
