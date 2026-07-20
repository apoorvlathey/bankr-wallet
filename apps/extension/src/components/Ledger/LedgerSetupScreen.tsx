import { Box } from "@chakra-ui/react";
import AddLedgerFlow from "./AddLedgerFlow";

export default function LedgerSetupScreen({
  onBack,
  onComplete,
}: {
  onBack: () => void;
  onComplete: () => Promise<void>;
}) {
  return (
    <Box bg="bg.base" h="100%" display="flex" flexDirection="column">
      <Box
        maxW="600px"
        mx="auto"
        w="100%"
        h="100%"
        display="flex"
        flexDirection="column"
      >
        <AddLedgerFlow onBack={onBack} onComplete={onComplete} />
      </Box>
    </Box>
  );
}
