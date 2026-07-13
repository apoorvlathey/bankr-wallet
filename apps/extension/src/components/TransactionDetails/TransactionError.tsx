import { Box, Button, Collapse, HStack, Text } from "@chakra-ui/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  RepeatIcon,
} from "@chakra-ui/icons";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { CopyButton } from "@/components/CopyButton";

export default function TransactionError({
  tx,
  canRebroadcast,
  isRebroadcasting,
  rebroadcastBg,
  rebroadcastFg,
  expanded,
  onToggle,
  onRebroadcast,
}: {
  tx: CompletedTransaction;
  canRebroadcast: boolean;
  isRebroadcasting: boolean;
  rebroadcastBg: string;
  rebroadcastFg: string;
  expanded: boolean;
  onToggle: () => void;
  onRebroadcast: () => void;
}) {
  return (
    <>
      {/* Error for failed txs. viem errors (e.g. HttpRequestError) render
          as "shortMessage\n\nStatus: …\nURL: …\nRequest body: {giant
          hex…}" — when that lands here verbatim it pushes the modal
          into a wall of unreadable hex. We split on the first newline:
          the line above it is the human-readable summary (viem's
          shortMessage), everything below goes behind a "Show details"
          collapse. Single-line errors render inline as before. */}
      {tx.status === "failed" && tx.error && (() => {
        const errorText = tx.error;
        const newlineIdx = errorText.indexOf("\n");
        const hasDetail = newlineIdx !== -1;
        const errorShort = hasDetail
          ? errorText.slice(0, newlineIdx).trim()
          : errorText;
        const errorDetail = hasDetail
          ? errorText.slice(newlineIdx + 1).trim()
          : "";

        return (
          <Box
            p={3}
            bg="status.error.bg"
            border="2px solid"
            borderColor="border.default"
            borderRadius="md"
          >
            <Text fontSize="xs" color="status.error.fg" fontWeight="700" mb={0.5} textTransform="uppercase">
              Error
            </Text>
            <Text fontSize="xs" color="status.error.fg" fontWeight="500">
              {errorShort}
            </Text>

            {hasDetail && (
              <>
                <HStack
                  mt={2}
                  spacing={1}
                  cursor="pointer"
                  onClick={() => onToggle()}
                  w="fit-content"
                  _hover={{ opacity: 0.8 }}
                >
                  <Text
                    fontSize="2xs"
                    color="status.error.fg"
                    fontWeight="700"
                    textTransform="uppercase"
                    letterSpacing="wider"
                  >
                    {expanded ? "Hide details" : "Show details"}
                  </Text>
                  {expanded
                    ? <ChevronUpIcon boxSize={3} color="status.error.fg" />
                    : <ChevronDownIcon boxSize={3} color="status.error.fg" />
                  }
                </HStack>
                <Collapse in={expanded} animateOpacity>
                  <Box
                    mt={2}
                    bg="bg.muted"
                    border="1px solid"
                    borderColor="border.subtle"
                    borderRadius="md"
                    overflow="hidden"
                  >
                    {/* Header strip — "FULL ERROR" label on the left,
                        copy button on the right. Sits OUTSIDE the
                        scrollable area so it stays visible while
                        scrolling through long viem payloads. */}
                    <HStack
                      justify="space-between"
                      align="center"
                      px={2}
                      py={1.5}
                      borderBottom="1px solid"
                      borderColor="border.subtle"
                      bg="surface.sunken"
                    >
                      <Text
                        fontSize="2xs"
                        fontWeight="700"
                        color="text.secondary"
                        textTransform="uppercase"
                        letterSpacing="wider"
                      >
                        Full Error
                      </Text>
                      <CopyButton value={errorText} />
                    </HStack>
                    <Box
                      maxH="200px"
                      overflowY="auto"
                      px={2.5}
                      py={2}
                      css={{
                        "&::-webkit-scrollbar": { width: "6px" },
                        "&::-webkit-scrollbar-track": {
                          background: "var(--chakra-colors-bg-muted)",
                        },
                        "&::-webkit-scrollbar-thumb": {
                          background: "var(--chakra-colors-border-strong)",
                        },
                      }}
                    >
                      <Text
                        fontSize="xs"
                        fontFamily="mono"
                        color="text.secondary"
                        lineHeight="1.55"
                        wordBreak="break-all"
                        whiteSpace="pre-wrap"
                      >
                        {errorDetail}
                      </Text>
                    </Box>
                  </Box>
                </Collapse>
              </>
            )}

            {canRebroadcast && (
              <Button
                size="xs"
                leftIcon={<RepeatIcon />}
                onClick={onRebroadcast}
                isLoading={isRebroadcasting}
                mt={2}
                bg={rebroadcastBg}
                color={rebroadcastFg}
                borderColor={rebroadcastBg}
                _hover={{ bg: rebroadcastBg, opacity: 0.85 }}
                _active={{ bg: rebroadcastBg, opacity: 0.75 }}
              >
                Rebroadcast
              </Button>
            )}
          </Box>
        );
      })()}
    </>
  );
}
