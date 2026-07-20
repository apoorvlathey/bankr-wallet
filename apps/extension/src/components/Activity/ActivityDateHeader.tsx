import { Box, Text } from "@chakra-ui/react";

export function ActivityDateHeader({ label }: { label: string }) {
  return (
    <Box
      as="li"
      role="presentation"
      minH="36px"
      px={3}
      py={2}
      listStyleType="none"
      bg="surface.sunken"
      borderTopWidth="1px"
      borderTopStyle="solid"
      borderTopColor="border.subtle"
      borderBottomWidth="1px"
      borderBottomStyle="solid"
      borderBottomColor="border.subtle"
      _first={{ borderTopWidth: 0 }}
    >
      <Text
        fontSize="xs"
        fontWeight="600"
        color="fg.secondary"
        lineHeight="1.4"
      >
        {label}
      </Text>
    </Box>
  );
}
