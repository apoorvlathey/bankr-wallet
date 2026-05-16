"use client";

import {
  Box,
  Container,
  Heading,
  Button,
  VStack,
  HStack,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import { CHROME_STORE_URL, FIREFOX_STORE_URL } from "../constants";

const MotionBox = motion(Box);

export function FinalCTA() {
  return (
    <Box
      bg="bauhaus.blue"
      py={{ base: 20, md: 32 }}
      position="relative"
      overflow="hidden"
    >
      {/* Decorative shapes */}
      <MotionBox
        position="absolute"
        top={{ base: "-40px", md: "-60px" }}
        left={{ base: "-40px", md: "-60px" }}
        w={{ base: "150px", md: "250px" }}
        h={{ base: "150px", md: "250px" }}
        borderRadius="full"
        border="30px solid"
        borderColor="whiteAlpha.200"
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <MotionBox
        position="absolute"
        bottom={{ base: "-30px", md: "-50px" }}
        right={{ base: "10%", md: "15%" }}
        w={{ base: "100px", md: "180px" }}
        h={{ base: "100px", md: "180px" }}
        bg="bauhaus.yellow"
        opacity={0.3}
        transform="rotate(45deg)"
        animate={{
          rotate: [45, 50, 45],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <MotionBox
        position="absolute"
        top={{ base: "20%", md: "30%" }}
        right={{ base: "-30px", md: "-40px" }}
        w={{ base: "80px", md: "120px" }}
        h={{ base: "80px", md: "120px" }}
        bg="bauhaus.red"
        opacity={0.4}
        animate={{
          y: [0, -20, 0],
        }}
        transition={{
          duration: 6,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      <Container maxW="4xl" position="relative" zIndex={1}>
        <VStack spacing={8} textAlign="center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <Heading
              as="h2"
              fontSize={{ base: "3xl", sm: "4xl", md: "6xl", lg: "7xl" }}
              color="white"
              lineHeight="0.95"
            >
              READY TO MAKE
              <br />
              WALLETS FUN AGAIN?
            </Heading>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
          >
            <HStack spacing={4} flexWrap="wrap" justify="center">
              <Button
                variant="yellow"
                size="xl"
                as="a"
                href={CHROME_STORE_URL}
                target="_blank"
                px={{ base: 6, md: 10 }}
                py={{ base: 4, md: 6 }}
                fontSize={{ base: "md", md: "lg" }}
              >
                ADD TO CHROME
              </Button>
              <Button
                variant="yellow"
                size="xl"
                as="a"
                href={FIREFOX_STORE_URL}
                target="_blank"
                px={{ base: 6, md: 10 }}
                py={{ base: 4, md: 6 }}
                fontSize={{ base: "md", md: "lg" }}
              >
                ADD TO FIREFOX
              </Button>
            </HStack>
          </motion.div>
        </VStack>
      </Container>
    </Box>
  );
}
