"use client";

import { useState, useEffect } from "react";
import {
  Box,
  Container,
  Heading,
  Text,
  VStack,
  HStack,
  Spinner,
  Tag,
} from "@chakra-ui/react";
import { Navigation } from "../components/Navigation";
import { TokenBanner } from "../components/TokenBanner";
import { Footer } from "../components/Footer";

interface RoadmapItem {
  _id: string;
  title: string;
  description?: string;
  status: "done" | "in-progress" | "planned" | "idea";
  category?: string;
  order: number;
}

const STATUS_CONFIG: Record<string, { emoji: string; label: string }> = {
  done: { emoji: "\u2705", label: "Done" },
  "in-progress": { emoji: "\uD83D\uDEA7", label: "In Progress" },
  planned: { emoji: "\uD83D\uDCCB", label: "Planned" },
  idea: { emoji: "\uD83D\uDCA1", label: "Idea" },
};

function TimelineItem({
  item,
  isLast,
}: {
  item: RoadmapItem;
  isLast: boolean;
}) {
  const config = STATUS_CONFIG[item.status];

  return (
    <Box>
      <HStack align="flex-start" spacing={{ base: 4, md: 6 }}>
        {/* Timeline marker + line */}
        <VStack spacing={0} flexShrink={0}>
          <Box
            w="46px"
            h="46px"
            border="3px solid"
            borderColor="bauhaus.black"
            display="flex"
            alignItems="center"
            justifyContent="center"
            fontSize="xl"
            bg="white"
          >
            {config.emoji}
          </Box>
          {!isLast && (
            <Box w="3px" h="80px" bg="bauhaus.black" opacity={0.3} />
          )}
        </VStack>

        {/* Content */}
        <VStack align="flex-start" spacing={2} pb={isLast ? 0 : 8}>
          <Text
            fontSize="xs"
            fontWeight="bold"
            textTransform="uppercase"
            letterSpacing="wider"
            color="text.secondary"
          >
            {config.label}
          </Text>
          <HStack spacing={3} flexWrap="wrap">
            <Text
              fontWeight="black"
              fontSize={{ base: "lg", md: "xl" }}
              lineHeight="1.2"
            >
              {item.title}
            </Text>
            {item.category && (
              <Tag
                size="sm"
                bg="bauhaus.black"
                color="white"
                fontWeight="bold"
                fontSize="xs"
                textTransform="uppercase"
                letterSpacing="wider"
                borderRadius={0}
              >
                {item.category}
              </Tag>
            )}
          </HStack>
          {item.description && (
            <Text
              fontWeight="medium"
              color="text.secondary"
              fontSize="sm"
              whiteSpace="pre-wrap"
            >
              {item.description}
            </Text>
          )}
        </VStack>
      </HStack>
    </Box>
  );
}

export default function RoadmapContent() {
  const [items, setItems] = useState<RoadmapItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/roadmap")
      .then((res) => res.json())
      .then((data) => setItems(data.items || []))
      .catch(console.error)
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <Box minH="100vh" bg="bauhaus.background">
      <Navigation />
      <TokenBanner />

      {/* Hero */}
      <Box
        bg="bauhaus.yellow"
        py={{ base: 12, md: 16 }}
        borderBottom="4px solid"
        borderColor="bauhaus.black"
      >
        <Container maxW="4xl">
          <VStack spacing={4} align="center">
              <Heading
                as="h1"
                fontSize={{ base: "4xl", md: "6xl" }}
                textAlign="center"
              >
                ROADMAP
              </Heading>
            <Box w="100px" h="4px" bg="bauhaus.black" />
            <Text
              fontWeight="bold"
              fontSize={{ base: "md", md: "lg" }}
              color="text.secondary"
              textAlign="center"
            >
              What we&apos;re building and what&apos;s next
            </Text>
          </VStack>
        </Container>
      </Box>

      {/* Timeline */}
      <Container maxW="4xl" py={{ base: 8, md: 12 }}>
        {isLoading ? (
          <VStack py={20}>
            <Spinner size="xl" color="bauhaus.red" thickness="4px" />
          </VStack>
        ) : items.length === 0 ? (
          <VStack py={20}>
            <Text
              fontWeight="bold"
              fontSize="lg"
              color="text.tertiary"
              textTransform="uppercase"
            >
              No items yet
            </Text>
          </VStack>
        ) : (
          <VStack
            align="flex-start"
            spacing={0}
            pl={{ base: 2, md: 8 }}
          >
            {items.map((item, i) => (
              <TimelineItem
                key={item._id}
                item={item}
                isLast={i === items.length - 1}
              />
            ))}
          </VStack>
        )}
      </Container>

      <Footer />
    </Box>
  );
}
