"use client";

import type { MouseEvent } from "react";
import { Box, Flex, Link, Text } from "@chakra-ui/react";

export type TestSectionAccent = "red" | "blue" | "yellow" | "green";

export interface TestSectionLink {
  id: string;
  label: string;
  accent: TestSectionAccent;
}

function scrollToSection(
  event: MouseEvent<HTMLAnchorElement>,
  sectionId: string,
) {
  const section = document.getElementById(sectionId);
  if (!section) return;

  event.preventDefault();
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  section.scrollIntoView({
    behavior: reduceMotion ? "auto" : "smooth",
    block: "start",
  });
  window.history.replaceState(null, "", `#${sectionId}`);
}

export function TestSectionNav({
  sections,
}: {
  sections: readonly TestSectionLink[];
}) {
  return (
    <Flex
      as="nav"
      aria-label="Test sections"
      position="sticky"
      top={0}
      zIndex="sticky"
      bg="white"
      border="3px solid"
      borderColor="bauhaus.black"
      boxShadow="4px 4px 0px 0px #121212"
      minW={0}
    >
      <Flex
        align="center"
        flexShrink={0}
        minH="48px"
        px={{ base: 3, md: 4 }}
        bg="bauhaus.black"
        borderRight="3px solid"
        borderColor="bauhaus.black"
      >
        <Text
          color="white"
          fontSize="2xs"
          fontWeight="900"
          textTransform="uppercase"
          letterSpacing="widest"
          whiteSpace="nowrap"
        >
          Jump to
        </Text>
      </Flex>

      <Flex
        minW={0}
        overflowX="auto"
        overscrollBehaviorX="contain"
        sx={{
          scrollbarColor:
            "var(--chakra-colors-bauhaus-black) var(--chakra-colors-bauhaus-muted)",
          scrollbarWidth: "thin",
          "&::-webkit-scrollbar": { height: "6px" },
          "&::-webkit-scrollbar-track": {
            background: "var(--chakra-colors-bauhaus-muted)",
          },
          "&::-webkit-scrollbar-thumb": {
            background: "var(--chakra-colors-bauhaus-black)",
          },
        }}
      >
        {sections.map((section, index) => (
          <Link
            key={section.id}
            href={`#${section.id}`}
            onClick={(event) => scrollToSection(event, section.id)}
            display="inline-flex"
            alignItems="center"
            gap={2}
            flexShrink={0}
            minH="48px"
            px={3}
            color="bauhaus.black"
            fontSize="xs"
            fontWeight="800"
            textTransform="uppercase"
            letterSpacing="wide"
            whiteSpace="nowrap"
            borderLeft={index === 0 ? "none" : "2px solid"}
            borderColor="bauhaus.black"
            _hover={{
              bg: "gray.100",
              color: "bauhaus.black",
            }}
            _active={{
              bg: "bauhaus.yellow",
            }}
            _focusVisible={{
              outline: "none",
              boxShadow:
                "inset 0 0 0 3px var(--chakra-colors-bauhaus-blue)",
            }}
          >
            <Box
              aria-hidden="true"
              w="8px"
              h="8px"
              flexShrink={0}
              bg={`bauhaus.${section.accent}`}
              border="1px solid"
              borderColor="bauhaus.black"
              borderRadius={section.accent === "blue" ? "full" : "none"}
              transform={
                section.accent === "yellow" ? "rotate(45deg)" : undefined
              }
            />
            {section.label}
          </Link>
        ))}
      </Flex>
    </Flex>
  );
}
