import { type ReactNode, useRef } from "react";
import { Flex, Text, usePrefersReducedMotion, VStack } from "@chakra-ui/react";

import { RequestChainContext } from "@/components/RequestConfirmation/EstimatedChangesHeading";
import { QueueNavigation } from "@/components/RequestConfirmation/QueueNavigation";
import { RequestIdentity } from "@/components/RequestConfirmation/RequestIdentity";
import { ConfirmationScreen, InlineDisclosure } from "@/components/ui";

interface Erc7715PermissionScreenProps {
  onBack: () => void;
  trailing?: ReactNode;
  currentIndex: number;
  totalCount: number;
  stripBg: string;
  stripFg: string;
  onNavigate: (direction: "prev" | "next") => void;
  onRejectAll: () => void;
  origin: string;
  originHostname: string | null;
  favicon: string | null;
  originInitials: string;
  iconChipBg: string;
  summary: ReactNode;
  chainId: number;
  chainName: string;
  limits: ReactNode;
  advancedDetails: ReactNode;
  actionSummary: ReactNode;
  actionNotice?: ReactNode;
  confirmAction: ReactNode;
  rejectAction?: ReactNode;
}

export function Erc7715PermissionScreen({
  onBack,
  trailing,
  currentIndex,
  totalCount,
  stripBg,
  stripFg,
  onNavigate,
  onRejectAll,
  origin,
  originHostname,
  favicon,
  originInitials,
  iconChipBg,
  summary,
  chainId,
  chainName,
  limits,
  advancedDetails,
  actionSummary,
  actionNotice,
  confirmAction,
  rejectAction,
}: Erc7715PermissionScreenProps) {
  const disclosureRef = useRef<HTMLDetailsElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  const handleAdvancedOpenChange = (open: boolean) => {
    if (!open) return;
    requestAnimationFrame(() => {
      if (!disclosureRef.current?.open) return;
      disclosureRef.current.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
    });
  };

  return (
    <ConfirmationScreen
      title="Permission request"
      onBack={onBack}
      backLabel="Back from permission request"
      trailing={trailing}
      navigation={
        totalCount > 1 ? (
          <QueueNavigation
            currentIndex={currentIndex}
            totalCount={totalCount}
            stripBg={stripBg}
            stripFg={stripFg}
            onNavigate={onNavigate}
            onRejectAll={onRejectAll}
          />
        ) : undefined
      }
      outcome={
        <VStack align="stretch" spacing={3}>
          <RequestIdentity
            origin={origin}
            originHostname={originHostname}
            favicon={favicon}
            originInitials={originInitials}
            iconChipBg={iconChipBg}
          />
          {summary}
        </VStack>
      }
      financialImpact={limits}
      financialImpactTitle={
        <Flex as="span" align="center" justify="space-between" gap={2} w="full">
          <Text as="span" fontSize="xl" fontWeight="700" noOfLines={1}>
            Permission limits
          </Text>
          <RequestChainContext chainId={chainId} chainName={chainName} />
        </Flex>
      }
      advancedDetails={
        <InlineDisclosure
          ref={disclosureRef}
          label="Advanced details"
          onOpenChange={handleAdvancedOpenChange}
        >
          <VStack align="stretch" spacing={4} pt={2}>
            {advancedDetails}
          </VStack>
        </InlineDisclosure>
      }
      actionSummary={actionSummary}
      actionNotice={actionNotice}
      confirmAction={confirmAction}
      rejectAction={rejectAction}
    />
  );
}
