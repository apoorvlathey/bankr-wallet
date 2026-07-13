import { useState } from "react";
import type { ReactNode } from "react";
import {
  Badge,
  Box,
  Collapse,
  HStack,
  IconButton,
  Button,
  Text,
  VStack,
  usePrefersReducedMotion,
} from "@chakra-ui/react";
import { ChevronDownIcon, ExternalLinkIcon } from "@chakra-ui/icons";

import { CopyButton } from "@/components/CopyButton";
import ChainIcon from "@/components/ChainIcon";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import { SiweValidationIssues } from "@/components/SiweValidationIssues";
import SafeImage from "@/components/SafeImage";
import { getChainConfig } from "@/constants/chainConfig";
import type { SiweAnalysis } from "@/lib/siwe";
import { useTheme } from "@/theme";

interface SiweMessageDisplayProps {
  analysis: SiweAnalysis;
  connectedChainId: number;
  chainName: string;
  faviconUrl?: string | null;
  fallbackFaviconUrl?: string;
}

function formatDate(value?: string): string {
  if (!value) return "Not provided";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function getStatusLabel(analysis: SiweAnalysis): {
  label: string;
  bg: string;
  color: string;
} {
  if (analysis.errors.length > 0) {
    return { label: "Invalid SIWE", bg: "status.error.bg", color: "status.error.fg" };
  }
  if (analysis.warnings.length > 0) {
    return { label: `${analysis.warnings.length} Warning${analysis.warnings.length > 1 ? "s" : ""}`, bg: "status.warning.bg", color: "status.warning.fg" };
  }
  return { label: "Valid SIWE", bg: "status.success.bg", color: "status.success.fg" };
}

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <HStack
      w="full"
      py={2}
      px={3}
      justify="space-between"
      align="start"
      borderTop="1px solid"
      borderColor="border.subtle"
      gap={3}
    >
      <Text
        fontSize="xs"
        color="text.secondary"
        fontWeight="600"
        flexShrink={0}
      >
        {label}
      </Text>
      <Box textAlign="right" minW={0}>
        {children}
      </Box>
    </HStack>
  );
}

function AccountWithActions({
  address,
  chainId,
}: {
  address: string;
  chainId: number;
}) {
  const explorer = getChainConfig(chainId).explorer;

  return (
    <HStack spacing={1} justify="flex-end" flexWrap="wrap" minW={0}>
      <Box minW={0} maxW="185px">
        <FromAccountDisplay address={address} />
      </Box>
      <HStack spacing={0} flexShrink={0}>
        <CopyButton value={address} />
        {explorer && (
          <IconButton
            as="a"
            href={`${explorer}/address/${address}`}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="View SIWE account on explorer"
            icon={<ExternalLinkIcon boxSize="10px" />}
            size="xs"
            variant="ghost"
            minW="24px"
            w="24px"
            h="24px"
            color="text.secondary"
            _hover={{ color: "accent.secondary", bg: "bg.muted" }}
          />
        )}
      </HStack>
    </HStack>
  );
}

function ChainValue({
  chainId,
  chainName,
}: {
  chainId: number;
  chainName: string;
}) {
  return (
    <HStack spacing={1.5} justify="flex-end">
      <ChainIcon chainId={chainId} chainName={chainName} size="16px" withChip />
      <Text fontSize="xs" color="text.primary" fontWeight="600">
        {chainName}
      </Text>
    </HStack>
  );
}

export default function SiweMessageDisplay({
  analysis,
  connectedChainId,
  chainName,
  faviconUrl,
  fallbackFaviconUrl,
}: SiweMessageDisplayProps) {
  const { tokens } = useTheme();
  const [rawOpen, setRawOpen] = useState(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const status = getStatusLabel(analysis);
  const fields = analysis.fields;
  const displayDomain = fields.domain || analysis.originHost || "Unknown site";
  const parsedChainId = Number(fields.chainId);
  const siweChainId =
    fields.chainId && Number.isSafeInteger(parsedChainId) && parsedChainId > 0
      ? parsedChainId
      : connectedChainId;
  const siweChainName =
    siweChainId === connectedChainId
      ? chainName
      : `Chain ${fields.chainId || "unknown"}`;

  return (
    <VStack align="stretch" spacing={2}>
      <Box
        bg="surface.raised"
        border={tokens.borders.thin}
        borderColor="border.default"
        borderRadius="lg"
        boxShadow="card"
        overflow="hidden"
      >
        <VStack spacing={0} align="stretch">
          <Box p={3}>
            <VStack align="stretch" spacing={2}>
              <HStack justify="space-between" align="start" spacing={3}>
                <HStack align="start" spacing={2.5} minW={0} flex="1">
                  {faviconUrl && (
                    <Box
                      bg="whiteAlpha.900"
                      border="1.5px solid"
                      borderColor="border.subtle"
                      borderRadius="md"
                      p={1}
                      display="flex"
                      alignItems="center"
                      justifyContent="center"
                      flexShrink={0}
                    >
                      <SafeImage
                        src={faviconUrl}
                        fallbackSrc={fallbackFaviconUrl}
                        alt=""
                        boxSize="20px"
                        fallback={<Box boxSize="20px" bg="surface.sunken" borderRadius="sm" />}
                      />
                    </Box>
                  )}
                  <Text
                    fontSize="lg"
                    fontWeight="700"
                    color="text.primary"
                    lineHeight="1.1"
                    wordBreak="break-word"
                    minW={0}
                  >
                    Sign in to {displayDomain}
                  </Text>
                </HStack>
                <Badge
                  bg={status.bg}
                  color={status.color}
                  border="1px solid"
                  borderColor="border.default"
                  fontSize="2xs"
                  fontWeight="700"
                  px={2}
                  py={1}
                  flexShrink={0}
                >
                  {status.label}
                </Badge>
              </HStack>
              <Text
                fontSize="xs"
                color="text.secondary"
                fontWeight="700"
                lineHeight="short"
                wordBreak="break-word"
              >
                {fields.statement || "Authenticate with your Ethereum account"}
              </Text>
            </VStack>
          </Box>

          <DetailRow label="Site">
            <Text fontSize="xs" color="text.primary" fontWeight="600" wordBreak="break-word">
              {displayDomain}
            </Text>
            {analysis.originHost && analysis.originHost !== displayDomain.toLowerCase() && (
              <Text fontSize="2xs" color="text.secondary" fontWeight="700">
                Connected from {analysis.originHost}
              </Text>
            )}
          </DetailRow>

          {fields.address && (
            <DetailRow label="Account">
              <AccountWithActions address={fields.address} chainId={siweChainId} />
            </DetailRow>
          )}

          <DetailRow label="Chain">
            <ChainValue chainId={siweChainId} chainName={siweChainName} />
          </DetailRow>

          {fields.uri && (
            <DetailRow label="URI">
              <Text fontSize="xs" color="text.primary" fontWeight="700" wordBreak="break-word">
                {fields.uri}
              </Text>
            </DetailRow>
          )}

          <DetailRow label="Issued">
            <Text fontSize="xs" color="text.primary" fontWeight="700">
              {formatDate(fields.issuedAt)}
            </Text>
          </DetailRow>

          <DetailRow label="Expires">
            <Text fontSize="xs" color="text.primary" fontWeight="700">
              {formatDate(fields.expirationTime)}
            </Text>
          </DetailRow>

          {fields.notBefore && (
            <DetailRow label="Valid After">
              <Text fontSize="xs" color="text.primary" fontWeight="700">
                {formatDate(fields.notBefore)}
              </Text>
            </DetailRow>
          )}

          {fields.requestId && (
            <DetailRow label="Request ID">
              <Text fontSize="xs" color="text.primary" fontFamily="mono" fontWeight="700" wordBreak="break-all">
                {fields.requestId}
              </Text>
            </DetailRow>
          )}

          {fields.nonce && (
            <DetailRow label="Nonce">
              <Text fontSize="xs" color="text.primary" fontFamily="mono" fontWeight="700" wordBreak="break-all">
                {fields.nonce}
              </Text>
            </DetailRow>
          )}

          {fields.resources && fields.resources.length > 0 && (
            <DetailRow label="Resources">
              <VStack align="end" spacing={1}>
                {fields.resources.map((resource, index) => (
                  <Text
                    key={`${resource}-${index}`}
                    fontSize="xs"
                    color="text.primary"
                    fontWeight="700"
                    wordBreak="break-word"
                  >
                    {resource}
                  </Text>
                ))}
              </VStack>
            </DetailRow>
          )}
        </VStack>
      </Box>

      <SiweValidationIssues analysis={analysis} />

      <Box
        bg="surface.raised"
        border="1px solid"
        borderColor="border.default"
        borderRadius="lg"
        overflow="hidden"
      >
        <HStack spacing={1} pr={2}>
          <Button
            type="button"
            variant="unstyled"
            display="flex"
            flex={1}
            minH="44px"
            h="auto"
            px={2}
            justifyContent="flex-start"
            gap={2}
            onClick={() => setRawOpen((open) => !open)}
            aria-expanded={rawOpen}
            aria-controls="raw-siwe-message"
            borderRadius={0}
            fontWeight="inherit"
            textTransform="none"
            _hover={{ bg: "surface.raisedHover" }}
          >
            <ChevronDownIcon
              transform={rawOpen ? "rotate(180deg)" : "rotate(0deg)"}
              transition={prefersReducedMotion ? "none" : "transform 150ms cubic-bezier(0.23, 1, 0.32, 1)"}
              color="text.secondary"
              aria-hidden
            />
            <Text fontSize="xs" fontWeight="600" color="text.primary">
              Raw SIWE message
            </Text>
          </Button>
          <CopyButton value={analysis.rawMessage} />
        </HStack>
        <Collapse id="raw-siwe-message" in={rawOpen} animateOpacity={!prefersReducedMotion}>
          <Box
            p={3}
            bg="status.info.bg"
            borderTop="1px solid"
            borderColor="border.subtle"
            maxH="180px"
            overflowY="auto"
          >
            <Text
              fontSize="xs"
              fontFamily="mono"
              color="text.primary"
              whiteSpace="pre-wrap"
              wordBreak="break-word"
            >
              {analysis.rawMessage}
            </Text>
          </Box>
        </Collapse>
      </Box>
    </VStack>
  );
}
