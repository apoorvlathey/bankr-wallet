"use client";

import {
  Box,
  Container,
  Heading,
  Text,
  SimpleGrid,
  VStack,
  HStack,
  Image,
} from "@chakra-ui/react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import {
  Cpu,
  PanelRight,
  Link2,
  Layers,
  Wallet,
  Puzzle,
  History,
  Bell,
} from "lucide-react";
import { Card } from "./ui/Card";

const MotionBox = motion(Box);

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  decoratorColor: "red" | "blue" | "yellow";
  decoratorShape: "circle" | "square" | "triangle";
  delay?: number;
}

function FeatureCard({
  icon,
  title,
  description,
  decoratorColor,
  decoratorShape,
  delay = 0,
}: FeatureCardProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <MotionBox
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay }}
      h="full"
    >
      <Card
        decoratorColor={decoratorColor}
        decoratorShape={decoratorShape}
        h="full"
      >
        <VStack align="flex-start" spacing={4} h="full">
          <Box
            p={3}
            border="3px solid"
            borderColor="bauhaus.black"
            bg="bauhaus.background"
          >
            {icon}
          </Box>
          <Heading as="h3" size="md" textTransform="uppercase">
            {title}
          </Heading>
          <Text color="text.secondary" fontWeight="medium">
            {description}
          </Text>
        </VStack>
      </Card>
    </MotionBox>
  );
}

const features = [
  {
    icon: <Cpu size={28} />,
    title: "AI-Powered Transactions",
    description: "Execute transactions through Bankr API prompts seamlessly.",
    decoratorColor: "red" as const,
    decoratorShape: "circle" as const,
  },
  {
    icon: <PanelRight size={28} />,
    title: "Side Panel Mode",
    description: "Keep wallet visible while browsing, no annoying popups!",
    decoratorColor: "blue" as const,
    decoratorShape: "square" as const,
  },
  {
    icon: <Link2 size={28} />,
    title: "Multi-Chain Support",
    description: "Base, Ethereum, MegaETH, Polygon, Unichain - all in one wallet.",
    decoratorColor: "yellow" as const,
    decoratorShape: "triangle" as const,
  },
  {
    icon: <Layers size={28} />,
    title: "Per-Tab Chains",
    description: "Different chains in different browser tabs for power users.",
    decoratorColor: "red" as const,
    decoratorShape: "square" as const,
  },
  {
    icon: <Wallet size={28} />,
    title: "All Wallet Types",
    description: "Import private keys, seed phrases, or connect via Bankr API.",
    decoratorColor: "blue" as const,
    decoratorShape: "triangle" as const,
  },
  {
    icon: <Puzzle size={28} />,
    title: "EIP-6963 Compatible",
    description: "Works alongside other wallets with modern dapp discovery.",
    decoratorColor: "yellow" as const,
    decoratorShape: "circle" as const,
  },
  {
    icon: <History size={28} />,
    title: "Transaction History",
    description: "Track recent transactions with real-time status updates.",
    decoratorColor: "red" as const,
    decoratorShape: "triangle" as const,
  },
  {
    icon: <Bell size={28} />,
    title: "Browser Notifications",
    description: "Get notified when your transactions complete.",
    decoratorColor: "blue" as const,
    decoratorShape: "circle" as const,
  },
];

export function Features() {
  const headingRef = useRef(null);
  const isHeadingInView = useInView(headingRef, { once: true });

  return (
    <Box
      id="features"
      bg="bauhaus.background"
      pt={{ base: 10, md: 14 }}
      pb={{ base: 16, md: 24 }}
      position="relative"
    >
      <Container maxW="7xl">
        <VStack spacing={{ base: 12, md: 16 }}>
          {/* Section Header */}
          <VStack spacing={4} ref={headingRef}>
            <MotionBox
              initial={{ opacity: 0, y: 20 }}
              animate={isHeadingInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5 }}
            >
              <Heading
                as="h2"
                fontSize={{ base: "3xl", md: "5xl" }}
                color="bauhaus.red"
                textAlign="center"
              >
                FEATURES
              </Heading>
            </MotionBox>
            <Box w="120px" h="4px" bg="bauhaus.black" />
          </VStack>

          {/* Chain Icons */}
          <HStack spacing={{ base: 3, md: 4 }} flexWrap="wrap" justify="center">
            <Box
              bg="white"
              border="3px solid"
              borderColor="#0035A0"
              boxShadow="3px 3px 0px 0px #0035A0"
              px={4}
              py={2}
            >
              <HStack spacing={2}>
                <Image src="/images/base.svg" alt="Base" w="24px" h="24px" />
                <Text
                  fontWeight="bold"
                  fontSize="sm"
                  color="bauhaus.foreground"
                >
                  Base
                </Text>
              </HStack>
            </Box>
            <Box
              bg="white"
              border="3px solid"
              borderColor="#3B4C8C"
              boxShadow="3px 3px 0px 0px #3B4C8C"
              px={4}
              py={2}
            >
              <HStack spacing={2}>
                <Image
                  src="/images/ethereum.svg"
                  alt="Ethereum"
                  w="24px"
                  h="24px"
                />
                <Text
                  fontWeight="bold"
                  fontSize="sm"
                  color="bauhaus.foreground"
                >
                  Ethereum
                </Text>
              </HStack>
            </Box>
            <Box
              bg="white"
              border="3px solid"
              borderColor="#19191A"
              boxShadow="3px 3px 0px 0px #19191A"
              px={4}
              py={2}
            >
              <HStack spacing={2}>
                <Image
                  src="/images/megaeth.svg"
                  alt="MegaETH"
                  w="24px"
                  h="24px"
                />
                <Text
                  fontWeight="bold"
                  fontSize="sm"
                  color="bauhaus.foreground"
                >
                  MegaETH
                </Text>
              </HStack>
            </Box>
            <Box
              bg="white"
              border="3px solid"
              borderColor="#5C2D91"
              boxShadow="3px 3px 0px 0px #5C2D91"
              px={4}
              py={2}
            >
              <HStack spacing={2}>
                <Image
                  src="/images/polygon.svg"
                  alt="Polygon"
                  w="24px"
                  h="24px"
                />
                <Text
                  fontWeight="bold"
                  fontSize="sm"
                  color="bauhaus.foreground"
                >
                  Polygon
                </Text>
              </HStack>
            </Box>
            <Box
              bg="white"
              border="3px solid"
              borderColor="#B80058"
              boxShadow="3px 3px 0px 0px #B80058"
              px={4}
              py={2}
            >
              <HStack spacing={2}>
                <Image
                  src="/images/unichain.svg"
                  alt="Unichain"
                  w="24px"
                  h="24px"
                />
                <Text
                  fontWeight="bold"
                  fontSize="sm"
                  color="bauhaus.foreground"
                >
                  Unichain
                </Text>
              </HStack>
            </Box>
          </HStack>

          {/* Features Grid */}
          <SimpleGrid columns={{ base: 1, md: 2, lg: 4 }} spacing={6} w="full">
            {features.map((feature, index) => (
              <FeatureCard
                key={feature.title}
                {...feature}
                delay={index * 0.1}
              />
            ))}
          </SimpleGrid>
        </VStack>
      </Container>
    </Box>
  );
}
