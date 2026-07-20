import { Box, Spinner } from "@chakra-ui/react";

export default function LoadingFallback() {
  return (
    <Box
      minH="200px"
      display="flex"
      alignItems="center"
      justifyContent="center"
      bg="bg.base"
    >
      <Spinner size="lg" color="accent.secondary" thickness="3px" />
    </Box>
  );
}
