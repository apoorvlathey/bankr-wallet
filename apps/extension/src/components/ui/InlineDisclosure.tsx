import {
  Box,
  Flex,
  Text,
  chakra,
  usePrefersReducedMotion,
  type HTMLChakraProps,
} from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import {
  forwardRef,
  useState,
  type ReactNode,
  type SyntheticEvent,
} from "react";

const Details = chakra("details");
const Summary = chakra("summary");

export interface InlineDisclosureProps
  extends Omit<HTMLChakraProps<"details">, "title" | "open" | "onToggle"> {
  label: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  autoScrollOnOpen?: boolean;
  autoScrollBlock?: ScrollLogicalPosition;
}

/** Native details/summary disclosure that keeps its child tree mounted. */
export const InlineDisclosure = forwardRef<
  HTMLDetailsElement,
  InlineDisclosureProps
>(function InlineDisclosure(
  {
    label,
    description,
    meta,
    defaultOpen = false,
    open,
    onOpenChange,
    autoScrollOnOpen = false,
    autoScrollBlock = "start",
    children,
    ...rest
  },
  ref,
) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;
  const expanded = open ?? uncontrolledOpen;
  const prefersReducedMotion = usePrefersReducedMotion();

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const nextOpen = event.currentTarget.open;
    const disclosure = event.currentTarget;
    if (!isControlled) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
    if (nextOpen && autoScrollOnOpen) {
      requestAnimationFrame(() => {
        if (!disclosure.open) return;
        disclosure.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: autoScrollBlock,
        });
      });
    }
  };

  return (
    <Details
      ref={ref}
      {...rest}
      open={expanded}
      onToggle={handleToggle}
      w="full"
      minW={0}
      borderTopWidth="1px"
      borderTopStyle="solid"
      borderTopColor="border.subtle"
    >
      <Summary
        aria-expanded={expanded}
        minH="44px"
        px={2}
        py={2.5}
        display="flex"
        alignItems="center"
        gap={2}
        color="fg.primary"
        cursor="pointer"
        listStyleType="none"
        borderRadius="md"
        _hover={{ bg: "surface.raisedHover" }}
        _focus={{ outline: "none" }}
        _focusVisible={{ boxShadow: "focus" }}
        sx={{ "&::-webkit-details-marker": { display: "none" } }}
      >
        <Box flex="1 1 auto" minW={0}>
          <Text fontSize="sm" fontWeight="600" overflowWrap="anywhere">
            {label}
          </Text>
          {description && (
            <Box color="fg.secondary" fontSize="xs" mt={0.5} overflowWrap="anywhere">
              {description}
            </Box>
          )}
        </Box>
        {meta && (
          <Flex flex="0 1 auto" minW={0} color="fg.secondary" fontSize="xs">
            {meta}
          </Flex>
        )}
        <ChevronDownIcon
          boxSize={5}
          flexShrink={0}
          color="fg.secondary"
          transform={expanded ? "rotate(180deg)" : "rotate(0deg)"}
          transitionProperty="transform"
          transitionDuration="fast"
          aria-hidden
        />
      </Summary>
      <Box pb={3} minW={0}>
        {children}
      </Box>
    </Details>
  );
});
