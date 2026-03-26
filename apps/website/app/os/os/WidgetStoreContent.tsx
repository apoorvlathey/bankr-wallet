"use client";

import { Box, VStack, HStack, Text, SimpleGrid } from "@chakra-ui/react";
import { WIDGET_TYPES } from "./widgetRegistry";
import {
  WIN95_FONT,
  BUTTON_FACE,
  BUTTON_SHADOW,
  ACCENT_BLUE,
} from "./win95styles";

interface WidgetStoreContentProps {
  onAddWidget: (type: string) => void;
  isPremium: boolean;
  onOpenStake: () => void;
}

export function WidgetStoreContent({ onAddWidget, isPremium, onOpenStake }: WidgetStoreContentProps) {
  return (
    <Box h="100%" overflow="auto" bg={BUTTON_FACE} fontFamily={WIN95_FONT}>
      <VStack spacing={3} p={3} align="stretch">
        <Text fontWeight="bold" fontSize="13px">
          Desktop Widgets
        </Text>
        <Text fontSize="10px" color="gray.600">
          Add widgets to your desktop for quick access to live data.
        </Text>

        {/* Premium gating banner */}
        {!isPremium && (
          <Box
            bg="#FFF8E1"
            border="1px solid #F0C020"
            borderRadius="4px"
            p={3}
          >
            <HStack spacing="8px" align="start">
              <Text fontSize="18px" lineHeight="1" flexShrink={0}>
                {"\uD83D\uDD12"}
              </Text>
              <VStack align="start" spacing={1} flex={1}>
                <Text fontWeight="bold" fontSize="11px" color="#7A5C00">
                  Premium Feature
                </Text>
                <Text fontSize="10px" color="#8B6914" lineHeight="1.4">
                  Stake 20M+ sWCHAN to unlock desktop widgets.
                </Text>
                <Box
                  as="button"
                  mt={1}
                  px="12px"
                  py="4px"
                  fontSize="10px"
                  fontFamily={WIN95_FONT}
                  fontWeight="bold"
                  bg={ACCENT_BLUE}
                  color="white"
                  border="none"
                  borderRadius="2px"
                  _hover={{ opacity: 0.85 }}
                  _active={{ opacity: 0.75 }}
                  onClick={onOpenStake}
                >
                  Open Stake
                </Box>
              </VStack>
            </HStack>
          </Box>
        )}

        <SimpleGrid columns={{ base: 1, sm: 2 }} spacing={3}>
          {WIDGET_TYPES.map((def) => (
            <Box
              key={def.type}
              bg="white"
              border={`1px solid ${BUTTON_SHADOW}`}
              p={3}
              opacity={isPremium ? 1 : 0.6}
            >
              <HStack spacing={3} align="start">
                <Text fontSize="28px" lineHeight="1" flexShrink={0}>
                  {def.icon}
                </Text>
                <VStack align="start" spacing={1} flex={1} minW={0}>
                  <Text fontWeight="bold" fontSize="11px" noOfLines={1}>
                    {def.name}
                  </Text>
                  <Text fontSize="10px" color="gray.500" noOfLines={2}>
                    {def.description}
                  </Text>
                  <Box
                    as="button"
                    mt={1}
                    px="10px"
                    py="2px"
                    fontSize="10px"
                    fontFamily={WIN95_FONT}
                    fontWeight="bold"
                    bg={isPremium ? ACCENT_BLUE : "gray.400"}
                    color="white"
                    border={`1px solid ${isPremium ? ACCENT_BLUE : "gray.400"}`}
                    cursor={isPremium ? "pointer" : "not-allowed"}
                    _hover={isPremium ? { opacity: 0.85 } : {}}
                    _active={isPremium ? { opacity: 0.75 } : {}}
                    onClick={() => {
                      if (isPremium) onAddWidget(def.type);
                    }}
                  >
                    + Add to Desktop
                  </Box>
                </VStack>
              </HStack>
            </Box>
          ))}
        </SimpleGrid>

        {WIDGET_TYPES.length === 0 && (
          <Box textAlign="center" py={8}>
            <Text fontWeight="bold" color="gray.500" fontSize="11px">
              No widgets available yet
            </Text>
          </Box>
        )}
      </VStack>
    </Box>
  );
}
