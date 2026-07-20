import { useEffect, useRef } from "react";
import { Box, Button, Spinner } from "@chakra-ui/react";

interface ProgressiveListSentinelProps {
  remainingCount: number;
  onLoadMore: () => void;
}

export function ProgressiveListSentinel({
  remainingCount,
  onLoadMore,
}: ProgressiveListSentinelProps) {
  const sentinelRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || typeof IntersectionObserver === "undefined") return;
    const scrollOwner = sentinel.closest("[data-screen-scroll-owner]");
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) onLoadMore();
      },
      {
        root: scrollOwner instanceof Element ? scrollOwner : null,
        rootMargin: "240px 0px",
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [onLoadMore]);

  return (
    <Box ref={sentinelRef} as="li" listStyleType="none" w="full">
      <Button
        w="full"
        minH="52px"
        borderRadius={0}
        variant="ghost"
        color="fg.secondary"
        fontSize="sm"
        fontWeight={500}
        leftIcon={<Spinner boxSize="12px" thickness="2px" />}
        onClick={onLoadMore}
      >
        Load more assets ({remainingCount})
      </Button>
    </Box>
  );
}
