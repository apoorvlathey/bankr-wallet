import {
  Badge,
  Code,
  Text,
  usePrefersReducedMotion,
  VStack,
} from "@chakra-ui/react";
import { type ReactNode, useRef } from "react";

import { QueueNavigation } from "@/components/RequestConfirmation/QueueNavigation";
import { RequestIdentity } from "@/components/RequestConfirmation/RequestIdentity";
import { RequestChainContext } from "@/components/RequestConfirmation/EstimatedChangesHeading";
import {
  ConfirmationScreen,
  InlineDisclosure,
  ListItem,
  ListItemActions,
  ListSurface,
} from "@/components/ui";

export interface SignatureConfirmationScreenProps {
  onBack: () => void;
  trailing?: ReactNode;
  origin: string;
  originHostname: string;
  faviconUrl: string;
  iconChipBg: string;
  originInitials: string;
  intent: string;
  intentDescription: string;
  intentStatus?: { label: string; variant: "error" | "warning" };
  currentIndex: number;
  totalCount: number;
  stripBg: string;
  stripFg: string;
  onNavigate: (direction: "prev" | "next") => void;
  onRejectAll: () => void;
  readableDetails?: ReactNode;
  readableDetailsTitle?: ReactNode;
  methodName: string;
  chainId: number;
  chainName: string;
  advancedDetails?: ReactNode;
  actionSummary?: ReactNode;
  actionNotice?: ReactNode;
  confirmAction: ReactNode;
  rejectAction?: ReactNode;
  isInteractionLocked?: boolean;
}

function SignatureSummary({
  intent,
  description,
  status,
}: {
  intent: string;
  description: string;
  status?: { label: string; variant: "error" | "warning" };
}) {
  return (
    <VStack as="section" aria-label="Signature summary" spacing={1.5} px={2}>
      <Text
        color="fg.primary"
        fontSize="lg"
        fontWeight="700"
        lineHeight="1.3"
        textAlign="center"
        overflowWrap="anywhere"
      >
        {intent}
      </Text>
      <Text
        maxW="300px"
        color="fg.secondary"
        fontSize="sm"
        lineHeight="1.45"
        textAlign="center"
      >
        {description}
      </Text>
      {status && <Badge variant={status.variant}>{status.label}</Badge>}
    </VStack>
  );
}

function TechnicalMetadata({
  methodName,
}: {
  methodName: string;
}) {
  return (
    <ListSurface>
      <ListItem density="compact">
        <Text color="fg.secondary" fontSize="xs" fontWeight="600">
          Request type
        </Text>
        <ListItemActions minW={0}>
          <Code
            color="fg.primary"
            bg="surface.sunken"
            fontFamily="mono"
            fontSize="xs"
            overflowWrap="anywhere"
            whiteSpace="normal"
          >
            {methodName}
          </Code>
        </ListItemActions>
      </ListItem>
    </ListSurface>
  );
}

export function SignatureConfirmationScreen({
  onBack,
  trailing,
  origin,
  originHostname,
  faviconUrl,
  iconChipBg,
  originInitials,
  intent,
  intentDescription,
  intentStatus,
  currentIndex,
  totalCount,
  stripBg,
  stripFg,
  onNavigate,
  onRejectAll,
  readableDetails,
  readableDetailsTitle = "Message",
  methodName,
  chainId,
  chainName,
  advancedDetails,
  actionSummary,
  actionNotice,
  confirmAction,
  rejectAction,
  isInteractionLocked = false,
}: SignatureConfirmationScreenProps) {
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

  const advanced = advancedDetails ? (
    <InlineDisclosure
      ref={disclosureRef}
      label="Advanced details"
      onOpenChange={handleAdvancedOpenChange}
    >
      <VStack align="stretch" spacing={4} pt={2}>
        <TechnicalMetadata methodName={methodName} />
        {advancedDetails}
      </VStack>
    </InlineDisclosure>
  ) : undefined;

  return (
    <ConfirmationScreen
      title="Signature request"
      onBack={onBack}
      backLabel="Back from signature request"
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
            isDisabled={isInteractionLocked}
          />
        ) : undefined
      }
      outcome={
        <VStack align="stretch" spacing={3}>
          <RequestIdentity
            origin={origin}
            originHostname={originHostname}
            favicon={faviconUrl}
            iconChipBg={iconChipBg}
            originInitials={originInitials}
          />
          <SignatureSummary
            intent={intent}
            description={intentDescription}
            status={intentStatus}
          />
        </VStack>
      }
      context={readableDetails}
      contextTitle={readableDetailsTitle}
      contextHeaderAction={
        <RequestChainContext chainId={chainId} chainName={chainName} />
      }
      advancedDetails={
        advanced
      }
      actionSummary={actionSummary}
      actionNotice={actionNotice}
      confirmAction={confirmAction}
      rejectAction={rejectAction}
    />
  );
}
