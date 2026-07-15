import { Box, Text, VStack } from "@chakra-ui/react";

import { SiweValidationIssues } from "@/components/SiweValidationIssues";
import { ListItem, ListItemActions, ListSurface } from "@/components/ui";
import type { SiweAnalysis } from "@/lib/siwe";

interface SiweMessageDisplayProps {
  analysis: SiweAnalysis;
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

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <ListItem density="compact" align="flex-start">
      <Text color="fg.secondary" fontSize="xs" fontWeight="600" flexShrink={0}>
        {label}
      </Text>
      <ListItemActions
        minW={0}
        maxW="68%"
        justifyContent="flex-end"
        textAlign="right"
      >
        {children}
      </ListItemActions>
    </ListItem>
  );
}

function DetailValue({
  children,
  mono = false,
}: {
  children: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <Text
      color="fg.primary"
      fontFamily={mono ? "mono" : "body"}
      fontSize="xs"
      fontWeight="600"
      overflowWrap="anywhere"
    >
      {children}
    </Text>
  );
}

export default function SiweMessageDisplay({
  analysis,
}: SiweMessageDisplayProps) {
  const fields = analysis.fields;

  return (
    <VStack align="stretch" spacing={3}>
      {fields.statement && (
        <Box
          p={3}
          bg="surface.raised"
          borderWidth="1px"
          borderColor="border.subtle"
          borderRadius="lg"
        >
          <Text color="fg.primary" fontSize="sm" lineHeight="1.5">
            {fields.statement}
          </Text>
        </Box>
      )}

      <ListSurface>
        {fields.uri && (
          <DetailRow label="URI">
            <DetailValue>{fields.uri}</DetailValue>
          </DetailRow>
        )}
        <DetailRow label="Issued">
          <DetailValue>{formatDate(fields.issuedAt)}</DetailValue>
        </DetailRow>
        <DetailRow label="Expires">
          <DetailValue>{formatDate(fields.expirationTime)}</DetailValue>
        </DetailRow>
        {fields.notBefore && (
          <DetailRow label="Valid after">
            <DetailValue>{formatDate(fields.notBefore)}</DetailValue>
          </DetailRow>
        )}
        {fields.requestId && (
          <DetailRow label="Request ID">
            <DetailValue mono>{fields.requestId}</DetailValue>
          </DetailRow>
        )}
        {fields.nonce && (
          <DetailRow label="Nonce">
            <DetailValue mono>{fields.nonce}</DetailValue>
          </DetailRow>
        )}
        {fields.resources && fields.resources.length > 0 && (
          <DetailRow label="Resources">
            <VStack align="end" spacing={1}>
              {fields.resources.map((resource, index) => (
                <DetailValue key={`${resource}-${index}`}>{resource}</DetailValue>
              ))}
            </VStack>
          </DetailRow>
        )}
      </ListSurface>

      <SiweValidationIssues analysis={analysis} />
    </VStack>
  );
}
