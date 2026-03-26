"use client";

import {
  Box,
  Container,
  Flex,
  HStack,
  Link,
  Button,
  IconButton,
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  VStack,
  useDisclosure,
  Image,
} from "@chakra-ui/react";
import { keyframes } from "@emotion/react";
import { Menu } from "lucide-react";
import { LogoShapes } from "./ui/GeometricShape";
import { CHROME_STORE_URL, TELEGRAM_URL } from "../constants";
import { useVaultData } from "../contexts/VaultDataContext";
import { useSiteNav } from "../lib/useSiteNav";

const revolveBorder = keyframes`
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
`;

const navLinks = [
  { label: "Token", href: "#token" },
  { label: "OS", href: "/os" },
  { label: "Stake", href: "/stake" },
  { label: "Install", href: "#install" },
  { label: "Roadmap", href: "/roadmap" },
];

function TelegramIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

export function Navigation() {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { vaultData } = useVaultData();
  const { href: resolveHref, homeHref, isOnPage } = useSiteNav();

  const isOnOs = isOnPage("/os");

  return (
    <Box
      as="nav"
      bg="bauhaus.background"
      borderBottom="4px solid"
      borderColor="bauhaus.black"
    >
      <Container maxW="7xl" py={4}>
        <Flex justify="space-between" align="center">
          {/* Logo */}
          <Link href={homeHref} _hover={{ textDecoration: "none" }}>
            <HStack spacing={3}>
              <Image
                src="/images/walletchan-icon-nobg.png"
                alt="WalletChan"
                w="40px"
                h="40px"
              />
              <Box
                fontWeight="black"
                fontSize="xl"
                textTransform="uppercase"
                letterSpacing="tight"
              >
                WALLETCHAN
              </Box>
            </HStack>
          </Link>

          {/* Desktop Navigation */}
          <HStack spacing={8} display={{ base: "none", md: "flex" }}>
            {navLinks.map((link) =>
              link.label === "OS" ? (
                <Box
                  key={link.label}
                  position="relative"
                  p="2px"
                  overflow="hidden"
                  borderRadius="4px"
                >
                  {/* Revolving conic gradient border (static on /os) */}
                  <Box
                    position="absolute"
                    inset={isOnOs ? "0" : "-50%"}
                    bg={
                      isOnOs
                        ? "bauhaus.yellow"
                        : "conic-gradient(from 0deg, #F0C020, #FFE066, #F5A800, #F0C020)"
                    }
                    animation={
                      isOnOs
                        ? undefined
                        : `${revolveBorder} 2s linear infinite`
                    }
                  />
                  <Link
                    href={resolveHref(link.href)}
                    fontWeight="bold"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    fontSize="sm"
                    position="relative"
                    display="block"
                    bg="bauhaus.background"
                    px={3}
                    py={1}
                    borderRadius="2px"
                    _hover={{ color: "bauhaus.red" }}
                  >
                    {link.label}
                  </Link>
                </Box>
              ) : link.label === "Stake" ? (
                <Box key={link.label} position="relative">
                  {vaultData && vaultData.totalApy > 0 && (
                    <Box
                      position="absolute"
                      bottom="100%"
                      left="50%"
                      mb="-2px"
                      bg="bauhaus.yellow"
                      border="1.5px solid"
                      borderColor="bauhaus.black"
                      px={1.5}
                      py={0}
                      lineHeight="1.3"
                      whiteSpace="nowrap"
                    >
                      <Box
                        fontSize="8px"
                        fontWeight="900"
                        color="bauhaus.black"
                        letterSpacing="wide"
                      >
                        {vaultData.totalApy.toFixed(1)}% APY
                      </Box>
                    </Box>
                  )}
                  <Link
                    href={resolveHref(link.href)}
                    fontWeight="bold"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    fontSize="sm"
                    _hover={{ color: "bauhaus.red" }}
                  >
                    {link.label}
                  </Link>
                </Box>
              ) : (
                <Link
                  key={link.label}
                  href={resolveHref(link.href)}
                  fontWeight="bold"
                  textTransform="uppercase"
                  letterSpacing="wider"
                  fontSize="sm"
                  _hover={{ color: "bauhaus.red" }}
                >
                  {link.label}
                </Link>
              )
            )}
          </HStack>

          {/* CTA Button */}
          <HStack spacing={4}>
            <Button
              variant="primary"
              size="md"
              as="a"
              href={CHROME_STORE_URL}
              target="_blank"
              display={{ base: "none", md: "flex" }}
            >
              Add to Chrome
            </Button>
            <IconButton
              as="a"
              href={TELEGRAM_URL}
              target="_blank"
              aria-label="Telegram"
              icon={<TelegramIcon size={18} />}
              variant="secondary"
              size="sm"
              minW="36px"
              h="36px"
              display={{ base: "none", md: "flex" }}
            />

            {/* Mobile Menu Button */}
            <IconButton
              aria-label="Open menu"
              icon={<Menu size={24} />}
              variant="ghost"
              display={{ base: "flex", md: "none" }}
              onClick={onOpen}
            />
          </HStack>
        </Flex>
      </Container>

      {/* Mobile Drawer */}
      <Drawer isOpen={isOpen} placement="right" onClose={onClose} size="full">
        <DrawerOverlay />
        <DrawerContent bg="bauhaus.black">
          <DrawerCloseButton color="white" size="lg" />
          <DrawerHeader>
            <HStack spacing={2}>
              <LogoShapes size="12px" />
              <Box
                color="white"
                fontWeight="black"
                textTransform="uppercase"
                ml={2}
              >
                WALLETCHAN
              </Box>
            </HStack>
          </DrawerHeader>
          <DrawerBody>
            <VStack spacing={8} align="flex-start" mt={8}>
              {navLinks.map((link) =>
                link.label === "OS" ? (
                  <Box
                    key={link.label}
                    position="relative"
                    p="2px"
                    overflow="hidden"
                    borderRadius="4px"
                  >
                    <Box
                      position="absolute"
                      inset={isOnOs ? "0" : "-50%"}
                      bg={
                        isOnOs
                          ? "bauhaus.yellow"
                          : "conic-gradient(from 0deg, #F0C020, #FFE066, #F5A800, #F0C020)"
                      }
                      animation={
                        isOnOs
                          ? undefined
                          : `${revolveBorder} 2s linear infinite`
                      }
                    />
                    <Link
                      href={resolveHref(link.href)}
                      color="white"
                      fontWeight="bold"
                      fontSize="2xl"
                      textTransform="uppercase"
                      letterSpacing="wider"
                      onClick={onClose}
                      position="relative"
                      display="block"
                      bg="bauhaus.black"
                      px={3}
                      py={1}
                      borderRadius="2px"
                      _hover={{ color: "bauhaus.yellow" }}
                    >
                      {link.label}
                    </Link>
                  </Box>
                ) : link.label === "Stake" ? (
                  <Box key={link.label} position="relative">
                    {vaultData && vaultData.totalApy > 0 && (
                      <Box
                        position="absolute"
                        top="-12px"
                        left="0"
                        bg="bauhaus.yellow"
                        border="1.5px solid"
                        borderColor="bauhaus.black"
                        px={1.5}
                        py={0}
                        lineHeight="1.3"
                        whiteSpace="nowrap"
                      >
                        <Box
                          fontSize="8px"
                          fontWeight="900"
                          color="bauhaus.black"
                          letterSpacing="wide"
                        >
                          {vaultData.totalApy.toFixed(1)}% APY
                        </Box>
                      </Box>
                    )}
                    <Link
                      href={resolveHref(link.href)}
                      color="white"
                      fontWeight="bold"
                      fontSize="2xl"
                      textTransform="uppercase"
                      letterSpacing="wider"
                      onClick={onClose}
                      _hover={{ color: "bauhaus.yellow" }}
                    >
                      {link.label}
                    </Link>
                  </Box>
                ) : (
                  <Link
                    key={link.label}
                    href={resolveHref(link.href)}
                    color="white"
                    fontWeight="bold"
                    fontSize="2xl"
                    textTransform="uppercase"
                    letterSpacing="wider"
                    onClick={onClose}
                    _hover={{ color: "bauhaus.yellow" }}
                  >
                    {link.label}
                  </Link>
                )
              )}
              <Link
                href={TELEGRAM_URL}
                target="_blank"
                color="white"
                fontWeight="bold"
                fontSize="2xl"
                textTransform="uppercase"
                letterSpacing="wider"
                onClick={onClose}
                display="flex"
                alignItems="center"
                gap={3}
                _hover={{ color: "bauhaus.blue" }}
              >
                <TelegramIcon size={24} />
                Telegram
              </Link>
              <Button
                variant="primary"
                size="lg"
                as="a"
                href={CHROME_STORE_URL}
                target="_blank"
                mt={4}
                onClick={onClose}
              >
                Add to Chrome
              </Button>
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </Box>
  );
}
