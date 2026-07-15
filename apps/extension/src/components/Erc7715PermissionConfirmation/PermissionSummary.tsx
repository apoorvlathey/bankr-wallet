import { Badge, Text, VStack } from "@chakra-ui/react";

export function PermissionSummary({
  title,
  description,
  canGrant,
}: {
  title: string;
  description: string;
  canGrant: boolean;
}) {
  return (
    <VStack as="section" aria-label="Permission summary" spacing={1.5} px={2}>
      <Text
        color="fg.primary"
        fontSize="lg"
        fontWeight="700"
        lineHeight="1.3"
        textAlign="center"
        overflowWrap="anywhere"
      >
        {title}
      </Text>
      <Text
        maxW="310px"
        color="fg.secondary"
        fontSize="sm"
        lineHeight="1.45"
        textAlign="center"
      >
        {description}
      </Text>
      {!canGrant && <Badge variant="warning">Local accounts only</Badge>}
    </VStack>
  );
}
