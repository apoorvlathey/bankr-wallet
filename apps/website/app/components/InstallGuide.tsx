"use client";

import {
  Box,
  Container,
  Heading,
  Text,
  VStack,
  HStack,
  Button,
  Flex,
  OrderedList,
  ListItem,
  Icon,
  Grid,
} from "@chakra-ui/react";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Chrome, ExternalLink } from "lucide-react";
import {
  CHROME_STORE_URL,
  FIREFOX_STORE_URL,
  BANKR_API_URL,
} from "../constants";


const MotionBox = motion(Box);

interface StepProps {
  number: number;
  title: string;
  description: string;
  color: "red" | "blue" | "yellow";
  shape: "circle" | "square" | "triangle";
  delay?: number;
}

function Step({
  number,
  title,
  description,
  color,
  shape,
  delay = 0,
}: StepProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <MotionBox
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay }}
      flex={1}
      minW={{ base: "full", md: "200px" }}
    >
      <VStack spacing={4} align="center">
        {/* Step Number with Shape */}
        <Box position="relative">
          <Box
            w="60px"
            h="60px"
            display="flex"
            alignItems="center"
            justifyContent="center"
            bg={`bauhaus.${color}`}
            border="3px solid"
            borderColor="bauhaus.black"
            transform={shape === "square" ? "rotate(45deg)" : "none"}
            borderRadius={shape === "circle" ? "full" : "none"}
          >
            <Text
              fontWeight="black"
              fontSize="2xl"
              color={color === "yellow" ? "bauhaus.black" : "white"}
              transform={shape === "square" ? "rotate(-45deg)" : "none"}
            >
              {number}
            </Text>
          </Box>
        </Box>

        {/* Title */}
        <Heading as="h3" size="md" textTransform="uppercase" textAlign="center">
          {title}
        </Heading>

        {/* Description */}
        <Text
          color="text.secondary"
          textAlign="center"
          fontWeight="medium"
          fontSize="sm"
          maxW="200px"
        >
          {description}
        </Text>
      </VStack>
    </MotionBox>
  );
}

const steps = [
  {
    number: 1,
    title: "Install",
    description: "Add WalletChan from the Chrome Web Store or Firefox add-ons.",
    color: "red" as const,
    shape: "circle" as const,
  },
  {
    number: 2,
    title: "Get API Key",
    description: "Visit bankr.bot/api to get your Bankr API key.",
    color: "blue" as const,
    shape: "square" as const,
  },
  {
    number: 3,
    title: "Start Using",
    description: "Enter your API key, create a password, and you're ready!",
    color: "yellow" as const,
    shape: "triangle" as const,
  },
];

interface InstallStepCardProps {
  stepNumber: number;
  title: string;
  children: React.ReactNode;
  color: "red" | "blue" | "yellow";
  delay?: number;
}

function InstallStepCard({
  stepNumber,
  title,
  children,
  color,
  delay = 0,
}: InstallStepCardProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <MotionBox
      ref={ref}
      initial={{ opacity: 0, x: -20 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.5, delay }}
      bg="white"
      border="4px solid"
      borderColor="bauhaus.black"
      boxShadow="6px 6px 0px 0px #121212"
      position="relative"
      overflow="hidden"
    >
      {/* Color accent bar */}
      <Box
        position="absolute"
        top={0}
        left={0}
        bottom={0}
        w="8px"
        bg={`bauhaus.${color}`}
      />

      <Flex p={6} pl={8} gap={4} align="flex-start">
        {/* Step number */}
        <Flex
          w="40px"
          h="40px"
          bg={`bauhaus.${color}`}
          border="3px solid"
          borderColor="bauhaus.black"
          align="center"
          justify="center"
          flexShrink={0}
        >
          <Text
            fontWeight="black"
            fontSize="xl"
            color={color === "yellow" ? "bauhaus.black" : "white"}
          >
            {stepNumber}
          </Text>
        </Flex>

        <VStack align="flex-start" spacing={3} flex={1}>
          <Heading
            as="h4"
            size="md"
            textTransform="uppercase"
            letterSpacing="tight"
          >
            {title}
          </Heading>
          {children}
        </VStack>
      </Flex>
    </MotionBox>
  );
}

export function InstallGuide() {
  const headingRef = useRef(null);
  const isHeadingInView = useInView(headingRef, { once: true });

  return (
    <Box
      id="install"
      bg="bauhaus.background"
      py={{ base: 16, md: 24 }}
      borderY="4px solid"
      borderColor="bauhaus.black"
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
                fontSize={{ base: "2xl", md: "4xl", lg: "5xl" }}
                textAlign="center"
              >
                GET STARTED IN 60 SECONDS
              </Heading>
            </MotionBox>
            <Box w="200px" h="4px" bg="bauhaus.black" />
          </VStack>

          {/* Overview Steps */}
          <Flex
            direction={{ base: "column", md: "row" }}
            gap={{ base: 8, md: 4 }}
            justify="space-between"
            align={{ base: "center", md: "flex-start" }}
            w="full"
            position="relative"
          >
            {/* Connecting line (desktop only) */}
            <Box
              display={{ base: "none", md: "block" }}
              position="absolute"
              top="30px"
              left="15%"
              right="15%"
              h="2px"
              borderTop="3px dashed"
              borderColor="bauhaus.black"
              opacity={0.3}
            />

            {steps.map((step, index) => (
              <Step key={step.number} {...step} delay={index * 0.15} />
            ))}
          </Flex>

          {/* Detailed Installation Guide */}
          <VStack spacing={6} w="full" mx="auto">
            <Heading
              as="h3"
              fontSize={{ base: "xl", md: "2xl" }}
              textAlign="center"
              mt={8}
            >
              DETAILED INSTALLATION GUIDE
            </Heading>
            <Box w="120px" h="3px" bg="bauhaus.red" />

            <Grid
              templateColumns={{ base: "1fr", lg: "1fr 1fr" }}
              gap={6}
              w="full"
            >
              {/* Step 1: Install from your browser's add-on store */}
              <InstallStepCard
                stepNumber={1}
                title="Install the Extension"
                color="red"
                delay={0}
              >
                <OrderedList spacing={2} fontWeight="medium" pl={2}>
                  <ListItem>
                    Click your browser&apos;s button below to open the add-on
                    store
                  </ListItem>
                  <ListItem>
                    Confirm the install when prompted
                  </ListItem>
                  <ListItem>
                    Works on Chrome, Brave, Arc, other Chromium browsers, and
                    Firefox
                  </ListItem>
                </OrderedList>
                <HStack spacing={3} mt={2} flexWrap="wrap">
                  <Button
                    as="a"
                    href={CHROME_STORE_URL}
                    target="_blank"
                    variant="primary"
                    size="md"
                    leftIcon={<Chrome size={18} />}
                  >
                    Add to Chrome
                  </Button>
                  <Button
                    as="a"
                    href={FIREFOX_STORE_URL}
                    target="_blank"
                    variant="secondary"
                    size="md"
                  >
                    Add to Firefox
                  </Button>
                </HStack>
              </InstallStepCard>

              {/* Step 2: Get API Key */}
              <InstallStepCard
                stepNumber={2}
                title="Get Your Bankr API Key"
                color="blue"
                delay={0.1}
              >
                <OrderedList spacing={2} fontWeight="medium" pl={2}>
                  <ListItem>
                    Visit{" "}
                    <Button
                      as="a"
                      href={BANKR_API_URL}
                      target="_blank"
                      variant="ghost"
                      size="sm"
                      px={2}
                      py={1}
                      h="auto"
                      color="bauhaus.blue"
                      textDecoration="underline"
                      fontWeight="bold"
                      _hover={{ color: "bauhaus.red" }}
                    >
                      bankr.bot/api
                      <Icon as={ExternalLink} ml={1} w={3} h={3} />
                    </Button>{" "}
                    to get your API key
                  </ListItem>
                  <ListItem>Copy the API key and your wallet address</ListItem>
                </OrderedList>
                <Button
                  as="a"
                  href={BANKR_API_URL}
                  target="_blank"
                  variant="secondary"
                  size="md"
                  mt={2}
                  rightIcon={<ExternalLink size={18} />}
                >
                  Get API Key
                </Button>
              </InstallStepCard>

              {/* Step 3: Setup */}
              <InstallStepCard
                stepNumber={3}
                title="Complete Setup"
                color="yellow"
                delay={0.2}
              >
                <OrderedList spacing={2} fontWeight="medium" pl={2}>
                  <ListItem>
                    Click the WalletChan extension icon to open the{" "}
                    <Text as="span" fontWeight="black">
                      setup wizard
                    </Text>
                  </ListItem>
                  <ListItem>
                    Enter your{" "}
                    <Text as="span" fontWeight="black">
                      Bankr API key
                    </Text>
                  </ListItem>
                  <ListItem>
                    Enter your{" "}
                    <Text as="span" fontWeight="black">
                      wallet address
                    </Text>{" "}
                    (supports ENS)
                  </ListItem>
                  <ListItem>
                    Create a{" "}
                    <Text as="span" fontWeight="black">
                      password
                    </Text>{" "}
                    to secure your API key
                  </ListItem>
                  <ListItem>
                    <Text as="span" fontWeight="black">
                      Connect to any dapp
                    </Text>{" "}
                    and start transacting!
                  </ListItem>
                </OrderedList>
              </InstallStepCard>
            </Grid>
          </VStack>
        </VStack>
      </Container>
    </Box>
  );
}
