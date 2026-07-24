"use client";

import {
  Box,
  Button,
  Container,
  Flex,
  HStack,
  Image,
  Link,
  Text,
} from "@chakra-ui/react";
import { ExternalLink } from "lucide-react";
import { GITHUB_URL } from "../constants";
import { useSiteNav } from "../lib/useSiteNav";
import { palette } from "../home-v2/design";
import { useInstallTarget } from "../home-v2/useInstallTarget";

export function StakeNavigation() {
  const { homeHref } = useSiteNav();
  const installTarget = useInstallTarget();

  return (
    <Box
      as="header"
      position="sticky"
      top={0}
      zIndex={100}
      pt={{ base: 3, md: 4 }}
      px={{ base: 3, md: 6 }}
      pointerEvents="none"
    >
      <Container maxW="7xl" px={0}>
        <Flex
          minH={{ base: "58px", md: "64px" }}
          px={{ base: 3, md: 4 }}
          align="center"
          justify="space-between"
          border="1px solid rgba(255,255,255,0.11)"
          borderRadius="14px"
          bg="rgba(17,17,19,0.94)"
          boxShadow="0 18px 52px rgba(0,0,0,0.38)"
          backdropFilter="blur(20px)"
          pointerEvents="auto"
        >
          <Link href={homeHref} _hover={{ textDecoration: "none" }}>
            <HStack spacing={3}>
              <Flex
                boxSize={{ base: "38px", md: "42px" }}
                borderRadius="9px"
                bg={palette.white}
                align="center"
                justify="center"
              >
                <Image
                  src="/images/walletchan-icon-nobg.png"
                  alt="WalletChan"
                  boxSize={{ base: "29px", md: "32px" }}
                />
              </Flex>
              <Text
                color={palette.white}
                fontFamily="var(--font-display)"
                fontSize={{ base: "18px", md: "22px" }}
                fontWeight="800"
                letterSpacing="-0.03em"
              >
                WALLETCHAN
              </Text>
            </HStack>
          </Link>

          <HStack spacing={{ base: 2, md: 3 }}>
            <Button
              as="a"
              href={installTarget.href}
              target="_blank"
              h="40px"
              px={{ base: 4, md: 5 }}
              borderRadius="8px"
              bg={palette.yellow}
              color={palette.ink}
              fontSize="14px"
              fontWeight="800"
              leftIcon={
                <Image src={installTarget.iconSrc} alt="" boxSize="18px" />
              }
              _hover={{ bg: palette.amberSoft, transform: "translateY(-1px)" }}
            >
              {installTarget.navLabel}
            </Button>
          </HStack>
        </Flex>
      </Container>
    </Box>
  );
}

export function StakeFooter() {
  return (
    <Box
      as="footer"
      borderTop="1px solid rgba(255,255,255,0.08)"
      py={8}
    >
      <Container maxW="7xl">
        <Flex
          direction={{ base: "column", md: "row" }}
          gap={3}
          align={{ base: "flex-start", md: "center" }}
          justify="space-between"
        >
          <Text color={palette.faint} fontSize="13px">
            WCHAN staking on Base
          </Text>
          <Link
            href={GITHUB_URL}
            isExternal
            display="inline-flex"
            alignItems="center"
            gap={1.5}
            color={palette.muted}
            fontSize="13px"
            fontWeight="700"
            _hover={{ color: palette.yellow, textDecoration: "none" }}
          >
            Open-source contracts
            <ExternalLink size={13} />
          </Link>
        </Flex>
      </Container>
    </Box>
  );
}
