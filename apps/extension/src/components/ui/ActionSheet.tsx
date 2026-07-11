import {
  forwardRef,
  type ReactElement,
  type ReactNode,
} from "react";
import { CheckIcon } from "@chakra-ui/icons";
import {
  Box,
  Button,
  Drawer,
  DrawerBody,
  DrawerCloseButton,
  DrawerContent,
  DrawerHeader,
  DrawerOverlay,
  HStack,
  Text,
  VisuallyHidden,
  VStack,
  usePrefersReducedMotion,
  type DrawerProps,
} from "@chakra-ui/react";
import { useTheme } from "@/theme";

export interface ActionSheetChoice {
  /** Stable value passed to `onSelect`. */
  id: string;
  /** Concise action label. */
  label: ReactNode;
  /** Optional supporting copy explaining the action or its consequence. */
  description?: ReactNode;
  /** Optional decorative icon. Its accessible name comes from `label`. */
  icon?: ReactElement;
  /** Marks the current choice without changing the button's semantics. */
  isSelected?: boolean;
  /** Uses the error intent for an explicitly destructive action. */
  isDestructive?: boolean;
  isDisabled?: boolean;
}

export interface ActionSheetProps {
  isOpen: boolean;
  onClose: DrawerProps["onClose"];
  title: ReactNode;
  description?: ReactNode;
  /** Optional non-choice utility content rendered beneath the actions. */
  footer?: ReactNode;
  /**
   * Two through six simple choices. Longer, searchable, or grouped sets belong
   * in a full-screen picker. Kept as an array so mapped domain data needs no
   * tuple cast at the presentation boundary.
   */
  choices: readonly ActionSheetChoice[];
  onSelect: (choiceId: string) => void;
  /** Explicit focus destination after dismissal; otherwise Chakra restores the trigger. */
  finalFocusRef?: DrawerProps["finalFocusRef"];
  /** Safe default for this non-blocking surface. */
  closeOnEsc?: boolean;
  /** Safe default for this non-blocking surface. */
  closeOnOverlayClick?: boolean;
}

/**
 * A single-step, mobile-style choice surface for two through six contextual
 * actions. Search, configuration, forms, and multistep flows belong on pushed
 * screens instead.
 */
export const ActionSheet = forwardRef<HTMLElement, ActionSheetProps>(
  function ActionSheet(
    {
      isOpen,
      onClose,
      title,
      description,
      footer,
      choices,
      onSelect,
      finalFocusRef,
      closeOnEsc = true,
      closeOnOverlayClick = true,
    },
    ref,
  ) {
    const { tokens } = useTheme();
    const prefersReducedMotion = usePrefersReducedMotion();

    const reducedMotionProps = prefersReducedMotion
      ? {
          variants: {
            enter: {
              opacity: 1,
              x: 0,
              y: 0,
              transition: { duration: 0.1 },
            },
            exit: {
              opacity: 0,
              x: 0,
              y: 0,
              transition: { duration: 0.08 },
            },
          },
        }
      : undefined;

    return (
      <Drawer
        isOpen={isOpen}
        placement="bottom"
        onClose={onClose}
        finalFocusRef={finalFocusRef}
        closeOnEsc={closeOnEsc}
        closeOnOverlayClick={closeOnOverlayClick}
        returnFocusOnClose
        trapFocus
      >
        <DrawerOverlay />
        <DrawerContent
          ref={ref}
          maxH="min(80vh, 640px)"
          bg="transparent"
          boxShadow="none"
          pointerEvents="none"
          motionProps={reducedMotionProps}
        >
          <Box
            position="relative"
            display="flex"
            flexDirection="column"
            w="full"
            maxW="prose"
            maxH="min(80vh, 640px)"
            mx="auto"
            bg="surface.raised"
            borderTop={tokens.borders.thin}
            borderColor="border.default"
            borderTopRadius={tokens.radii.modal}
            overflow="hidden"
            pointerEvents="auto"
          >
            <DrawerCloseButton
              aria-label="Close action sheet"
              top={2}
              right={2}
              boxSize="44px"
            />

            <DrawerHeader px={4} pt={5} pb={description ? 1 : 3} pr={16}>
              <Box as="h2" fontSize="lg" lineHeight="1.3">
                {title}
              </Box>
            </DrawerHeader>

            <DrawerBody
              px={4}
              pt={description ? 2 : 1}
              pb="calc(16px + env(safe-area-inset-bottom, 0px))"
              overflowY="auto"
              overscrollBehavior="contain"
            >
              {description && (
                <Box color="fg.secondary" fontSize="sm" lineHeight="1.45" mb={3}>
                  {description}
                </Box>
              )}

              <VStack as="ul" align="stretch" spacing={0} m={0} listStyleType="none">
                {choices.map((choice, index) => (
                  <Box
                    as="li"
                    key={choice.id}
                    borderBottomWidth={index < choices.length - 1 ? "1px" : "0"}
                    borderColor="border.subtle"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      w="full"
                      h="auto"
                      minH={choice.description ? "64px" : "56px"}
                      px={3}
                      py={3}
                      justifyContent="flex-start"
                      borderRadius={tokens.radii.button}
                      color={choice.isDestructive ? "status.error.fg" : "fg.primary"}
                      bg={
                        choice.isDestructive && tokens.colorMode !== "dark"
                          ? "status.error.bg"
                          : choice.isSelected
                            ? "surface.accentTint"
                            : "transparent"
                      }
                      whiteSpace="normal"
                      isDisabled={choice.isDisabled}
                      data-selected={choice.isSelected ? "true" : undefined}
                      data-destructive={choice.isDestructive ? "true" : undefined}
                      _hover={{
                        bg: choice.isDestructive
                          ? "status.error.bg"
                          : choice.isSelected
                            ? "surface.accentTint"
                            : "surface.raisedHover",
                        color: choice.isDestructive ? "status.error.fg" : "fg.primary",
                      }}
                      _active={{
                        bg: choice.isDestructive
                          ? "status.error.bg"
                          : choice.isSelected
                            ? "surface.accentTint"
                            : "surface.sunken",
                        color: choice.isDestructive ? "status.error.fg" : "fg.primary",
                      }}
                      _focusVisible={{
                        boxShadow: tokens.shadows.focus,
                        outline: "none",
                      }}
                      _disabled={{
                        color: choice.isDestructive ? "status.error.fg" : "fg.muted",
                        cursor: "not-allowed",
                        opacity: 0.55,
                      }}
                      onClick={() => {
                        onSelect(choice.id);
                        onClose();
                      }}
                    >
                      <HStack w="full" spacing={3} align="center">
                        {choice.icon && (
                          <Box
                            aria-hidden="true"
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            boxSize="24px"
                            flexShrink={0}
                          >
                            {choice.icon}
                          </Box>
                        )}

                      <VStack flex={1} minW={0} align="stretch" spacing={0} textAlign="left">
                        <Text fontSize="md" lineHeight="1.5">
                          {choice.label}
                        </Text>
                        {choice.description && (
                          <Text
                            color={choice.isDisabled ? "fg.muted" : "fg.secondary"}
                            fontSize="sm"
                            fontWeight="400"
                            lineHeight="1.45"
                            textTransform="none"
                            letterSpacing="normal"
                          >
                            {choice.description}
                          </Text>
                        )}
                      </VStack>

                      {choice.isSelected && (
                        <Box
                          color="accent.secondary"
                          display="flex"
                          alignItems="center"
                          justifyContent="center"
                          boxSize="24px"
                          flexShrink={0}
                        >
                          <CheckIcon aria-hidden="true" boxSize="14px" />
                          <VisuallyHidden>Selected</VisuallyHidden>
                        </Box>
                      )}
                      </HStack>
                    </Button>
                  </Box>
                ))}
              </VStack>

              {footer && (
                <Box mt={3} pt={3} borderTopWidth="1px" borderColor="border.subtle">
                  {footer}
                </Box>
              )}
            </DrawerBody>
          </Box>
        </DrawerContent>
      </Drawer>
    );
  },
);
