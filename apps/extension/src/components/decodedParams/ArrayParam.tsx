import { Box, HStack, VStack, Code, Collapse, useDisclosure } from "@chakra-ui/react";
import { ChevronDownIcon, ChevronRightIcon } from "@chakra-ui/icons";
import type { DecodeArrayParamResult } from "@/lib/decoder/types";
import { renderParams } from "@/components/renderParams";

interface ArrayParamProps {
  value: DecodeArrayParamResult;
  type: string;
  chainId: number;
}

export function ArrayParam({ value, chainId }: ArrayParamProps) {
  const { isOpen, onToggle } = useDisclosure();

  if (!Array.isArray(value) || value.length === 0) {
    return (
      <Code fontSize="xs" fontFamily="mono" bg="transparent" color="text.tertiary" fontWeight="600" p={0}>
        []
      </Code>
    );
  }

  // Collapsed summary
  const summary = `[${value.length} item${value.length !== 1 ? "s" : ""}]`;

  return (
    <VStack align="start" spacing={1} w="full">
      {/* Collapsed header */}
      <HStack spacing={1} align="center" cursor="pointer" onClick={onToggle}>
        {isOpen ? <ChevronDownIcon boxSize={3} /> : <ChevronRightIcon boxSize={3} />}
        <Code
          fontSize="xs"
          fontFamily="mono"
          bg="transparent"
          color="text.tertiary"
          fontWeight="600"
          p={0}
        >
          {summary}
        </Code>
      </HStack>

      {/* Expanded items */}
      <Collapse in={isOpen} animateOpacity>
        <Box pl={3} borderLeft="2px solid" borderColor="border.default" w="full">
          <VStack align="start" spacing={1.5} w="full">
            {value.map((item, i) => {
              const indexedItem = {
                ...item,
                name: item.name || `[${i}]`,
              };
              return renderParams(i, indexedItem, chainId);
            })}
          </VStack>
        </Box>
      </Collapse>
    </VStack>
  );
}
