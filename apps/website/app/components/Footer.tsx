"use client";

import {
  Box,
  Container,
  Flex,
  HStack,
  VStack,
  Text,
  Link,
  IconButton,
  useClipboard,
  Image,
} from "@chakra-ui/react";
import { Copy, Check } from "lucide-react";
import { LogoShapes } from "./ui/GeometricShape";
import {
  TOKEN_ADDRESS,
  GITHUB_URL,
  TWITTER_URL,
  TELEGRAM_URL,
} from "../constants";
import { useSiteNav } from "../lib/useSiteNav";

// Custom X (Twitter) icon
function XIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function TelegramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

export function Footer() {
  const { hasCopied, onCopy } = useClipboard(TOKEN_ADDRESS);
  const truncatedAddress = `${TOKEN_ADDRESS.slice(0, 6)}...${TOKEN_ADDRESS.slice(-4)}`;
  const { href } = useSiteNav();

  const installHref = href("#install");

  return (
    <Box bg="bauhaus.black" py={{ base: 8, md: 16 }}>
      <Container maxW="7xl">
        <VStack spacing={{ base: 6, md: 8 }}>
          {/* Main Footer Content */}
          <Flex
            direction={{ base: "column", md: "row" }}
            justify="space-between"
            align={{ base: "center", md: "flex-start" }}
            w="full"
            gap={{ base: 6, md: 8 }}
          >
            {/* Logo and Tagline */}
            <VStack align={{ base: "center", md: "flex-start" }} spacing={3}>
              <HStack spacing={3}>
                <Image
                  border="4px solid"
                  borderColor="white"
                  src="/images/walletchan-animated.gif"
                  alt="WalletChan"
                  w="32px"
                  h="32px"
                />
                <Text
                  color="white"
                  fontWeight="black"
                  fontSize="xl"
                  textTransform="uppercase"
                >
                  WALLETCHAN
                </Text>
              </HStack>
              <Text
                color="whiteAlpha.700"
                maxW="300px"
                fontSize="sm"
                textAlign={{ base: "center", md: "left" }}
              >
                The Wallet for AI Era
              </Text>

              {/* Contract Address */}
              <HStack>
                <Text color="whiteAlpha.500" fontSize="xs">
                  Contract:
                </Text>
                <Text color="whiteAlpha.700" fontFamily="mono" fontSize="xs">
                  {truncatedAddress}
                </Text>
                <IconButton
                  aria-label="Copy address"
                  icon={hasCopied ? <Check size={14} /> : <Copy size={14} />}
                  size="xs"
                  variant="ghost"
                  color="whiteAlpha.700"
                  onClick={onCopy}
                  _hover={{ color: "white", bg: "whiteAlpha.200" }}
                />
              </HStack>
            </VStack>

            {/* Links - Horizontal on mobile, vertical on desktop */}
            <VStack
              align={{ base: "center", md: "flex-start" }}
              spacing={3}
              display={{ base: "none", md: "flex" }}
            >
              <Text
                color="white"
                fontWeight="bold"
                textTransform="uppercase"
                fontSize="sm"
                letterSpacing="wider"
              >
                Links
              </Text>
              <Link
                href={GITHUB_URL}
                target="_blank"
                color="whiteAlpha.700"
                fontSize="sm"
                _hover={{ color: "bauhaus.yellow" }}
              >
                GitHub
              </Link>
              <Link
                href={installHref}
                color="whiteAlpha.700"
                fontSize="sm"
                _hover={{ color: "bauhaus.yellow" }}
              >
                Install
              </Link>
            </VStack>

            {/* Mobile Links - Horizontal row */}
            <HStack
              spacing={4}
              display={{ base: "flex", md: "none" }}
              flexWrap="wrap"
              justify="center"
            >
              <Link
                href={GITHUB_URL}
                target="_blank"
                color="whiteAlpha.700"
                fontSize="sm"
                _hover={{ color: "bauhaus.yellow" }}
              >
                GitHub
              </Link>
              <Text color="whiteAlpha.300">•</Text>
              <Link
                href={installHref}
                color="whiteAlpha.700"
                fontSize="sm"
                _hover={{ color: "bauhaus.yellow" }}
              >
                Install
              </Link>
            </HStack>

            {/* Social - Desktop only as separate column */}
            <VStack
              align={{ base: "center", md: "flex-start" }}
              spacing={3}
              display={{ base: "none", md: "flex" }}
            >
              <Text
                color="white"
                fontWeight="bold"
                textTransform="uppercase"
                fontSize="sm"
                letterSpacing="wider"
              >
                Social
              </Text>
              <Link
                href={TWITTER_URL}
                target="_blank"
                display="flex"
                alignItems="center"
                gap={2}
                color="whiteAlpha.700"
                fontSize="sm"
                _hover={{ color: "bauhaus.yellow" }}
              >
                <XIcon size={16} />
                @walletchan_
              </Link>
              <Link
                href={TELEGRAM_URL}
                target="_blank"
                display="flex"
                alignItems="center"
                gap={2}
                color="whiteAlpha.700"
                fontSize="sm"
                _hover={{ color: "bauhaus.yellow" }}
              >
                <TelegramIcon size={16} />
                Telegram
              </Link>
            </VStack>
          </Flex>

          {/* Divider */}
          <Box w="full" h="2px" bg="whiteAlpha.200" />

          {/* Bottom Bar */}
          <Flex
            direction="row"
            justify={{ base: "center", md: "space-between" }}
            align="center"
            w="full"
            gap={4}
          >
            <Text color="whiteAlpha.500" fontSize="sm">
              Built by{" "}
              <Link
                href="https://x.com/apoorveth"
                target="_blank"
                color="bauhaus.yellow"
                fontWeight="bold"
                _hover={{ textDecoration: "underline" }}
              >
                @apoorveth
              </Link>
            </Text>

            <HStack spacing={2}>
              <LogoShapes size="10px" />
            </HStack>

            <Text
              color="whiteAlpha.500"
              fontSize="sm"
              display={{ base: "none", md: "block" }}
            >
              © {new Date().getFullYear()} WalletChan
            </Text>
          </Flex>
        </VStack>
      </Container>
    </Box>
  );
}
