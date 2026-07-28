"use client";

import { useEffect } from "react";
import { Box, Image, Link, Text, VStack } from "@chakra-ui/react";

const DISCORD_INVITE_URL = "https://discord.gg/ubqVKC5Efd";

export function DiscordRedirect() {
  useEffect(() => {
    window.location.replace(DISCORD_INVITE_URL);
  }, []);

  return (
    <Box
      minH="100vh"
      display="grid"
      placeItems="center"
      bg="#5865F2"
      color="white"
      px={6}
    >
      <VStack spacing={5} textAlign="center">
        <Image
          src="/images/walletchan-icon-nobg.png"
          alt="WalletChan"
          boxSize="112px"
          objectFit="contain"
        />
        <Text fontSize={{ base: "30px", md: "42px" }} fontWeight="800">
          Opening WalletChan Discord…
        </Text>
        <Link
          href={DISCORD_INVITE_URL}
          fontSize="16px"
          fontWeight="700"
          textDecoration="underline"
          _hover={{ color: "whiteAlpha.800" }}
        >
          Continue to Discord
        </Link>
      </VStack>
    </Box>
  );
}
