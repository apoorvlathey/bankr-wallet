import { useState, KeyboardEvent } from "react";
import { HStack, Input, IconButton, FormLabel } from "@chakra-ui/react";
import { ArrowForwardIcon } from "@chakra-ui/icons";

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
    <HStack as="form" spacing={2} onSubmit={(event) => {
      event.preventDefault();
      handleSend();
    }}>
      <FormLabel htmlFor="bankr-chat-message" srOnly m={0}>
        Message Bankr
      </FormLabel>
      <Input
        id="bankr-chat-message"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={isLoading}
        minH="44px"
        fontWeight="500"
        fontSize="16px"
        autoComplete="off"
      />
      <IconButton
        type="submit"
        aria-label={isLoading ? "Bankr is responding" : "Send message"}
        icon={<ArrowForwardIcon boxSize={5} />}
        variant="primary"
        minW="44px"
        w="44px"
        h="44px"
        isDisabled={!input.trim() || isLoading}
      />
    </HStack>
  );
}

export default ChatInput;
