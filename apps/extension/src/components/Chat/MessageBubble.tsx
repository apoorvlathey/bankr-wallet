import { useState } from "react";
import {
  Box,
  Button,
  HStack,
  IconButton,
  Link,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  CheckIcon,
  CopyIcon,
  LockIcon,
  RepeatIcon,
  WarningTwoIcon,
} from "@chakra-ui/icons";
import { Message } from "@/chrome/chatStorage";
import ShapesLoader from "./ShapesLoader";

const URL_REGEX = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g;

function parseContentWithLinks(
  content: string,
  linkColor: string,
): React.ReactNode[] {
  const parts = content.split(URL_REGEX);

  return parts.map((part, index) => {
    if (URL_REGEX.test(part)) {
      URL_REGEX.lastIndex = 0;
      return (
        <Link
          key={index}
          href={part}
          isExternal
          color={linkColor}
          textDecoration="underline"
          textUnderlineOffset="2px"
          fontWeight="600"
          overflowWrap="anywhere"
          _hover={{ opacity: 0.8 }}
          onClick={(event) => {
            event.preventDefault();
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

interface MessageFrameProps {
  label: string;
  timestamp: number;
  isUser?: boolean;
  isError?: boolean;
  children: React.ReactNode;
}

function MessageFrame({
  label,
  timestamp,
  isUser = false,
  isError = false,
  children,
}: MessageFrameProps) {
  return (
    <Box
      as="article"
      py={4}
      borderBottom="1px solid"
      borderColor="border.subtle"
      _last={{ borderBottomWidth: 0 }}
    >
      <VStack
        align={isUser ? "flex-end" : "stretch"}
        spacing={2}
        maxW={isUser ? "88%" : "full"}
        ml={isUser ? "auto" : 0}
      >
        <HStack
          w="full"
          justify={isUser ? "flex-end" : "space-between"}
          spacing={3}
        >
          {!isUser && (
            <HStack spacing={2} minW={0}>
              {isError && <WarningTwoIcon color="status.error.fg" boxSize={4} />}
              <Text fontSize="sm" fontWeight={600} color="fg.primary">
                {label}
              </Text>
            </HStack>
          )}
          <Text
            fontSize="xs"
            color="fg.muted"
            sx={{ fontVariantNumeric: "tabular-nums" }}
            flexShrink={0}
          >
            {new Date(timestamp).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
          {isUser && (
            <Text fontSize="sm" fontWeight={600} color="fg.primary">
              {label}
            </Text>
          )}
        </HStack>
        {children}
      </VStack>
    </Box>
  );
}

export function MessageBubble({
  message,
  statusText,
  isWalletUnlocked,
  onUnlock,
  onRetry,
  onResend,
}: MessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === "user";
  const isPending = message.status === "pending";
  const isError = message.status === "error";

  if (isPending) {
    return (
      <MessageFrame label="Bankr" timestamp={message.timestamp}>
        <HStack
          role="status"
          aria-live="polite"
          minH="44px"
          px={3}
          py={2}
          spacing={3}
          bg="surface.raised"
          border="1px solid"
          borderColor="border.default"
          borderRadius="lg"
        >
          <ShapesLoader size="7px" />
          <VStack align="stretch" spacing={0} minW={0}>
            <Text fontSize="sm" fontWeight={600} color="fg.primary">
              Bankr is working
            </Text>
            <Text fontSize="xs" color="fg.secondary" noOfLines={2}>
              {statusText || "Preparing a response…"}
            </Text>
          </VStack>
        </HStack>
      </MessageFrame>
    );
  }

  if (isError && message.isWalletLockedError && isWalletUnlocked) {
    return (
      <MessageFrame label="Bankr" timestamp={message.timestamp}>
        <Box
          role="status"
          bg="status.info.bg"
          color="status.info.fg"
          border="1px solid"
          borderColor="status.info.border"
          borderRadius="lg"
          p={3}
        >
          <Text fontSize="sm" lineHeight="1.5" mb={3}>
            Your wallet is unlocked. Send the last message to Bankr again.
          </Text>
          <Button
            variant="primary"
            minH="44px"
            leftIcon={<RepeatIcon boxSize={4} />}
            onClick={onRetry}
          >
            Send message again
          </Button>
        </Box>
      </MessageFrame>
    );
  }

  const messageSurface = isError
    ? {
        bg: "status.error.bg",
        color: "status.error.fg",
        borderColor: "status.error.border",
      }
    : isUser
      ? {
          bg: "surface.accentTint",
          color: "fg.primary",
          borderColor: "border.default",
        }
      : {
          bg: "transparent",
          color: "fg.primary",
          borderColor: "transparent",
        };

  return (
    <MessageFrame
      label={isUser ? "You" : isError ? "Bankr couldn’t finish" : "Bankr"}
      timestamp={message.timestamp}
      isUser={isUser}
      isError={isError}
    >
      <Box
        w="full"
        bg={messageSurface.bg}
        color={messageSurface.color}
        border={isUser || isError ? "1px solid" : "none"}
        borderColor={messageSurface.borderColor}
        borderRadius={isUser || isError ? "lg" : 0}
        px={isUser || isError ? 3 : 0}
        py={isUser || isError ? 3 : 0}
        role={isError ? "alert" : undefined}
      >
        <Text
          fontWeight="400"
          fontSize="sm"
          lineHeight="1.55"
          whiteSpace="pre-wrap"
          wordBreak="break-word"
        >
          {parseContentWithLinks(
            message.content,
            isError ? "status.error.fg" : "accent.secondary",
          )}
        </Text>

        <HStack justify="space-between" align="center" mt={3} spacing={2}>
          <HStack spacing={1}>
            {message.content && (
              <IconButton
                aria-label={copied ? "Message copied" : "Copy message"}
                icon={copied ? <CheckIcon boxSize={3.5} /> : <CopyIcon boxSize={4} />}
                minW="32px"
                w="32px"
                h="32px"
                size="xs"
                variant="ghost"
                color={copied ? "accent.highlight" : "fg.secondary"}
                onClick={async () => {
                  await navigator.clipboard.writeText(message.content);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
              />
            )}

            {isUser && onResend && (
              <IconButton
                aria-label="Send this message again"
                icon={<RepeatIcon boxSize={4} />}
                minW="32px"
                w="32px"
                h="32px"
                size="xs"
                variant="ghost"
                color="fg.secondary"
                onClick={() => onResend(message.content)}
              />
            )}
          </HStack>

          {isError && message.isWalletLockedError && (
            <Button
              size="sm"
              minH="40px"
              variant="secondary"
              leftIcon={isWalletUnlocked ? <RepeatIcon /> : <LockIcon />}
              onClick={isWalletUnlocked ? onRetry : onUnlock}
            >
              {isWalletUnlocked ? "Retry" : "Unlock wallet"}
            </Button>
          )}
        </HStack>
      </Box>
    </MessageFrame>
  );
}

export default MessageBubble;
