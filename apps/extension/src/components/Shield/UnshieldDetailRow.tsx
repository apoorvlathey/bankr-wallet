import type { ReactNode } from "react";
import { InfoOutlineIcon } from "@chakra-ui/icons";
import { Box, HStack, Text } from "@chakra-ui/react";

import { ListItem } from "@/components/ui";

export default function UnshieldDetailRow({
  label,
  value,
  errorDetail,
}: {
  label: string;
  value: ReactNode;
  errorDetail?: string;
}) {
  return (
    <ListItem
      density="compact"
      align={errorDetail ? "flex-start" : "center"}
      bg={errorDetail ? "status.error.bg" : undefined}
      py={2.5}
    >
      <Box minW={0} flex="1">
        <HStack spacing={1.5} align="center">
          {errorDetail ? (
            <InfoOutlineIcon
              boxSize="12px"
              color="status.error.fg"
              flexShrink={0}
              aria-hidden
            />
          ) : null}
          <Text
            as="span"
            color={errorDetail ? "status.error.fg" : "fg.secondary"}
            fontSize="xs"
            fontWeight={errorDetail ? "600" : "500"}
            lineHeight="short"
          >
            {label}
          </Text>
        </HStack>
        {errorDetail ? (
          <Text
            mt={1}
            color="status.error.fg"
            fontSize="2xs"
            fontWeight="600"
            lineHeight="short"
          >
            {errorDetail}
          </Text>
        ) : null}
      </Box>
      <Box
        minW={0}
        maxW="58%"
        color={errorDetail ? "status.error.fg" : "fg.primary"}
        fontSize="sm"
        fontWeight="600"
        lineHeight="short"
        textAlign="right"
        sx={{ fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </Box>
    </ListItem>
  );
}
