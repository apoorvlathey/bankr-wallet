import { CheckCircleIcon, WarningTwoIcon } from "@chakra-ui/icons";
import { HStack, Text, VStack } from "@chakra-ui/react";

import type { SiweAnalysis, SiweIssue } from "@/lib/siwe";

function IssueRow({ issue }: { issue: SiweIssue }) {
  const isError = issue.severity === "error";

  return (
    <HStack
      align="start"
      spacing={2}
      p={2}
      bg={isError ? "status.error.bg" : "status.warning.bg"}
      border="1px solid"
      borderColor={isError ? "status.error.border" : "status.warning.border"}
      borderRadius="md"
    >
      <WarningTwoIcon
        color={isError ? "status.error.fg" : "status.warning.fg"}
        mt={0.5}
        flexShrink={0}
      />
      <VStack align="start" spacing={0} minW={0}>
        <Text
          fontSize="xs"
          fontWeight="800"
          color={isError ? "status.error.fg" : "status.warning.fg"}
        >
          {issue.message}
        </Text>
        {issue.suggestion && (
          <Text
            fontSize="2xs"
            color={isError ? "status.error.fg" : "status.warning.fg"}
            opacity={0.85}
          >
            {issue.suggestion}
          </Text>
        )}
      </VStack>
    </HStack>
  );
}

export function SiweValidationIssues({
  analysis,
}: {
  analysis: SiweAnalysis;
}) {
  const visibleIssues = [...analysis.errors, ...analysis.warnings].slice(0, 4);
  const hiddenCount =
    analysis.errors.length + analysis.warnings.length - visibleIssues.length;

  if (visibleIssues.length === 0) {
    return (
      <HStack
        p={2}
        bg="status.success.bg"
        border="1px solid"
        borderColor="status.success.border"
        borderRadius="md"
        spacing={2}
      >
        <CheckCircleIcon color="status.success.fg" />
        <Text fontSize="xs" fontWeight="800" color="status.success.fg">
          SIWE message matches the connected site, chain, and account.
        </Text>
      </HStack>
    );
  }

  return (
    <VStack align="stretch" spacing={1.5}>
      {visibleIssues.map((issue) => (
        <IssueRow key={`${issue.code}-${issue.field}-${issue.line}`} issue={issue} />
      ))}
      {hiddenCount > 0 && (
        <Text fontSize="2xs" color="text.secondary" fontWeight="700">
          {hiddenCount} more validation issue{hiddenCount > 1 ? "s" : ""}
        </Text>
      )}
    </VStack>
  );
}
