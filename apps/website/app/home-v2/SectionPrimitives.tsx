"use client";

import { Box, Container, Flex, SimpleGrid, Text, VStack } from "@chakra-ui/react";
import { palette } from "./design";

export function StatBar() {
  const stats = [
    ["8", "built-in EVM chains"],
    ["22", "0x swap chain IDs"],
    ["3+", "ways to sign"],
    ["1", "clear review"],
  ];

  return (
    <Box borderY="1px solid rgba(255,255,255,0.12)" bg="rgba(255,255,255,0.035)">
      <Container maxW="7xl">
        <SimpleGrid columns={{ base: 2, md: 4 }} spacing={0}>
          {stats.map(([value, label], index) => (
            <VStack
              key={label}
              align="flex-start"
              spacing={1}
              py={{ base: 5, md: 7 }}
              px={{ base: 3, md: 6 }}
              borderRight={
                index < stats.length - 1
                  ? { md: "1px solid rgba(255,255,255,0.08)" }
                  : undefined
              }
            >
              <Text
                color={palette.white}
                fontSize={{ base: "34px", md: "46px" }}
                fontWeight="900"
                letterSpacing="0"
                lineHeight="1"
              >
                {value}
              </Text>
              <Text
                color={palette.faint}
                fontSize="12px"
                fontWeight="800"
                textTransform="uppercase"
                letterSpacing="0"
              >
                {label}
              </Text>
            </VStack>
          ))}
        </SimpleGrid>
      </Container>
    </Box>
  );
}

export function SectionHeading({
  kicker,
  title,
  children,
}: {
  kicker: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <VStack
      align={{ base: "flex-start", md: "center" }}
      textAlign={{ base: "left", md: "center" }}
      spacing={4}
      maxW="820px"
      mx="auto"
      mb={{ base: 9, md: 14 }}
    >
      <Text color={palette.yellow} fontSize="13px" fontWeight="900" textTransform="uppercase" letterSpacing="0">
        {kicker}
      </Text>
      <Text
        as="h2"
        color={palette.white}
        fontSize={{ base: "38px", md: "62px" }}
        fontWeight="900"
        letterSpacing="0"
        lineHeight="0.98"
      >
        {title}
      </Text>
      <Text color={palette.muted} fontSize={{ base: "16px", md: "19px" }} lineHeight="1.7">
        {children}
      </Text>
    </VStack>
  );
}

export function FeatureCard({
  icon,
  title,
  text,
  accent,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
  accent: string;
}) {
  return (
    <VStack
      align="flex-start"
      spacing={4}
      p={{ base: 5, md: 6 }}
      borderRadius="28px"
      bg="rgba(255,255,255,0.045)"
      border="1px solid rgba(255,255,255,0.11)"
      minH="250px"
    >
      <Flex w="48px" h="48px" borderRadius="16px" align="center" justify="center" bg={`${accent}18`} color={accent}>
        {icon}
      </Flex>
      <Text color={palette.white} fontSize="22px" fontWeight="900" letterSpacing="0" lineHeight="1.05">
        {title}
      </Text>
      <Text color={palette.muted} fontSize="15px" lineHeight="1.7">
        {text}
      </Text>
    </VStack>
  );
}
