import { ChevronDownIcon } from "@chakra-ui/icons";
import { Button, HStack, Image, Text } from "@chakra-ui/react";
import type { RefObject } from "react";
import type { PortfolioToken } from "@/chrome/portfolio/api";
import { TokenSymbolFallback } from "./TokenSymbolFallback";

interface TokenSelectorTriggerProps {
  triggerRef: RefObject<HTMLButtonElement>;
  isOpen: boolean;
  selectedToken: PortfolioToken | null;
  resolveLogo: (url: string | undefined) => string | undefined;
  contentAlign: "left" | "right";
  onClick: () => void;
}

export function TokenSelectorTrigger({
  triggerRef,
  isOpen,
  selectedToken,
  resolveLogo,
  contentAlign,
  onClick,
}: TokenSelectorTriggerProps) {
  return (
    <Button
      ref={triggerRef}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      variant="outline"
      h="44px"
      minW={0}
      px={3}
      borderWidth="1px"
      borderColor="border.default"
      bg="surface.raised"
      justifyContent={contentAlign === "right" ? "flex-end" : "flex-start"}
      _hover={{ bg: "surface.raisedHover", borderColor: "border.strong" }}
      onClick={onClick}
    >
      <HStack minW={0} spacing={2}>
        {selectedToken &&
          (selectedToken.logoUrl ? (
            <Image
              src={resolveLogo(selectedToken.logoUrl)}
              alt=""
              boxSize="22px"
              borderRadius="full"
              fallback={<TokenSymbolFallback symbol={selectedToken.symbol} size="22px" />}
            />
          ) : (
            <TokenSymbolFallback symbol={selectedToken.symbol} size="22px" />
          ))}
        <Text minW={0} fontWeight="600" fontSize="md" noOfLines={1}>
          {selectedToken?.symbol || "Select token"}
        </Text>
        <ChevronDownIcon flexShrink={0} color="fg.muted" />
      </HStack>
    </Button>
  );
}
