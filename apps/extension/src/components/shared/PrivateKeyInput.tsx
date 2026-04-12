import { useState } from "react";
import {
  Box,
  VStack,
  HStack,
  Text,
  Input,
  Button,
  FormControl,
  FormLabel,
  FormErrorMessage,
  InputGroup,
  InputRightElement,
  IconButton,
  Code,
} from "@chakra-ui/react";
import { ViewIcon, ViewOffIcon, CheckIcon, RepeatIcon, CopyIcon } from "@chakra-ui/icons";
import { generatePrivateKey } from "@/utils/privateKeyUtils";
import { useTheme } from "@/theme";

type PkMode = "import" | "generate";

interface PrivateKeyInputProps {
  privateKey: string;
  onPrivateKeyChange: (key: string) => void;
  derivedAddress: string | null;
  error?: string;
  onClearError?: () => void;
  onContinue?: () => void;
  autoFocus?: boolean;
}

export default function PrivateKeyInput({
  privateKey,
  onPrivateKeyChange,
  derivedAddress,
  error,
  onClearError,
  onContinue,
  autoFocus,
}: PrivateKeyInputProps) {
  const { themeId } = useTheme();
  const isDarkTheme = themeId === "midnight";
  const [pkMode, setPkMode] = useState<PkMode>("import");
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [pkCopied, setPkCopied] = useState(false);

  return (
    <>
      {/* Import / Generate Toggle — active state uses fg.primary as a high-contrast
          "selected" pill in either palette. */}
      <HStack spacing={2} mb={4}>
        <Button
          size="sm"
          bg={pkMode === "import" ? "fg.primary" : "surface.raised"}
          color={pkMode === "import" ? "surface.raised" : "text.primary"}
          border="2px solid"
          borderColor="border.default"
          fontWeight="700"
          textTransform="uppercase"
          fontSize="xs"
          onClick={() => {
            setPkMode("import");
            onPrivateKeyChange("");
          }}
          _hover={{ opacity: 0.9 }}
        >
          Import Existing
        </Button>
        <Button
          size="sm"
          bg={pkMode === "generate" ? "fg.primary" : "surface.raised"}
          color={pkMode === "generate" ? "surface.raised" : "text.primary"}
          border="2px solid"
          borderColor="border.default"
          fontWeight="700"
          textTransform="uppercase"
          fontSize="xs"
          onClick={() => {
            setPkMode("generate");
            const newKey = generatePrivateKey();
            onPrivateKeyChange(newKey);
            setShowPrivateKey(false);
          }}
          _hover={{ opacity: 0.9 }}
        >
          Generate New
        </Button>
      </HStack>

      {pkMode === "import" ? (
        <FormControl isInvalid={!!error}>
          <FormLabel color="text.secondary" fontSize="xs" fontWeight="700" textTransform="uppercase">
            Private Key
          </FormLabel>
          <InputGroup>
            <Input
              type={showPrivateKey ? "text" : "password"}
              placeholder="0x..."
              value={privateKey}
              autoFocus={autoFocus}
              fontFamily="mono"
              onChange={(e) => {
                onPrivateKeyChange(e.target.value);
                if (error) onClearError?.();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") onContinue?.();
              }}
              pr="3rem"
            />
            <InputRightElement>
              <IconButton
                aria-label={showPrivateKey ? "Hide" : "Show"}
                icon={showPrivateKey ? <ViewOffIcon /> : <ViewIcon />}
                size="sm"
                variant="ghost"
                onClick={() => setShowPrivateKey(!showPrivateKey)}
                color="text.secondary"
                tabIndex={-1}
              />
            </InputRightElement>
          </InputGroup>
          <FormErrorMessage color="chart.negative" fontWeight="700">
            {error}
          </FormErrorMessage>
        </FormControl>
      ) : (
        <VStack spacing={4} align="stretch">
          <FormControl isInvalid={!!error}>
            <FormLabel color="text.secondary" fontSize="xs" fontWeight="700" textTransform="uppercase">
              Generated Private Key
            </FormLabel>
            <InputGroup>
              <Input
                type={showPrivateKey ? "text" : "password"}
                value={privateKey}
                readOnly
                fontFamily="mono"
                fontSize="xs"
                pr="4.5rem"
              />
              <InputRightElement w="4.5rem">
                <HStack spacing={0}>
                  <IconButton
                    aria-label={showPrivateKey ? "Hide" : "Show"}
                    icon={showPrivateKey ? <ViewOffIcon /> : <ViewIcon />}
                    size="xs"
                    variant="ghost"
                    onClick={() => setShowPrivateKey(!showPrivateKey)}
                    color="text.secondary"
                    tabIndex={-1}
                  />
                  <IconButton
                    aria-label="Copy private key"
                    icon={pkCopied ? <CheckIcon color="chart.positive" /> : <CopyIcon />}
                    size="xs"
                    variant="ghost"
                    onClick={async () => {
                      await navigator.clipboard.writeText(privateKey);
                      setPkCopied(true);
                      setTimeout(() => setPkCopied(false), 2000);
                    }}
                    color={pkCopied ? "chart.positive" : "text.secondary"}
                    tabIndex={-1}
                  />
                </HStack>
              </InputRightElement>
            </InputGroup>
            <FormErrorMessage color="chart.negative" fontWeight="700">
              {error}
            </FormErrorMessage>
          </FormControl>

          <HStack spacing={2} align="center">
            <Text fontSize="xs" color="chart.negative" fontWeight="700" whiteSpace="nowrap">
              Save this key — cannot be recovered!
            </Text>
            <Box flex={1} h="2px" bg="chart.negative" />
            <HStack
              as="button"
              spacing={1}
              onClick={() => {
                const newKey = generatePrivateKey();
                onPrivateKeyChange(newKey);
                setShowPrivateKey(false);
                setPkCopied(false);
              }}
              cursor="pointer"
              opacity={0.5}
              _hover={{ opacity: 1 }}
              transition="opacity 0.15s"
              flexShrink={0}
            >
              <RepeatIcon boxSize="10px" color="text.secondary" />
              <Text fontSize="10px" color="text.secondary" fontWeight="700" textTransform="uppercase" letterSpacing="wider">
                Regenerate
              </Text>
            </HStack>
          </HStack>
        </VStack>
      )}

      {derivedAddress && (
        <Box
          mt={4}
          p={3}
          bg={isDarkTheme ? "status.success.bg" : "accent.highlight"}
          border="2px solid"
          borderColor={isDarkTheme ? "status.success.border" : "border.default"}
          boxShadow="card"
        >
          <HStack spacing={2} align="center">
            <Box
              w="22px"
              h="22px"
              minW="22px"
              bg={isDarkTheme ? "chart.positive" : "accent.secondary"}
              border="2px solid"
              borderColor={isDarkTheme ? "status.success.border" : "border.default"}
              borderRadius="full"
              display="flex"
              alignItems="center"
              justifyContent="center"
            >
              <CheckIcon boxSize="10px" color={isDarkTheme ? "fg.inverse" : "accentFg.secondary"} />
            </Box>
            <Code
              fontSize="10px"
              bg={isDarkTheme ? "surface.sunken" : "surface.raised"}
              color="text.primary"
              fontFamily="mono"
              fontWeight="700"
              p={1.5}
              border="2px solid"
              borderColor={isDarkTheme ? "border.strong" : "border.default"}
              overflow="hidden"
              textOverflow="ellipsis"
              whiteSpace="nowrap"
              title={derivedAddress}
              flex={1}
            >
              {derivedAddress}
            </Code>
          </HStack>
        </Box>
      )}
    </>
  );
}
