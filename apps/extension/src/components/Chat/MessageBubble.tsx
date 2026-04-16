import { useState } from "react";
import { Box, Text, Link, Button, HStack, IconButton } from "@chakra-ui/react";
import { LockIcon, RepeatIcon, CopyIcon, CheckIcon } from "@chakra-ui/icons";
import { Message } from "@/chrome/chatStorage";
import { useIsDarkTheme } from "@/theme";
import ShapesLoader from "./ShapesLoader";


// URL regex pattern
const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g;

/**
 * Parse text and convert URLs to clickable links
 */
function parseContentWithLinks(
  content: string,
  linkColor: string
): React.ReactNode[] {
  const parts = content.split(URL_REGEX);

  return parts.map((part, index) => {
    if (URL_REGEX.test(part)) {
      // Reset regex lastIndex since we're reusing it
      URL_REGEX.lastIndex = 0;
      return (
        <Link
          key={index}
          href={part}
          isExternal
          color={linkColor}
          textDecoration="underline"
          fontWeight="600"
          _hover={{ opacity: 0.8 }}
          onClick={(e) => {
            e.preventDefault();
            chrome.tabs.create({ url: part });
          }}
        >
          {part}
        </Link>
      );
    }
    return part;
  });
}

interface MessageBubbleProps {
  message: Message;
  statusText?: string | null;
  isWalletUnlocked?: boolean;
  onUnlock?: () => void;
  onRetry?: () => void;
  onResend?: (content: string) => void;
}

export function MessageBubble({ message, statusText, isWalletUnlocked, onUnlock, onRetry, onResend }: MessageBubbleProps) {
  const isDarkTheme = useIsDarkTheme();
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const isPending = message.status === "pending";
  const isError = message.status === "error";

  // User bubble — secondary accent (Bauhaus blue / Midnight cyan). Reads as
  // the "cool / your input" half of the cool–warm pair with the assistant.
  const userStyles = {
    bg: "accent.secondary",
    color: "accentFg.secondary",
  };

  // Assistant bubble — highlight accent (Bauhaus yellow / Midnight amber).
  // The "warm / response" half of the pair.
  const assistantStyles = {
    bg: "accent.highlight",
    color: "accentFg.highlight",
  };

  // Error bubble — semantic status. Bauhaus paints saturated red/white;
  // Midnight uses the recessed dark error tint with bright error foreground.
  const errorStyles = {
    bg: "status.error.bg",
    color: "status.error.fg",
  };

  const styles = isError ? errorStyles : isUser ? userStyles : assistantStyles;

  // Compact loader for pending state
  if (isPending) {
    return (
      <Box
        display="flex"
        justifyContent="flex-start"
        mb={2}
      >
        <Box
          bg="accent.highlight"
          border="2px solid"
          borderColor="border.default"
          boxShadow="card"
          px={3}
          py={2}
        >
          <HStack spacing={2}>
            <ShapesLoader size="10px" />
            {statusText && (
              <Text
                fontSize="xs"
                fontWeight="600"
                color="accentFg.highlight"
                opacity={0.8}
                fontStyle="italic"
              >
                {statusText}
              </Text>
            )}
          </HStack>
        </Box>
      </Box>
    );
  }

  // Show "Send message to Bankr" button when wallet is unlocked after a lock error
  if (isError && message.isWalletLockedError && isWalletUnlocked) {
    return (
      <Box
        display="flex"
        justifyContent="flex-start"
        mb={2}
      >
        <Box
          bg="accent.highlight"
          border="2px solid"
          borderColor="border.default"
          boxShadow="card"
          p={3}
          position="relative"
        >
          {/* Bauhaus geometric decoration — a tiny red square in the corner.
              Midnight skips ornaments entirely (decorators field omitted). */}
          {!isDarkTheme && (
            <Box
              position="absolute"
              top="-4px"
              left="-4px"
              w="8px"
              h="8px"
              bg="accent.primary"
              border="1.5px solid"
              borderColor="border.default"
            />
          )}

          <Button
            bg="surface.raised"
            color="fg.primary"
            border="2px solid"
            borderColor="border.default"
            boxShadow="card"
            borderRadius="0"
            fontWeight="700"
            textTransform="uppercase"
            letterSpacing="wider"
            fontSize="sm"
            px={4}
            py={3}
            h="auto"
            leftIcon={<RepeatIcon boxSize={4} />}
            transition="all 0.15s ease-out"
            _hover={{
              // Bauhaus inverts to black-on-white on hover; Midnight inverts
              // to its light fg-on-dark inverse, same swap intent.
              bg: "fg.primary",
              color: "fg.inverse",
              transform: "translateY(-1px)",
              boxShadow: "cardHover",
            }}
            _active={{
              transform: "translate(2px, 2px)",
              boxShadow: "none",
            }}
            onClick={onRetry}
          >
            Send message to Bankr
          </Button>
        </Box>
      </Box>
    );
  }

  return (
    <Box
      display="flex"
      justifyContent={isUser ? "flex-end" : "flex-start"}
      mb={2}
    >
      <Box
        maxW="90%"
        bg={styles.bg}
        color={styles.color}
        border="2px solid"
        borderColor="border.default"
        boxShadow="card"
        p={2}
        position="relative"
        role="group"
      >
        {/* Bauhaus geometric corner ornament — red square (assistant) or red
            circle (user). Midnight omits ornaments. */}
        {!isDarkTheme && (
          <Box
            position="absolute"
            top="-4px"
            right={isUser ? "-4px" : "auto"}
            left={isUser ? "auto" : "-4px"}
            w="8px"
            h="8px"
            bg="accent.primary"
            borderRadius={isUser ? "full" : 0}
            border="1.5px solid"
            borderColor="border.default"
          />
        )}

        <Text
          fontWeight="500"
          fontSize="sm"
          lineHeight="1.5"
          whiteSpace="pre-wrap"
          wordBreak="break-word"
        >
          {parseContentWithLinks(
            message.content,
            // Cross-tint links: on the cool user bubble use the warm
            // highlight; on the warm assistant bubble use the cool secondary.
            // Same crossover in either palette (blue↔yellow / cyan↔amber).
            isUser ? "accent.highlight" : "accent.secondary"
          )}
        </Text>

        <HStack justify="space-between" align="center" mt={2}>
          <HStack spacing={1}>
            <Text
              fontSize="xs"
              opacity={0.7}
              fontWeight="700"
              textTransform="uppercase"
              letterSpacing="wider"
            >
              {new Date(message.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>

            {/* Copy button - visible on hover */}
            {message.content && (
              <IconButton
                aria-label="Copy message"
                icon={copied ? <CheckIcon /> : <CopyIcon />}
                size="xs"
                variant="ghost"
                color={copied ? "accent.highlight" : styles.color}
                opacity={copied ? 0.7 : 0}
                _groupHover={{ opacity: 0.7 }}
                _hover={{ opacity: "1 !important" }}
                minW="auto"
                h="auto"
                p={0.5}
                onClick={async () => {
                  await navigator.clipboard.writeText(message.content);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              />
            )}

            {/* Resend button - only on user messages, visible on hover */}
            {isUser && onResend && (
              <IconButton
                aria-label="Resend message"
                icon={<RepeatIcon />}
                size="xs"
                variant="ghost"
                color={styles.color}
                opacity={0}
                _groupHover={{ opacity: 0.7 }}
                _hover={{ opacity: "1 !important" }}
                minW="auto"
                h="auto"
                p={0.5}
                onClick={() => onResend(message.content)}
              />
            )}
          </HStack>

          {/* Show Unlock/Retry button for wallet locked errors */}
          {isError && message.isWalletLockedError && (
            isWalletUnlocked ? (
              <Button
                size="xs"
                bg="surface.raised"
                color="fg.primary"
                border="2px solid"
                borderColor="border.default"
                borderRadius="0"
                fontWeight="700"
                textTransform="uppercase"
                fontSize="xs"
                leftIcon={<RepeatIcon />}
                _hover={{
                  bg: "accent.highlight",
                  color: "accentFg.highlight",
                }}
                onClick={onRetry}
              >
                Retry
              </Button>
            ) : (
              <Button
                size="xs"
                bg="surface.raised"
                color="fg.primary"
                border="2px solid"
                borderColor="border.default"
                borderRadius="0"
                fontWeight="700"
                textTransform="uppercase"
                fontSize="xs"
                leftIcon={<LockIcon />}
                _hover={{
                  bg: "accent.highlight",
                  color: "accentFg.highlight",
                }}
                onClick={onUnlock}
              >
                Unlock
              </Button>
            )
          )}
        </HStack>
      </Box>
    </Box>
  );
}

export default MessageBubble;
