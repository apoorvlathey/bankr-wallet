import { useState } from "react";
import { Box, Text, Link, Button, HStack, IconButton, Code, ListItem, UnorderedList, OrderedList } from "@chakra-ui/react";
import { LockIcon, RepeatIcon, CopyIcon, CheckIcon } from "@chakra-ui/icons";
import { Message } from "@/chrome/chatStorage";
import ShapesLoader from "./ShapesLoader";

/**
 * Parse inline markdown (bold, italic, code, links) within a single line.
 */
function parseInlineMarkdown(
  text: string,
  linkColor: string,
  keyPrefix: string
): React.ReactNode[] {
  // Order matters: bold before italic, code before both
  const inlineRegex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))|(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/g;
  const result: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = inlineRegex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      result.push(text.slice(lastIndex, match.index));
    }
    const m = match[0];
    const key = `${keyPrefix}-${match.index}`;

    if (match[1]) {
      // Inline code: `code`
      result.push(
        <Code key={key} bg="blackAlpha.200" px={1} py={0.5} fontSize="xs" fontWeight="600" borderRadius="2px">
          {m.slice(1, -1)}
        </Code>
      );
    } else if (match[2]) {
      // Bold: **text**
      result.push(<Text as="span" key={key} fontWeight="800">{m.slice(2, -2)}</Text>);
    } else if (match[3]) {
      // Italic: *text*
      result.push(<Text as="span" key={key} fontStyle="italic">{m.slice(1, -1)}</Text>);
    } else if (match[4]) {
      // Markdown link: [text](url)
      const linkMatch = /\[([^\]]+)\]\(([^)]+)\)/.exec(m);
      if (linkMatch) {
        result.push(
          <Link key={key} href={linkMatch[2]} isExternal color={linkColor} textDecoration="underline" fontWeight="600" _hover={{ opacity: 0.8 }}
            onClick={(e) => { e.preventDefault(); chrome.tabs.create({ url: linkMatch[2] }); }}>
            {linkMatch[1]}
          </Link>
        );
      }
    } else if (match[5]) {
      // Plain URL
      result.push(
        <Link key={key} href={m} isExternal color={linkColor} textDecoration="underline" fontWeight="600" _hover={{ opacity: 0.8 }}
          onClick={(e) => { e.preventDefault(); chrome.tabs.create({ url: m }); }}>
          {m}
        </Link>
      );
    }
    lastIndex = match.index + m.length;
  }

  if (lastIndex < text.length) {
    result.push(text.slice(lastIndex));
  }

  return result.length > 0 ? result : [text];
}

/**
 * Render markdown content as React nodes.
 * Supports: bold, italic, inline code, code blocks, lists, headers, links, URLs.
 */
function renderMarkdown(content: string, linkColor: string): React.ReactNode {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block: ```
    if (line.trimStart().startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trimStart().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <Code key={`code-${i}`} display="block" bg="blackAlpha.200" p={2} my={1} fontSize="xs" fontWeight="600" whiteSpace="pre-wrap" wordBreak="break-word" borderRadius="2px" w="100%">
          {codeLines.join("\n")}
        </Code>
      );
      continue;
    }

    // Headers: # ## ###
    const headerMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const sizes = ["md", "sm", "sm"] as const;
      elements.push(
        <Text key={`h-${i}`} fontWeight="900" fontSize={sizes[level - 1]} mt={level === 1 ? 1 : 0.5} mb={0.5}>
          {parseInlineMarkdown(headerMatch[2], linkColor, `h${i}`)}
        </Text>
      );
      i++;
      continue;
    }

    // Unordered list items: - or *
    if (/^\s*[-*]\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*[-*]\s+/, "");
        items.push(
          <ListItem key={`li-${i}`} fontSize="sm" fontWeight="500">
            {parseInlineMarkdown(itemText, linkColor, `li${i}`)}
          </ListItem>
        );
        i++;
      }
      elements.push(
        <UnorderedList key={`ul-${i}`} pl={2} my={0.5} spacing={0.5}>
          {items}
        </UnorderedList>
      );
      continue;
    }

    // Ordered list items: 1. 2. etc
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const itemText = lines[i].replace(/^\s*\d+\.\s+/, "");
        items.push(
          <ListItem key={`oli-${i}`} fontSize="sm" fontWeight="500">
            {parseInlineMarkdown(itemText, linkColor, `oli${i}`)}
          </ListItem>
        );
        i++;
      }
      elements.push(
        <OrderedList key={`ol-${i}`} pl={2} my={0.5} spacing={0.5}>
          {items}
        </OrderedList>
      );
      continue;
    }

    // Empty line → small spacer
    if (line.trim() === "") {
      elements.push(<Box key={`sp-${i}`} h={1} />);
      i++;
      continue;
    }

    // Regular paragraph
    elements.push(
      <Text key={`p-${i}`} fontSize="sm" fontWeight="500" lineHeight="1.5">
        {parseInlineMarkdown(line, linkColor, `p${i}`)}
      </Text>
    );
    i++;
  }

  return <>{elements}</>;
}

interface MessageBubbleProps {
  message: Message;
  statusText?: string | null;
  streamContent?: string | null;
  isWalletUnlocked?: boolean;
  onUnlock?: () => void;
  onRetry?: () => void;
  onResend?: (content: string) => void;
}

export function MessageBubble({ message, statusText, streamContent, isWalletUnlocked, onUnlock, onRetry, onResend }: MessageBubbleProps) {
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

  // Pending state — show streaming content if available, else show loader
  if (isPending) {
    // Streaming content: show the response as it arrives
    if (streamContent) {
      return (
        <Box display="flex" justifyContent="flex-start" mb={2}>
          <Box
            maxW="90%"
            bg="bauhaus.yellow"
            color="bauhaus.black"
            border="2px solid"
            borderColor="bauhaus.black"
            boxShadow="3px 3px 0px 0px #121212"
            p={2}
            position="relative"
          >
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
            <Box wordBreak="break-word">
              {renderMarkdown(streamContent, "bauhaus.blue")}
            </Box>
            <HStack spacing={2} mt={1}>
              <ShapesLoader size="8px" />
            </HStack>
          </Box>
        </Box>
      );
    }

    // No streaming content yet — show compact loader with status text
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

        <Box wordBreak="break-word">
          {isUser ? (
            <Text fontWeight="500" fontSize="sm" lineHeight="1.5" whiteSpace="pre-wrap">
              {message.content}
            </Text>
          ) : (
            renderMarkdown(message.content, isUser ? "bauhaus.yellow" : "bauhaus.blue")
          )}
        </Box>

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
