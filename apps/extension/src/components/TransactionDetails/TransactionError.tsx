import {
  Box,
  Button,
  Collapse,
  Flex,
  HStack,
  Text,
  VStack,
} from "@chakra-ui/react";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  RepeatIcon,
  WarningIcon,
} from "@chakra-ui/icons";
import type { CompletedTransaction } from "@/chrome/txHistoryStorage";
import { CopyButton } from "@/components/CopyButton";

export default function TransactionError({
  tx,
  canRebroadcast,
  isRebroadcasting,
  expanded,
  onToggle,
  onRebroadcast,
}: {
  tx: CompletedTransaction;
  canRebroadcast: boolean;
  isRebroadcasting: boolean;
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
            bg="surface.raised"
            border="1px solid"
            borderColor="border.default"
            borderRadius="lg"
            overflow="hidden"
          >
            <HStack px={3} py={3} spacing={2.5} align="flex-start" role="alert">
              <Flex
                boxSize="28px"
                flexShrink={0}
                align="center"
                justify="center"
                borderRadius="full"
                bg="status.error.bg"
                color="status.error.fg"
              >
                <WarningIcon boxSize="13px" aria-hidden />
              </Flex>
              <VStack spacing={0.5} align="stretch" minW={0} pt={0.5}>
                <Text color="fg.primary" fontSize="sm" fontWeight="700">
                  Transaction failed
                </Text>
                <Text
                  color="fg.secondary"
                  fontSize="xs"
                  fontWeight="500"
                  lineHeight="1.45"
                  overflowWrap="anywhere"
                >
                  {errorShort}
                </Text>
              </VStack>
            </HStack>

            {hasDetail && (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  w="full"
                  minH="40px"
                  h="40px"
                  px={3}
                  borderTop="1px solid"
                  borderTopColor="border.subtle"
                  borderRadius="0"
                  justifyContent="space-between"
                  color="fg.secondary"
                  fontSize="xs"
                  onClick={onToggle}
                  aria-expanded={expanded}
                  rightIcon={
                    expanded ? (
                      <ChevronUpIcon boxSize={3.5} aria-hidden />
                    ) : (
                      <ChevronDownIcon boxSize={3.5} aria-hidden />
                    )
                  }
                  _hover={{ bg: "surface.raisedHover", color: "fg.primary" }}
                >
                  {expanded ? "Hide technical details" : "Technical details"}
                </Button>
                <Collapse in={expanded} animateOpacity>
                  <Box
                    borderTop="1px solid"
                    borderColor="border.subtle"
                    bg="surface.sunken"
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
                    >
                      <Text
                        fontSize="2xs"
                        fontWeight="700"
                        color="fg.secondary"
                      >
                        Full error
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
                        color="fg.secondary"
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
              <Box
                display="flex"
                justifyContent="flex-end"
                px={3}
                py={3}
                borderTop="1px solid"
                borderColor="border.subtle"
              >
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<RepeatIcon boxSize="14px" aria-hidden />}
                  onClick={onRebroadcast}
                  isLoading={isRebroadcasting}
                >
                  Rebroadcast
                </Button>
              </Box>
            )}
          </Box>
        );
      })()}
    </>
  );
}
