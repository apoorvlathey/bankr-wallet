import { ChevronLeftIcon, ChevronRightIcon } from "@chakra-ui/icons";
import { Badge, Button, Flex, HStack, IconButton } from "@chakra-ui/react";

interface QueueNavigationProps {
  currentIndex: number;
  totalCount: number;
  stripBg: string;
  stripFg: string;
  onNavigate: (direction: "prev" | "next") => void;
  onRejectAll: () => void;
}

/** Shared request-queue navigation; intentionally lives before request identity. */
export function QueueNavigation({
  currentIndex,
  totalCount,
  stripBg,
  stripFg,
  onNavigate,
  onRejectAll,
}: QueueNavigationProps) {
  if (totalCount <= 1) return null;

  return (
    <Flex align="center" justify="center" position="relative">
      <HStack spacing={0}>
        <IconButton
          aria-label="Previous"
          icon={<ChevronLeftIcon />}
          variant="ghost"
          size="xs"
          isDisabled={currentIndex === 0}
          onClick={() => onNavigate("prev")}
          color="text.secondary"
          _hover={{ color: "text.primary", bg: "bg.muted" }}
          minW="32px"
          h="32px"
          p={0}
        />
        <Badge bg={stripBg} color={stripFg} fontSize="xs" px={3} py={1} fontWeight="700">
          {currentIndex + 1}/{totalCount}
        </Badge>
        <IconButton
          aria-label="Next"
          icon={<ChevronRightIcon />}
          variant="ghost"
          size="xs"
          isDisabled={currentIndex + 1 === totalCount}
          onClick={() => onNavigate("next")}
          color="text.secondary"
          _hover={{ color: "text.primary", bg: "bg.muted" }}
          minW="32px"
          h="32px"
          p={0}
        />
      </HStack>
      <Button
        position="absolute"
        right={0}
        size="xs"
        variant="ghost"
        color="status.error.emphasis"
        fontWeight="700"
        _hover={{ bg: "status.error.bg", color: "status.error.fg" }}
        onClick={onRejectAll}
        px={2}
      >
        Reject all
      </Button>
    </Flex>
  );
}
