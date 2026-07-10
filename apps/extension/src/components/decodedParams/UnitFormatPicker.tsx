import { useRef } from "react";
import { CheckIcon, ChevronDownIcon } from "@chakra-ui/icons";
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
  VStack,
  useDisclosure,
} from "@chakra-ui/react";
import { ethFormatOptions, type ETHSelectedOption } from "@/lib/convertUtils";
import { useTheme } from "@/theme";

export function UnitFormatPicker({
  selected,
  onSelect,
}: {
  selected: ETHSelectedOption;
  onSelect: (option: ETHSelectedOption) => void;
}) {
  const { tokens } = useTheme();
  const sheet = useDisclosure();
  const triggerRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        size="xs"
        minH="28px"
        h="28px"
        px={2}
        fontSize="xs"
        fontWeight="600"
        variant="outline"
        rightIcon={<ChevronDownIcon boxSize={3} aria-hidden />}
        aria-haspopup="dialog"
        aria-expanded={sheet.isOpen}
        onClick={sheet.onOpen}
      >
        {selected}
      </Button>
      <Drawer
        isOpen={sheet.isOpen}
        onClose={sheet.onClose}
        placement="bottom"
        finalFocusRef={triggerRef}
        returnFocusOnClose
      >
        <DrawerOverlay />
        <DrawerContent
          maxH="min(76dvh, 580px)"
          borderTop={tokens.borders.thin}
          borderColor="border.default"
          borderTopRadius={tokens.radii.modal}
        >
          <DrawerCloseButton aria-label="Close number format picker" boxSize="44px" />
          <DrawerHeader px={4} pt={5} pb={2} pr={16}>
            <Text as="h2" fontSize="lg">Display number as</Text>
          </DrawerHeader>
          <DrawerBody px={4} pt={1} pb="calc(16px + env(safe-area-inset-bottom, 0px))">
            <VStack as="ul" align="stretch" spacing={0} m={0} listStyleType="none">
              {ethFormatOptions.map((option, index) => {
                const isSelected = option === selected;
                return (
                  <Box
                    as="li"
                    key={option}
                    borderBottomWidth={index < ethFormatOptions.length - 1 ? "1px" : 0}
                    borderColor="border.subtle"
                  >
                    <Button
                      type="button"
                      variant="ghost"
                      w="full"
                      minH="44px"
                      h="auto"
                      px={3}
                      justifyContent="flex-start"
                      bg={isSelected ? "surface.accentTint" : "transparent"}
                      aria-pressed={isSelected}
                      onClick={() => {
                        onSelect(option);
                        sheet.onClose();
                      }}
                    >
                      <HStack w="full" justify="space-between">
                        <Text fontSize="md">{option}</Text>
                        {isSelected && <CheckIcon color="accent.secondary" boxSize={3.5} />}
                      </HStack>
                    </Button>
                  </Box>
                );
              })}
            </VStack>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
    </>
  );
}
