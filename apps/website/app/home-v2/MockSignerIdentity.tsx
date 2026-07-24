"use client";

import { HStack, Image, Text, VStack } from "@chakra-ui/react";
import { warmMockup } from "./design";

export function MockSignerIdentity({ avatarSize = 22 }: { avatarSize?: number }) {
  return (
    <HStack spacing={1.5} minW={0}>
      <Image
        src="/images/home-v2/apoorv-eth.png"
        alt="Apoorv's ENS avatar"
        boxSize={`${avatarSize}px`}
        flexShrink={0}
        borderRadius="7px"
        objectFit="cover"
        border="1px solid"
        borderColor={warmMockup.borderStrong}
      />
      <VStack align="start" spacing={0} minW={0}>
        <Text fontSize="11px" lineHeight="1.1" fontWeight="700" noOfLines={1}>
          apoorv.eth
        </Text>
        <Text color={warmMockup.secondary} fontFamily="mono" fontSize="9px" noOfLines={1}>
          0x63A5...1ff2
        </Text>
      </VStack>
    </HStack>
  );
}
