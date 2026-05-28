import { useState } from "react";
import type { ReactNode } from "react";
import {
  Badge,
  Box,
  Collapse,
  HStack,
  IconButton,
  Link,
  Text,
  VStack,
} from "@chakra-ui/react";
import { ChevronDownIcon, ExternalLinkIcon } from "@chakra-ui/icons";

import { CopyButton } from "@/components/CopyButton";
import ChainIcon from "@/components/ChainIcon";
import { FromAccountDisplay } from "@/components/FromAccountDisplay";
import { SiweValidationIssues } from "@/components/SiweValidationIssues";
import { getChainConfig } from "@/constants/chainConfig";
import type { SiweAnalysis } from "@/lib/siwe";
import { useTheme } from "@/theme";

interface SiweMessageDisplayProps {
  analysis: SiweAnalysis;
  connectedChainId: number;
  chainName: string;
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
        fontWeight="800"
        textTransform="uppercase"
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
          <Link href={`${explorer}/address/${address}`} isExternal>
            <IconButton
              aria-label="View SIWE account on explorer"
              icon={<ExternalLinkIcon boxSize="10px" />}
              size="xs"
              variant="ghost"
              minW="20px"
              h="20px"
              color="text.secondary"
              _hover={{ color: "accent.secondary", bg: "bg.muted" }}
            />
          </Link>
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
      <Text fontSize="xs" color="text.primary" fontWeight="800">
        {chainName}
      </Text>
    </HStack>
  );
}

export default function SiweMessageDisplay({
  analysis,
  connectedChainId,
  chainName,
}: SiweMessageDisplayProps) {
  const { tokens } = useTheme();
  const [rawOpen, setRawOpen] = useState(false);
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
            <HStack justify="space-between" align="start" spacing={3}>
              <VStack align="start" spacing={1} minW={0}>
                <Text
                  fontSize="lg"
                  fontWeight="900"
                  color="text.primary"
                  lineHeight="1.1"
                  wordBreak="break-word"
                >
                  Sign in to {displayDomain}
                </Text>
                <Text fontSize="xs" color="text.secondary" fontWeight="700">
                  {fields.statement || "Authenticate with your Ethereum account"}
                </Text>
              </VStack>
              <Badge
                bg={status.bg}
                color={status.color}
                border="1px solid"
                borderColor="border.default"
                fontSize="2xs"
                fontWeight="900"
                px={2}
                py={1}
                flexShrink={0}
              >
                {status.label}
              </Badge>
            </HStack>
          </Box>

          <DetailRow label="Site">
            <Text fontSize="xs" color="text.primary" fontWeight="800" wordBreak="break-word">
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
        border={tokens.borders.thin}
        borderColor="border.default"
        borderRadius="lg"
        overflow="hidden"
      >
        <HStack
          p={2}
          cursor="pointer"
          onClick={() => setRawOpen((open) => !open)}
          _hover={{ bg: "bg.muted" }}
        >
          <ChevronDownIcon
            transform={rawOpen ? "rotate(180deg)" : "rotate(0deg)"}
            transition="transform 0.15s ease"
            color="text.secondary"
          />
          <Text fontSize="xs" fontWeight="900" color="text.primary" textTransform="uppercase">
            Raw SIWE Message
          </Text>
          <Box flex="1" />
          <Box onClick={(event) => event.stopPropagation()}>
            <CopyButton value={analysis.rawMessage} />
          </Box>
        </HStack>
        <Collapse in={rawOpen} animateOpacity>
          <Box
            p={3}
            bg="status.info.bg"
            borderTop={tokens.borders.thin}
            borderColor="border.default"
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
