import { Box, Button, HStack, Text, VStack } from "@chakra-ui/react";

function PlayBadge() {
  return (
    <Box
      position="relative"
      boxSize="38px"
      border="3px solid"
      borderColor="bauhaus.black"
      bg="bauhaus.white"
      flexShrink={0}
      display="flex"
      alignItems="center"
      justifyContent="center"
      boxShadow="3px 3px 0px 0px #121212"
    >
      <Box
        as="span"
        w="0"
        h="0"
        borderTop="8px solid transparent"
        borderBottom="8px solid transparent"
        borderLeft="13px solid"
        borderLeftColor="bauhaus.black"
        ml="3px"
      />
    </Box>
  );
}

export default function GasFeeWaiverBanner() {
  return (
    <Box
      bg="rgba(16, 64, 192, 0.08)"
      border="3px solid"
      borderColor="bauhaus.black"
      boxShadow="4px 4px 0px 0px #121212"
      p={3}
      position="relative"
      overflow="hidden"
    >
      <Box
        position="absolute"
        top="-18px"
        right="-14px"
        boxSize="68px"
        borderRadius="full"
        bg="rgba(240, 192, 32, 0.28)"
        border="2px solid"
        borderColor="bauhaus.black"
      />
      <HStack spacing={3} align="center" position="relative">
        <PlayBadge />
        <VStack align="start" spacing={0} flex={1} minW={0}>
          <Text
            fontSize="sm"
            fontWeight="800"
            color="text.primary"
            lineHeight="1.15"
          >
            Watch 1hr of Milady Mandate
          </Text>
          <Text
            fontSize="xs"
            fontWeight="700"
            color="text.secondary"
            lineHeight="1.15"
          >
            to waive this gas fee.
          </Text>
        </VStack>
        <Button
          size="sm"
          bg="bauhaus.blue"
          color="bauhaus.white"
          border="2px solid"
          borderColor="bauhaus.black"
          borderRadius="full"
          boxShadow="3px 3px 0px 0px #121212"
          fontSize="xs"
          fontWeight="900"
          textTransform="uppercase"
          letterSpacing="0.06em"
          px={4}
          minH="34px"
          _hover={{ bg: "#0c3298" }}
          _active={{
            transform: "translate(2px, 2px)",
            boxShadow: "none",
          }}
        >
          Watch Now
        </Button>
      </HStack>
    </Box>
  );
}
