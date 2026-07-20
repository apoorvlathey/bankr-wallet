import { CheckIcon, CopyIcon, ViewIcon, ViewOffIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  Code,
  HStack,
  IconButton,
  SimpleGrid,
  Text,
  VStack,
} from "@chakra-ui/react";

interface Props {
  phrase: string;
  visible: boolean;
  copied: boolean;
  onToggleVisibility: () => void;
  onCopy: () => void;
}

export function RecoveryPhrasePanel({
  phrase,
  visible,
  copied,
  onToggleVisibility,
  onCopy,
}: Props) {
  const words = phrase.split(" ");
  return (
    <VStack align="stretch" spacing={3}>
      <Box
        position="relative"
        bg="surface.sunken"
        border="1px solid"
        borderColor="border.default"
        borderRadius="lg"
        px={3}
        pb={3}
        pt={11}
      >
        <IconButton
          position="absolute"
          top={2}
          right={2}
          aria-label={visible ? "Hide Shield recovery phrase" : "Show Shield recovery phrase"}
          icon={visible ? <ViewOffIcon /> : <ViewIcon />}
          variant="ghost"
          size="sm"
          color="fg.secondary"
          onClick={onToggleVisibility}
        />
        <SimpleGrid columns={2} spacingX={3} spacingY={2}>
          {words.map((word, index) => (
            <HStack key={`${index}-${word}`} spacing={2} minW={0}>
              <Text minW="20px" color="fg.muted" fontSize="xs" textAlign="end">
                {index + 1}
              </Text>
              <Code
                bg="transparent"
                color="fg.primary"
                fontFamily="mono"
                fontSize="sm"
                fontWeight="500"
                noOfLines={1}
              >
                {visible ? word : "••••"}
              </Code>
            </HStack>
          ))}
        </SimpleGrid>
      </Box>
      <Button
        variant="secondary"
        leftIcon={copied ? <CheckIcon /> : <CopyIcon />}
        onClick={onCopy}
      >
        {copied ? "Copied" : "Copy phrase"}
      </Button>
      <Text fontSize="xs" color="fg.secondary">
        This phrase hides automatically after one minute.
      </Text>
    </VStack>
  );
}
