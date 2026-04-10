import { useState, KeyboardEvent } from "react";
import { HStack, Input, IconButton, Box } from "@chakra-ui/react";
import { ArrowForwardIcon, SmallCloseIcon } from "@chakra-ui/icons";

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  onCancel?: () => void;
  placeholder?: string;
}

export function ChatInput({
  onSend,
  isLoading,
  onCancel,
  placeholder = "Ask Bankr...",
}: ChatInputProps) {
  const [input, setInput] = useState("");

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
      bg="bauhaus.white"
      border="2px solid"
      borderColor="bauhaus.black"
      boxShadow="3px 3px 0px 0px #121212"
      p={1.5}
    >
      <HStack spacing={2}>
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          border="2px solid"
          borderColor="bauhaus.black"
          borderRadius="0"
          bg="bg.base"
          _hover={{ borderColor: "bauhaus.blue" }}
          _focus={{
            borderColor: "bauhaus.blue",
            boxShadow: "none",
          }}
          _disabled={{
            opacity: 0.6,
            cursor: "not-allowed",
          }}
          fontWeight="500"
          fontSize="sm"
        />
        {isLoading && onCancel ? (
          <IconButton
            aria-label="Stop generation"
            icon={<SmallCloseIcon boxSize={5} />}
            onClick={onCancel}
            bg="bauhaus.red"
            color="bauhaus.white"
            border="2px solid"
            borderColor="bauhaus.black"
            borderRadius="0"
            _hover={{
              bg: "bauhaus.black",
              transform: "translateY(-1px)",
            }}
            _active={{
              transform: "translate(2px, 2px)",
            }}
          />
        ) : (
          <IconButton
            aria-label="Send message"
            icon={<ArrowForwardIcon />}
            onClick={handleSend}
            isDisabled={!input.trim() || isLoading}
            bg="bauhaus.blue"
            color="bauhaus.white"
            border="2px solid"
            borderColor="bauhaus.black"
            borderRadius="0"
            _hover={{
              bg: "bauhaus.red",
              transform: "translateY(-1px)",
            }}
            _active={{
              transform: "translate(2px, 2px)",
            }}
            _disabled={{
              opacity: 0.5,
              cursor: "not-allowed",
              _hover: { bg: "bauhaus.blue", transform: "none" },
            }}
          />
        )}
      </HStack>
    </Box>
  );
}

export default ChatInput;
