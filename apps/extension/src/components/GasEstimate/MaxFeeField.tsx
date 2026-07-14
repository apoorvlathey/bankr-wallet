import { useId, useRef } from "react";
import {
  Box,
  FormControl,
  FormLabel,
  HStack,
  Icon,
  Input,
  Text,
  Tooltip,
  usePrefersReducedMotion,
} from "@chakra-ui/react";

const ChainLinkIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
  </Icon>
);

const PencilIcon = (props: any) => (
  <Icon viewBox="0 0 24 24" fill="currentColor" {...props}>
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
  </Icon>
);

interface MaxFeeFieldProps {
  value: string;
  onChange: (value: string) => void;
  isInvalid: boolean;
  isManual: boolean;
  onEnableEdit: () => void;
  onRelink: () => void;
}

/** Full-width computed/manual Max Fee field with an explicit mode control. */
export function MaxFeeField({
  value,
  onChange,
  isInvalid,
  isManual,
  onEnableEdit,
  onRelink,
}: MaxFeeFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const prefersReducedMotion = usePrefersReducedMotion();

  const handleEnableEdit = () => {
    onEnableEdit();
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  return (
    <FormControl isInvalid={isInvalid} minW={0}>
      <HStack
        justify="space-between"
        spacing={2}
        minW={0}
        minH={isManual ? "24px" : "18px"}
      >
        <HStack spacing={1} minW={0}>
          <FormLabel
            htmlFor={inputId}
            m={0}
            fontSize="2xs"
            color="text.tertiary"
            fontWeight="600"
            lineHeight="short"
          >
            Max fee
          </FormLabel>
          {isManual ? (
            <Tooltip
              label="Restore automatic Max Fee calculation."
              fontSize="2xs"
              hasArrow
              openDelay={300}
            >
              <HStack
                as="button"
                type="button"
                aria-label="Restore automatic Max Fee"
                onClick={onRelink}
                spacing={1}
                minH="24px"
                px={1}
                borderRadius="md"
                color="text.tertiary"
                cursor="pointer"
                _hover={{ color: "text.secondary", bg: "surface.raisedHover" }}
                _active={{ bg: "surface.sunken" }}
                _focus={{ outline: "none" }}
                _focusVisible={{ boxShadow: "focus" }}
              >
                <PencilIcon boxSize="9px" />
                <Text fontSize="2xs" fontWeight="700">
                  Edited
                </Text>
              </HStack>
            </Tooltip>
          ) : (
            <Tooltip
              label="Max Fee follows Priority Fee changes."
              fontSize="2xs"
              hasArrow
              openDelay={300}
            >
              <HStack
                spacing={0.5}
                color="text.tertiary"
              >
                <ChainLinkIcon boxSize="9px" />
                <Text fontSize="2xs" fontWeight="700">
                  Auto
                </Text>
              </HStack>
            </Tooltip>
          )}
        </HStack>
        <Text
          flexShrink={0}
          mr={2}
          fontSize="9px"
          lineHeight="shorter"
          color="text.tertiary"
          fontWeight="600"
        >
          Gwei
        </Text>
      </HStack>

      <Box
        position="relative"
        role="group"
        minW={0}
        mt={isManual ? 1 : 0}
      >
        <Input
          id={inputId}
          ref={inputRef}
          size="xs"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          spellCheck={false}
          w="full"
          textAlign="right"
          fontFamily="mono"
          fontWeight="700"
          fontSize="sm"
          isInvalid={isInvalid}
          isReadOnly={!isManual}
          px={3}
          h="40px"
          minH="40px"
          bg={!isManual ? "surface.sunken" : undefined}
          cursor={!isManual ? "default" : "text"}
          sx={{ fontVariantNumeric: "tabular-nums" }}
        />
        {!isManual && (
          <HStack
            as="button"
            type="button"
            aria-label="Edit Max Fee manually"
            onClick={handleEnableEdit}
            spacing={1}
            position="absolute"
            right={2}
            top="50%"
            minH="28px"
            px={2}
            borderRadius="md"
            bg="surface.raisedHover"
            color="accent.highlight"
            cursor="pointer"
            opacity={0}
            pointerEvents="none"
            transform={
              prefersReducedMotion
                ? "translateY(-50%)"
                : "translateY(-50%) translateX(6px)"
            }
            transition={
              prefersReducedMotion
                ? "none"
                : "opacity 140ms cubic-bezier(0.23, 1, 0.32, 1), transform 140ms cubic-bezier(0.23, 1, 0.32, 1)"
            }
            _groupHover={{
              opacity: 1,
              pointerEvents: "auto",
              transform: "translateY(-50%) translateX(0)",
            }}
            _groupFocusWithin={{
              opacity: 1,
              pointerEvents: "auto",
              transform: "translateY(-50%) translateX(0)",
            }}
            _focus={{ outline: "none" }}
            _focusVisible={{
              opacity: 1,
              pointerEvents: "auto",
              transform: "translateY(-50%) translateX(0)",
              boxShadow: "focus",
            }}
          >
            <PencilIcon boxSize="9px" />
            <Text fontSize="2xs" fontWeight="700">
              Edit?
            </Text>
          </HStack>
        )}
      </Box>
    </FormControl>
  );
}
