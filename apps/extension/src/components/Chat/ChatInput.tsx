import { useState, KeyboardEvent } from "react";
import { HStack, Input, IconButton, Box } from "@chakra-ui/react";
import { ArrowForwardIcon } from "@chakra-ui/icons";
import { useTheme } from "@/theme";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  isLoading,
  placeholder = "Ask Bankr...",
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const { themeId } = useTheme();
  const isDarkTheme = themeId === "midnight";

  const handleSend = () => {
    const trimmed = input.trim();
    if (trimmed && !isLoading) {
      onSend(trimmed);
      setInput("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <Box
      bg={isDarkTheme ? "transparent" : "surface.raised"}
      border={isDarkTheme ? "none" : "2px solid"}
      borderColor="border.default"
      boxShadow={isDarkTheme ? "none" : "card"}
      p={isDarkTheme ? 0 : 1.5}
    >
      <HStack spacing={2}>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          border="2px solid"
          borderColor="border.default"
          borderRadius="md"
          bg="surface.base"
          _hover={{ borderColor: "accent.secondary" }}
          _focus={{
            borderColor: "accent.secondary",
            boxShadow: "none",
          }}
          _disabled={{
            opacity: 0.6,
            cursor: "not-allowed",
          }}
          fontWeight="500"
          fontSize="sm"
        />
        <IconButton
          aria-label="Send message"
          icon={<ArrowForwardIcon />}
          onClick={handleSend}
          isDisabled={!input.trim() || isLoading}
          bg="accent.secondary"
          color="accentFg.secondary"
          border="2px solid"
          borderColor="border.default"
          borderRadius="md"
          _hover={{
            // Bauhaus shifts blue → red on hover (accent.secondary →
            // accent.primary). In Midnight that becomes cyan → indigo, which
            // reads as the same "warm up on hover" beat in either palette.
            bg: "accent.primary",
            transform: "translateY(-1px)",
          }}
          _active={{
            transform: "translate(2px, 2px)",
          }}
          _disabled={{
            opacity: 0.5,
            cursor: "not-allowed",
            _hover: { bg: "accent.secondary", transform: "none" },
          }}
        />
      </HStack>
    </Box>
  );
}

export default ChatInput;
