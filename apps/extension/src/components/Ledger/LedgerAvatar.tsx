import { Box } from "@chakra-ui/react";
import { LedgerLogo } from "./LedgerLogo";

/** Official Ledger lettermark used where an address blockie would be misleading. */
export function LedgerAvatar({ size = 20 }: { size?: number }) {
  return (
    <Box
      boxSize={`${size}px`}
      minW={`${size}px`}
      border="1px solid"
      borderColor="border.subtle"
      borderRadius="md"
      bg="surface.sunken"
      color="fg.primary"
      display="grid"
      placeItems="center"
    >
      <LedgerLogo variant="lettermark" w="62%" />
    </Box>
  );
}
