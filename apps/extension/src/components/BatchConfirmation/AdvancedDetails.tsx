import { Box, usePrefersReducedMotion, VStack } from "@chakra-ui/react";
import { useRef } from "react";
import { CalldataDigestDisplay } from "@/components/DigestDisplay";
import { ForceInclusionOption } from "@/components/RequestConfirmation/ForceInclusionOption";
import { RequestToolActions } from "@/components/RequestConfirmation/RequestToolActions";
import { InlineDisclosure } from "@/components/ui";
import { makeTenderlyUrl } from "./helpers";
import type { ForceInclusionInfo } from "./types";

interface EncodedBatch {
  to: string;
  data: string;
  value: string;
}

interface AdvancedDetailsProps {
  fromAddress: string;
  chainId: number;
  isNonAtomic: boolean;
  isAtomic7702: boolean;
  outerEncodedBatch: EncodedBatch;
  forceInclusion: boolean;
  forceInclusionInfo: ForceInclusionInfo | null;
  showAddToBatch: boolean;
  addToBatchDisabledReason: string | null;
  isAddingToBatch: boolean;
  batchedCount: number;
  onForceInclusionChange: (enabled: boolean) => void;
  onAddToBatch: () => void;
}

export function AdvancedDetails({
  fromAddress,
  chainId,
  isNonAtomic,
  isAtomic7702,
  outerEncodedBatch,
  forceInclusion,
  forceInclusionInfo,
  showAddToBatch,
  addToBatchDisabledReason,
  isAddingToBatch,
  batchedCount,
  onForceInclusionChange,
  onAddToBatch,
}: AdvancedDetailsProps) {
  const tenderlyUrl = makeTenderlyUrl(fromAddress, chainId, outerEncodedBatch);
  const disclosureRef = useRef<HTMLDetailsElement>(null);
  const contentEndRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const handleOpenChange = (open: boolean) => {
    if (!open) return;
    requestAnimationFrame(() => {
      if (!disclosureRef.current?.open) return;
      contentEndRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "nearest",
      });
    });
  };

  return (
    <InlineDisclosure
      ref={disclosureRef}
      label="Advanced details"
      onOpenChange={handleOpenChange}
    >
      <VStack spacing={3} align="stretch" pt={3}>
        <VStack spacing={2} align="stretch">
          {isAtomic7702 && outerEncodedBatch.data && outerEncodedBatch.data !== "0x" && (
            <CalldataDigestDisplay calldata={outerEncodedBatch.data} />
          )}

          {!isNonAtomic && (
            <Box
              bg="surface.raised"
              borderWidth="1px"
              borderStyle="solid"
              borderColor="border.default"
              borderRadius="lg"
              overflow="hidden"
            >
              <RequestToolActions
                tenderlyUrl={tenderlyUrl}
                onOpenTenderly={() => chrome.tabs.create({ url: tenderlyUrl })}
                showAddToBatch={showAddToBatch}
                addToBatchDisabledReason={addToBatchDisabledReason}
                isAddingToBatch={isAddingToBatch}
                batchedCount={batchedCount}
                onAddToBatch={onAddToBatch}
              />
            </Box>
          )}
        </VStack>

        {forceInclusionInfo && (
          <Box
            bg="surface.raised"
            borderWidth="1px"
            borderStyle="solid"
            borderColor="border.default"
            borderRadius="lg"
            overflow="hidden"
          >
            <ForceInclusionOption
              l1ChainName={forceInclusionInfo.l1ChainName}
              enabled={forceInclusion}
              onChange={onForceInclusionChange}
              ariaLabel="Force batch inclusion"
            />
          </Box>
        )}
      </VStack>
      <Box ref={contentEndRef} h="1px" aria-hidden />
    </InlineDisclosure>
  );
}
