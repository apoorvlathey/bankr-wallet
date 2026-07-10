import {
  Badge,
  Box,
  Button,
  Code,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  IconButton,
  Image,
  Input,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ChevronLeftIcon, ChevronRightIcon } from "@chakra-ui/icons";
import type { ReactNode } from "react";

import {
  ConfirmationScreen,
  InlineDisclosure,
  ListItem,
  ListItemActions,
  ListSurface,
  OutcomeCard,
} from "@/components/ui";
import { useIconChipBg, useStripTokens } from "@/theme";

interface SignatureQueueProps {
  currentIndex: number;
  totalCount: number;
  onNavigate: (direction: "prev" | "next") => void;
  onRejectAll: () => void;
}

interface SignatureContextProps {
  originHostname: string;
  faviconUrl: string;
  fallbackFaviconUrl: string;
  account?: ReactNode;
  network: ReactNode;
  methodName: string;
}

interface UnsafeSiweAcknowledgementProps {
  isOpen: boolean;
  value: string;
  blockingError: string;
  isValid: boolean;
  isDisabled: boolean;
  onOpenChange: (open: boolean) => void;
  onValueChange: (value: string) => void;
}

export interface SignatureConfirmationScreenProps {
  onBack: () => void;
  intent: string;
  intentContext: ReactNode;
  faviconUrl: string;
  fallbackFaviconUrl: string;
  intentStatus?: ReactNode;
  queue: SignatureQueueProps;
  requestContext: SignatureContextProps;
  readableDetails?: ReactNode;
  readableDetailsTitle?: string;
  advancedDetails?: ReactNode;
  unsafeSiweAcknowledgement?: UnsafeSiweAcknowledgementProps;
  confirmAction: ReactNode;
  rejectAction?: ReactNode;
}

function OriginIcon({
  src,
  fallbackSrc,
  size = "28px",
}: {
  src: string;
  fallbackSrc: string;
  size?: string;
}) {
  const iconChipBg = useIconChipBg();

  return (
    <Box
      boxSize={`calc(${size} + 8px)`}
      p={1}
      display="flex"
      alignItems="center"
      justifyContent="center"
      flexShrink={0}
      bg={iconChipBg}
      borderWidth="1px"
      borderColor="border.subtle"
      borderRadius="md"
    >
      <Image
        src={src}
        alt=""
        boxSize={size}
        objectFit="contain"
        onError={(event) => {
          const target = event.currentTarget;
          if (target.src !== fallbackSrc) target.src = fallbackSrc;
        }}
        fallback={<Box boxSize={size} bg="surface.raisedHover" borderRadius="sm" />}
      />
    </Box>
  );
}

function SignatureQueue({
  currentIndex,
  totalCount,
  onNavigate,
  onRejectAll,
}: SignatureQueueProps) {
  const { bg, fg } = useStripTokens();

  if (totalCount <= 1) return null;

  return (
    <HStack justify="space-between" gap={3}>
      <HStack spacing={1}>
        <IconButton
          aria-label="Previous signature request"
          icon={<ChevronLeftIcon boxSize={5} />}
          variant="ghost"
          onClick={() => onNavigate("prev")}
          isDisabled={currentIndex === 0}
        />
        <Badge bg={bg} color={fg} px={2.5} py={1} fontSize="xs" fontWeight="600">
          {currentIndex + 1} of {totalCount}
        </Badge>
        <IconButton
          aria-label="Next signature request"
          icon={<ChevronRightIcon boxSize={5} />}
          variant="ghost"
          onClick={() => onNavigate("next")}
          isDisabled={currentIndex + 1 === totalCount}
        />
      </HStack>
      <Button
        variant="link"
        size="sm"
        color="chart.negative"
        onClick={onRejectAll}
      >
        Reject all
      </Button>
    </HStack>
  );
}

function ContextRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <ListItem density="compact" align="flex-start">
      <Text
        flex="0 0 72px"
        pt={1}
        color="fg.secondary"
        fontSize="sm"
        fontWeight="500"
      >
        {label}
      </Text>
      <ListItemActions
        flex="1 1 auto"
        minW={0}
        maxW="calc(100% - 84px)"
        minH="28px"
        justifyContent="flex-end"
        textAlign="right"
      >
        {children}
      </ListItemActions>
    </ListItem>
  );
}

function SignatureRequestContext({
  originHostname,
  faviconUrl,
  fallbackFaviconUrl,
  account,
  network,
  methodName,
}: SignatureContextProps) {
  return (
    <ListSurface>
      <ContextRow label="Site">
        <HStack spacing={2} minW={0} justify="flex-end">
          <OriginIcon src={faviconUrl} fallbackSrc={fallbackFaviconUrl} size="16px" />
          <Text color="fg.primary" fontSize="sm" fontWeight="600" overflowWrap="anywhere">
            {originHostname}
          </Text>
        </HStack>
      </ContextRow>
      {account && <ContextRow label="Account">{account}</ContextRow>}
      <ContextRow label="Network">{network}</ContextRow>
      <ContextRow label="Request type">
        <Code
          px={2}
          py={1}
          color="fg.primary"
          bg="surface.sunken"
          borderWidth="1px"
          borderColor="border.subtle"
          borderRadius="md"
          fontFamily="mono"
          fontSize="xs"
          overflowWrap="anywhere"
          whiteSpace="normal"
        >
          {methodName}
        </Code>
      </ContextRow>
    </ListSurface>
  );
}

function UnsafeSiweAcknowledgement({
  isOpen,
  value,
  blockingError,
  isValid,
  isDisabled,
  onOpenChange,
  onValueChange,
}: UnsafeSiweAcknowledgementProps) {
  const hasInvalidEntry = value.length > 0 && !isValid;

  return (
    <Box
      role="alert"
      px={3}
      bg="status.warning.tint"
      borderWidth="1px"
      borderColor="status.warning.border"
      borderRadius="lg"
    >
      <InlineDisclosure
        label="Sign despite the validation warning"
        description="Only continue if you independently verified the site, account, and network."
        open={isOpen}
        onOpenChange={(open) => {
          if (!isDisabled) onOpenChange(open);
        }}
        borderTopWidth={0}
        aria-disabled={isDisabled || undefined}
      >
        <VStack align="stretch" spacing={3} pt={1}>
          <Text color="status.warning.fg" fontSize="sm" lineHeight="1.45">
            {blockingError}
          </Text>
          <FormControl isInvalid={hasInvalidEntry} isDisabled={isDisabled}>
            <FormLabel mb={1.5} color="fg.primary" fontSize="sm">
              Confirmation phrase
            </FormLabel>
            <Input
              value={value}
              onChange={(event) => onValueChange(event.target.value)}
              placeholder='Type "I understand"'
              autoComplete="off"
              spellCheck={false}
              aria-describedby={
                hasInvalidEntry ? "unsafe-siwe-error" : "unsafe-siwe-help"
              }
            />
            {hasInvalidEntry ? (
              <FormErrorMessage id="unsafe-siwe-error">
                Enter the exact phrase “I understand”.
              </FormErrorMessage>
            ) : (
              <FormHelperText id="unsafe-siwe-help" color="fg.secondary">
                This acknowledgement is required before signing.
              </FormHelperText>
            )}
          </FormControl>
        </VStack>
      </InlineDisclosure>
    </Box>
  );
}

export function SignatureConfirmationScreen({
  onBack,
  intent,
  intentContext,
  faviconUrl,
  fallbackFaviconUrl,
  intentStatus,
  queue,
  requestContext,
  readableDetails,
  readableDetailsTitle = "What you're signing",
  advancedDetails,
  unsafeSiweAcknowledgement,
  confirmAction,
  rejectAction,
}: SignatureConfirmationScreenProps) {
  const advanced = advancedDetails || unsafeSiweAcknowledgement ? (
    <VStack align="stretch" spacing={4}>
      {advancedDetails && (
        <InlineDisclosure
          label="Advanced signature data"
          description="Review the exact schema, digest, message, and raw JSON."
        >
          <VStack align="stretch" spacing={4} pt={2}>
            {advancedDetails}
          </VStack>
        </InlineDisclosure>
      )}
      {unsafeSiweAcknowledgement && (
        <UnsafeSiweAcknowledgement {...unsafeSiweAcknowledgement} />
      )}
    </VStack>
  ) : undefined;

  return (
    <ConfirmationScreen
      title="Review signature"
      onBack={onBack}
      backLabel="Back from signature request"
      outcome={
        <VStack align="stretch" spacing={3}>
          <OutcomeCard
            label="Requested action"
            outcome={intent}
            context={intentContext}
            status={intentStatus}
            media={<OriginIcon src={faviconUrl} fallbackSrc={fallbackFaviconUrl} />}
          />
          <SignatureQueue {...queue} />
        </VStack>
      }
      financialImpact={readableDetails}
      financialImpactTitle={readableDetailsTitle}
      context={<SignatureRequestContext {...requestContext} />}
      contextTitle="Request details"
      advancedDetails={advanced}
      confirmAction={confirmAction}
      rejectAction={rejectAction}
    />
  );
}
