import { Box } from "@chakra-ui/react";
import { Suspense, type ReactNode } from "react";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { TxDetailScreen, UnshieldDetailScreen } from "@/app/lazyScreens";
import type { UnshieldOperation } from "@/components/Shield/model/unshield";

interface TransactionDetailRouteProps {
  isFullscreenTab: boolean;
  transaction: CompletedTransaction | null;
  unshieldOperation: UnshieldOperation | null;
  fallback: ReactNode;
  onBackTransaction: () => void;
  onBackUnshield: () => void;
  onUnshield: () => void;
}

/** Shared App frame for ordinary and Privacy Pools transaction details. */
export default function TransactionDetailRoute({
  isFullscreenTab,
  transaction,
  unshieldOperation,
  fallback,
  onBackTransaction,
  onBackUnshield,
  onUnshield,
}: TransactionDetailRouteProps) {
  return (
    <Box bg="bg.base" h="100%" display="flex" flexDirection="column">
      <Box
        maxW={isFullscreenTab ? "480px" : "100%"}
        mx="auto"
        w="100%"
        h="100%"
        display="flex"
        flexDirection="column"
        minH={0}
      >
        <Suspense fallback={fallback}>
          {unshieldOperation ? (
            <UnshieldDetailScreen
              operation={unshieldOperation}
              onBack={onBackUnshield}
            />
          ) : transaction ? (
            <TxDetailScreen
              tx={transaction}
              onUnshield={onUnshield}
              onBack={onBackTransaction}
            />
          ) : null}
        </Suspense>
      </Box>
    </Box>
  );
}
