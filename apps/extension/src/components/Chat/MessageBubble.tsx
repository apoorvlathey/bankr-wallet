import { useState } from "react";
import { Box, Text, Link, Button, HStack, IconButton } from "@chakra-ui/react";
import { LockIcon, RepeatIcon, CopyIcon, CheckIcon } from "@chakra-ui/icons";
import { Message } from "@/chrome/chatStorage";
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
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const isPending = message.status === "pending";
  const isError = message.status === "error";

  const userStyles = {
    bg: "bauhaus.blue",
    color: "bauhaus.white",
  };

  const assistantStyles = {
    bg: "bauhaus.yellow",
    color: "bauhaus.black",
  };

  const errorStyles = {
    bg: "bauhaus.red",
    color: "bauhaus.white",
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
          bg="bauhaus.yellow"
          border="2px solid"
          borderColor="bauhaus.black"
          boxShadow="3px 3px 0px 0px #121212"
          px={3}
          py={2}
        >
          <HStack spacing={2}>
            <ShapesLoader size="10px" />
            {statusText && (
              <Text
                fontSize="xs"
                fontWeight="600"
                color="bauhaus.black"
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
          bg="bauhaus.yellow"
          border="2px solid"
          borderColor="bauhaus.black"
          boxShadow="3px 3px 0px 0px #121212"
          p={3}
          position="relative"
        >
          {/* Geometric decoration */}
          <Box
            position="absolute"
            top="-4px"
            left="-4px"
            w="8px"
            h="8px"
            bg="bauhaus.red"
            border="1.5px solid"
            borderColor="bauhaus.black"
          />

          <Button
            bg="bauhaus.white"
            color="bauhaus.black"
            border="2px solid"
            borderColor="bauhaus.black"
            boxShadow="3px 3px 0px 0px #121212"
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
              bg: "bauhaus.black",
              color: "bauhaus.white",
              transform: "translateY(-1px)",
              boxShadow: "4px 4px 0px 0px #121212",
            }}
            _active={{
              transform: "translate(2px, 2px)",
              boxShadow: "1px 1px 0px 0px #121212",
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
        borderColor="bauhaus.black"
        boxShadow="3px 3px 0px 0px #121212"
        p={2}
        position="relative"
        role="group"
      >
        {/* Geometric decoration */}
        <Box
          position="absolute"
          top="-4px"
          right={isUser ? "-4px" : "auto"}
          left={isUser ? "auto" : "-4px"}
          w="8px"
          h="8px"
          bg="bauhaus.red"
          borderRadius={isUser ? "full" : 0}
          border="1.5px solid"
          borderColor="bauhaus.black"
        />

        <Text
          fontWeight="500"
          fontSize="sm"
          lineHeight="1.5"
          whiteSpace="pre-wrap"
          wordBreak="break-word"
        >
          {parseContentWithLinks(
            message.content,
            isUser ? "bauhaus.yellow" : "bauhaus.blue"
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
                color={copied ? "bauhaus.yellow" : styles.color}
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
                bg="bauhaus.white"
                color="bauhaus.black"
                border="2px solid"
                borderColor="bauhaus.black"
                borderRadius="0"
                fontWeight="700"
                textTransform="uppercase"
                fontSize="xs"
                leftIcon={<RepeatIcon />}
                _hover={{
                  bg: "bauhaus.yellow",
                }}
                onClick={onRetry}
              >
                Retry
              </Button>
            ) : (
              <Button
                size="xs"
                bg="bauhaus.white"
                color="bauhaus.black"
                border="2px solid"
                borderColor="bauhaus.black"
                borderRadius="0"
                fontWeight="700"
                textTransform="uppercase"
                fontSize="xs"
                leftIcon={<LockIcon />}
                _hover={{
                  bg: "bauhaus.yellow",
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
