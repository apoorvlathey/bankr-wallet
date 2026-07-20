import { Box, usePrefersReducedMotion } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import type {
  CompletedTransaction,
  GasData,
} from "@/chrome/txHistoryStorage";
import { InlineDisclosure } from "@/components/ui";
import GasDetails from "./GasDetails";
import RawTransactionDetails from "./RawTransactionDetails";

export default function AdvancedDetails({
  tx,
  resolveLogo,
  nativeSym,
  gasData,
  txFee,
  gasUsagePercent,
  isL2,
  setGas,
  setMaxFee,
  setPriority,
  setGasPrice,
  hasSetGasParams,
  estimatedMaxCost,
  defaultOpen,
  formatWeiUsd,
  onFunctionName,
  calldataLoading,
  calldataError,
  onRetryCalldata,
}: {
  tx: CompletedTransaction;
  resolveLogo: (url: string | null | undefined) => string | undefined;
  nativeSym: string;
  gasData: GasData | undefined;
  txFee: string | undefined;
  gasUsagePercent: string | undefined;
  isL2: boolean;
  setGas: string | undefined;
  setMaxFee: string | undefined;
  setPriority: string | undefined;
  setGasPrice: string | undefined;
  hasSetGasParams: boolean;
  estimatedMaxCost: string | undefined;
  defaultOpen: boolean;
  formatWeiUsd: (raw: string | undefined | null) => string | null;
  onFunctionName: (name: string) => void;
  calldataLoading: boolean;
  calldataError: string | null;
  onRetryCalldata: () => void;
}) {
  const disclosureRef = useRef<HTMLDetailsElement>(null);
  const wasOpenRef = useRef(defaultOpen);
  const transactionIdRef = useRef(tx.id);
  const userToggledRef = useRef(false);
  const [open, setOpen] = useState(defaultOpen);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    if (transactionIdRef.current !== tx.id) {
      transactionIdRef.current = tx.id;
      userToggledRef.current = false;
    }
    if (userToggledRef.current || open === defaultOpen) return;
    setOpen(defaultOpen);
  }, [defaultOpen, open, tx.id]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen === open) {
      wasOpenRef.current = nextOpen;
      return;
    }

    userToggledRef.current = true;
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = nextOpen;
    setOpen(nextOpen);
    if (!nextOpen || wasOpen) return;

    requestAnimationFrame(() => {
      if (!disclosureRef.current?.open) return;
      disclosureRef.current.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });
  };

  return (
    <InlineDisclosure
      ref={disclosureRef}
      label="Advanced details"
      open={open}
      onOpenChange={handleOpenChange}
    >
      <Box
        mt={2}
        bg="surface.raised"
        borderWidth="1px"
        borderStyle="solid"
        borderColor="border.default"
        borderRadius="lg"
        overflow="hidden"
      >
        <RawTransactionDetails
          tx={tx}
          resolveLogo={resolveLogo}
          nativeSym={nativeSym}
          formatWeiUsd={formatWeiUsd}
          onFunctionName={onFunctionName}
          calldataLoading={calldataLoading}
          calldataError={calldataError}
          onRetryCalldata={onRetryCalldata}
        />
        <GasDetails
          gasData={gasData}
          txFee={txFee}
          gasUsagePercent={gasUsagePercent}
          nativeSym={nativeSym}
          isL2={isL2}
          setGas={setGas}
          setMaxFee={setMaxFee}
          setPriority={setPriority}
          setGasPrice={setGasPrice}
          hasSetGasParams={hasSetGasParams}
          estimatedMaxCost={estimatedMaxCost}
          formatWeiUsd={formatWeiUsd}
        />
      </Box>
    </InlineDisclosure>
  );
}
